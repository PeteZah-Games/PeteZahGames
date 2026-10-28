import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAdmin } from './admin-users.js';
import { getClientIP } from '../utils/client-ip.js';
import { toIPv4 } from '../middleware/security.js';

const NOTE_MAX = 80;
const LABEL_MAX = 64;
const LIST_CAP = 500;
const CACHE_MS = 15000;
const CACHE_MAX = 512;
const ID_RE = /^[a-f0-9]{32}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{2,32}$/;

const hitCache = new Map();

export const premiumAdminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
});

export const premiumStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ adFree: false }),
});

export function normalizePremiumIp(raw) {
  if (typeof raw !== 'string') return '';
  let ip = raw.trim();
  if (!ip || ip.length > 64) return '';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return '';
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return '';
  const [a, b] = parts;
  if (a === 0 || a === 127 || a >= 224) return '';
  if (a === 169 && b === 254) return '';
  if (a === 100 && b >= 64 && b <= 127) return '';
  return parts.join('.');
}

function cleanNote(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') return null;
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NOTE_MAX);
}

function bumpCache(key, value) {
  if (hitCache.size > CACHE_MAX) hitCache.clear();
  hitCache.set(key, { at: Date.now(), value: !!value });
}

function dropCache() {
  hitCache.clear();
}

function cached(key) {
  const hit = hitCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    hitCache.delete(key);
    return null;
  }
  return hit.value;
}

function clientIp(req) {
  return normalizePremiumIp(getClientIP(req) || toIPv4(null, req) || '') || '';
}

<<<<<<< HEAD
/** Lightweight check used by ads gate + status endpoint. */
=======
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
export function isAdFreeRequest(req) {
  try {
    const uid = req.session?.user?.id;
    if (uid && typeof uid === 'string' && uid.length <= 64) {
      const uk = `u:${uid}`;
      const uHit = cached(uk);
      if (uHit != null) {
        if (uHit) return true;
      } else {
        const row = db.prepare(
          "SELECT 1 AS ok FROM premium_ad_free WHERE kind = 'user' AND value = ? LIMIT 1"
        ).get(uid);
        const ok = !!row;
        bumpCache(uk, ok);
        if (ok) return true;
      }
    }

    const ip = clientIp(req);
    if (!ip) return false;
    const ik = `i:${ip}`;
    const iHit = cached(ik);
    if (iHit != null) return iHit;
    const row = db.prepare(
      "SELECT 1 AS ok FROM premium_ad_free WHERE kind = 'ip' AND value = ? LIMIT 1"
    ).get(ip);
    const ok = !!row;
    bumpCache(ik, ok);
    return ok;
  } catch {
    return false;
  }
}

function publicRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label || row.value,
    note: row.note || '',
    created_at: row.created_at,
  };
}

function sameSiteWrite(req) {
  const origin = req.get('origin');
  const host = req.get('host');
  if (!host) return false;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  const site = String(req.get('sec-fetch-site') || '');
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false;
  const type = String(req.get('content-type') || '');
  if (!type.toLowerCase().includes('application/json')) return false;
  return true;
}

export function adsStatusHandler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=10');
  return res.json({ adFree: isAdFreeRequest(req) });
}

export function listPremiumHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare(
    'SELECT id, kind, value, label, note, created_at FROM premium_ad_free ORDER BY created_at DESC LIMIT ?'
  ).all(LIST_CAP);
  return res.json({ entries: rows.map(publicRow) });
}

export function createPremiumHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!sameSiteWrite(req)) return res.status(403).json({ error: 'Forbidden' });

  const kind = typeof req.body?.kind === 'string' ? req.body.kind.trim().toLowerCase() : '';
  const raw = typeof req.body?.value === 'string' ? req.body.value.trim() : '';
  const note = cleanNote(req.body?.note);
  if (note == null) return res.status(400).json({ error: 'Invalid note' });
  if (kind !== 'user' && kind !== 'ip') {
    return res.status(400).json({ error: 'kind must be user or ip' });
  }
  if (!raw || raw.length > 64) return res.status(400).json({ error: 'Invalid value' });

  const { c: total } = db.prepare('SELECT COUNT(*) as c FROM premium_ad_free').get();
  if (total >= LIST_CAP) {
    return res.status(400).json({ error: 'Premium list is full' });
  }

  let value = '';
  let label = '';

  if (kind === 'ip') {
    value = normalizePremiumIp(raw);
    if (!value) return res.status(400).json({ error: 'Invalid IP address' });
    label = value;
  } else {
    let user = null;
    if (ID_RE.test(raw)) {
      user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(raw);
    } else if (USERNAME_RE.test(raw)) {
      user = db.prepare(
        'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)'
      ).get(raw);
    } else {
      return res.status(400).json({ error: 'Use a username or user id' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    value = user.id;
    label = String(user.username || user.id).slice(0, LABEL_MAX);
  }

  const existing = db.prepare(
    'SELECT id FROM premium_ad_free WHERE kind = ? AND value = ?'
  ).get(kind, value);
  if (existing) return res.status(409).json({ error: 'Already on the premium list' });

  const id = randomBytes(16).toString('hex');
  const now = Date.now();
  db.prepare(
    `INSERT INTO premium_ad_free (id, kind, value, label, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, kind, value, label, note, req.session.user.id, now);

  dropCache();
  const row = db.prepare(
    'SELECT id, kind, value, label, note, created_at FROM premium_ad_free WHERE id = ?'
  ).get(id);
  return res.status(201).json({ entry: publicRow(row) });
}

export function deletePremiumHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!sameSiteWrite(req)) return res.status(403).json({ error: 'Forbidden' });

  const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });

  const info = db.prepare('DELETE FROM premium_ad_free WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  dropCache();
  return res.json({ ok: true });
}
