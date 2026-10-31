import { randomBytes } from 'crypto';
import db from '../db.js';
import { requireAdmin } from './admin-users.js';
import { getClientIP } from '../utils/client-ip.js';
import { toIPv4 } from '../middleware/security.js';
import { isAdFreeRequest } from './premium.js';

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_promo_ads (
      id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      link_url TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT '',
      ips TEXT NOT NULL DEFAULT '',
      active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_custom_promo_active ON custom_promo_ads(active);
  `);
} catch {}

let cache = { at: 0, rows: [] };
const CACHE_MS = 60_000;

function loadActive() {
  const now = Date.now();
  if (now - cache.at < CACHE_MS) return cache.rows;
  try {
    cache = {
      at: now,
      rows: db
        .prepare(
          'SELECT id, image_url, link_url, region, ips FROM custom_promo_ads WHERE active = 1 ORDER BY created_at DESC LIMIT 40'
        )
        .all(),
    };
  } catch {
    cache = { at: now, rows: [] };
  }
  return cache.rows;
}

function bust() {
  cache.at = 0;
}

function parseIps(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clientHints(req) {
  const ip = (getClientIP(req) || toIPv4(null, req) || '').trim();
  const h = req.headers || {};
  const bits = [
    h['cf-ipcountry'],
    h['cf-region'],
    h['cf-region-code'],
    h['cf-ipcity'],
    h['x-vercel-ip-country'],
    h['x-vercel-ip-country-region'],
    h['x-vercel-ip-city'],
    h['x-country-code'],
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  return { ip, bits: bits.join(' ') };
}

function matchRow(row, hints) {
  const ips = parseIps(row.ips);
  if (ips.length && hints.ip && ips.includes(hints.ip)) return true;
  const region = String(row.region || '').trim().toLowerCase();
  if (region && hints.bits) {
    const tokens = region.split(/[\s,/|_-]+/).filter(Boolean);
    if (tokens.length && tokens.every((t) => hints.bits.includes(t))) return true;
  }
  if (!ips.length && !region) return true;
  return false;
}

export function customPromoGetHandler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=60');
  if (isAdFreeRequest(req)) return res.json({ ad: null });
  const hints = clientHints(req);
  const hit = loadActive().find((row) => matchRow(row, hints));
  if (!hit) return res.json({ ad: null });
  return res.json({
    ad: {
      id: hit.id,
      imageUrl: hit.image_url,
      linkUrl: hit.link_url,
    },
  });
}

export function customPromoListHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db
    .prepare(
      'SELECT id, image_url, link_url, region, ips, active, created_at FROM custom_promo_ads ORDER BY created_at DESC LIMIT 100'
    )
    .all();
  res.json({ ok: true, ads: rows });
}

export function customPromoCreateHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const imageUrl = String(req.body?.imageUrl || '').trim().slice(0, 500);
  const linkUrl = String(req.body?.linkUrl || '').trim().slice(0, 500);
  const region = String(req.body?.region || '').trim().slice(0, 80);
  const ips = String(req.body?.ips || '').trim().slice(0, 800);
  if (!/^https?:\/\//i.test(imageUrl) || !/^https?:\/\//i.test(linkUrl)) {
    return res.status(400).json({ error: 'imageUrl and linkUrl must be http(s)' });
  }
  const id = randomBytes(8).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO custom_promo_ads (id, image_url, link_url, region, ips, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(id, imageUrl, linkUrl, region, ips, req.session?.user?.id || 'admin', now);
  bust();
  res.json({ ok: true, id });
}

export function customPromoActiveHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || '');
  const active = req.body?.active ? 1 : 0;
  db.prepare('UPDATE custom_promo_ads SET active = ? WHERE id = ?').run(active, id);
  bust();
  res.json({ ok: true });
}
