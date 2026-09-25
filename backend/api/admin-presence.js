import { randomUUID } from 'crypto';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { reportGamePresence, clearGamePresence, sanitizeGameId } from './game-stats.js';
import { trackProxyHosts } from './achievements.js';
import { bumpProxySession } from '../utils/usage-daily.js';
import { toIPv4 } from '../middleware/security.js';
import {
  createMentionNotifications,
  parseTargetIps,
  serializeTargetIps,
  parseStoredTargetIps,
  ipInTargetList,
} from '../utils/mentions.js';

const STALE_MS = 30000;
const MAX_CLIENTS = 4000;
const MAX_URLS_PER_CLIENT = 4;
const MAX_URL_LEN = 180;
const ADMIN_SITE_LIMIT = 250;

const clients = new Map();

function requireAdmin(req, res) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(req.session.user.id);
  if (!row) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = isOwnerEmail(row.email);
  let level = row.is_admin || 0;
  if (owner && level < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(req.session.user.id);
    level = 3;
  }
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return { is_admin: Math.max(level, owner ? 3 : level), is_owner: owner };
}

function compactUrl(raw) {
  if (typeof raw !== 'string') return null;
  let u = raw.trim().slice(0, MAX_URL_LEN);
  if (!/^https?:\/\//i.test(u) && !/^petezah:\/\//i.test(u)) return null;
  if (/^petezah:\/\//i.test(u)) return u.slice(0, MAX_URL_LEN);
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    let out = parsed.toString();
    if (out.endsWith('/') && parsed.pathname === '/') out = out.slice(0, -1);
    return out.slice(0, MAX_URL_LEN);
  } catch {
    return u;
  }
}

function prunePresence() {
  const now = Date.now();
  for (const [id, entry] of clients) {
    if (now - entry.t > STALE_MS) clients.delete(id);
  }
  if (clients.size <= MAX_CLIENTS) return;
  const sorted = [...clients.entries()].sort((a, b) => a[1].t - b[1].t);
  const drop = clients.size - MAX_CLIENTS;
  for (let i = 0; i < drop; i++) clients.delete(sorted[i][0]);
}

export function reportPresenceHandler(req, res) {
  const urlsRaw = req.body?.urls;
  if (!Array.isArray(urlsRaw)) return res.status(400).json({ error: 'Invalid urls' });

  const urls = [];
  const seen = new Set();
  for (const item of urlsRaw) {
    if (urls.length >= MAX_URLS_PER_CLIENT) break;
    const c = compactUrl(item);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    urls.push(c);
  }

  let clientId = typeof req.body?.clientId === 'string' ? req.body.clientId.slice(0, 36) : '';
  if (!clientId && req.sessionID) clientId = String(req.sessionID).slice(0, 36);
  if (!clientId) clientId = randomUUID().slice(0, 36);

  const user = req.session?.user;
  const uname =
    typeof user?.username === 'string' && user.username
      ? user.username.slice(0, 24)
      : '';

  clients.set(clientId, {
    u: urls,
    n: uname,
    t: Date.now(),
  });

  if (urls.length) {
    try {
      bumpProxySession(clientId);
    } catch {}
  }

  if (user?.id && urls.length) {
    try {
      trackProxyHosts(user.id, urls);
    } catch {}
  }

  const game = req.body?.game;
  if (game && typeof game === 'object') {
    const surface = game.surface === 'list' || game.surface === 'viewer' ? game.surface : null;
    if (surface) {
      reportGamePresence(clientId, {
        surface,
        gameId: typeof game.gameId === 'string' ? sanitizeGameId(game.gameId) : null,
        label: typeof game.label === 'string' ? game.label.slice(0, 120) : null,
        username: uname,
      });
    }
  } else if (req.body?.game === null) {
    clearGamePresence(clientId);
  }

  if (clients.size > MAX_CLIENTS || Math.random() < 0.05) prunePresence();

  res.json({ ok: true, clientId });
}

export function getLiveSitesHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  prunePresence();

  const agg = new Map();
  for (const entry of clients.values()) {
    for (const url of entry.u || []) {
      let row = agg.get(url);
      if (!row) {
        row = { url, viewers: 0, username: null, updatedAt: 0 };
        agg.set(url, row);
      }
      row.viewers += 1;
      if (entry.t > row.updatedAt) {
        row.updatedAt = entry.t;
        if (entry.n) row.username = entry.n;
      }
    }
  }

  const sites = [...agg.values()]
    .sort((a, b) => b.viewers - a.viewers || b.updatedAt - a.updatedAt)
    .slice(0, ADMIN_SITE_LIMIT);

  res.json({
    sites,
    clients: clients.size,
    unique: agg.size,
    updatedAt: Date.now(),
  });
}

export function listAnnouncementsHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.content, a.active, a.important, a.created_by, a.created_at, a.updated_at,
              a.target_user_id, a.target_ips, u.username as target_username
       FROM announcements a
       LEFT JOIN users u ON u.id = a.target_user_id
       ORDER BY a.created_at DESC LIMIT 50`
    )
    .all();
  res.json({
    announcements: rows.map((r) => ({
      ...r,
      target_ips: parseStoredTargetIps(r.target_ips),
    })),
  });
}

export function getActiveAnnouncementHandler(req, res) {
  const uid = req.session?.user?.id || null;
  const ip = toIPv4(null, req);
  const byId = new Map();

  if (uid) {
    const targeted = db
      .prepare(
        `SELECT id, title, content, important, created_at, target_user_id, target_ips FROM announcements
         WHERE active = 1 AND target_user_id = ?
         ORDER BY created_at DESC LIMIT 8`
      )
      .all(uid);
    for (const row of targeted) byId.set(row.id, row);
  }

  const ipCandidates = db
    .prepare(
      `SELECT id, title, content, important, created_at, target_user_id, target_ips FROM announcements
       WHERE active = 1 AND target_ips IS NOT NULL AND target_ips != ''
       ORDER BY created_at DESC LIMIT 40`
    )
    .all();
  for (const row of ipCandidates) {
    if (ipInTargetList(ip, row.target_ips)) byId.set(row.id, row);
  }

  const globals = db
    .prepare(
      `SELECT id, title, content, important, created_at, target_user_id, target_ips FROM announcements
       WHERE active = 1
         AND (target_user_id IS NULL OR target_user_id = '')
         AND (target_ips IS NULL OR target_ips = '')
       ORDER BY created_at DESC LIMIT 8`
    )
    .all();
  for (const row of globals) byId.set(row.id, row);

  const announcements = [...byId.values()]
    .sort((a, b) => {
      const ia = a.important ? 1 : 0;
      const ib = b.important ? 1 : 0;
      if (ib !== ia) return ib - ia;
      return (b.created_at || 0) - (a.created_at || 0);
    })
    .slice(0, 12)
    .map(({ target_ips, ...rest }) => rest);

  res.json({
    announcements,
    announcement: announcements[0] || null,
  });
}

export function createAnnouncementHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 4000) : '';
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
  const important = req.body?.important ? 1 : 0;

  let targetUserId = null;
  const targetRaw =
    typeof req.body?.targetUserId === 'string'
      ? req.body.targetUserId.trim()
      : typeof req.body?.targetUsername === 'string'
        ? req.body.targetUsername.trim()
        : '';
  if (targetRaw) {
    const handle = targetRaw.replace(/^@/, '').slice(0, 32);
    const found = db
      .prepare(
        `SELECT id FROM users WHERE id = ? OR lower(username) = lower(?) OR lower(email) = lower(?) LIMIT 1`
      )
      .get(handle, handle, handle);
    if (!found) return res.status(404).json({ error: 'Target user not found' });
    targetUserId = found.id;
  }

  const targetIps = parseTargetIps(req.body?.targetIps ?? req.body?.target_ips ?? '');
  const targetIpsJson = serializeTargetIps(targetIps);

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO announcements (id, title, content, active, important, created_by, created_at, updated_at, target_user_id, target_ips)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, content, important, req.session.user.id, now, now, targetUserId, targetIpsJson);

  createMentionNotifications({
    actorId: req.session.user.id,
    title,
    text: content,
    refType: 'announcement',
    refId: id,
    preview: content,
  });

  const row = db
    .prepare(
      `SELECT a.*, u.username as target_username
       FROM announcements a LEFT JOIN users u ON u.id = a.target_user_id
       WHERE a.id = ?`
    )
    .get(id);
  res.status(201).json({
    announcement: {
      ...row,
      target_ips: parseStoredTargetIps(row.target_ips),
    },
  });
}

export function setAnnouncementActiveHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const active = req.body?.active ? 1 : 0;
  const existing = db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE announcements SET active = ?, updated_at = ? WHERE id = ?').run(
    active,
    Date.now(),
    id
  );
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  res.json({ announcement: row });
}
