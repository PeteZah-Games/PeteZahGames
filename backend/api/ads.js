import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { getClientIP } from '../utils/client-ip.js';
import { toIPv4 } from '../middleware/security.js';
import { getAppPepper } from '../utils/secrets.js';
import { isAdFreeRequest } from './premium.js';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 2;
const CONTEXTS = new Set(['game', 'app', 'vm']);
const lastShown = new Map();
const MAX_KEYS = 20000;
const DEFAULT_VAST = 'https://s.magsrv.com/v1/vast.php?idz=6002278';

export const adsGateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ show: false, reason: 'rate_limit' }),
});

export const adsVastLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'rate_limit' }),
});

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, stamps] of lastShown) {
    const next = (stamps || []).filter((t) => t > cutoff);
    if (next.length) lastShown.set(k, next);
    else lastShown.delete(k);
  }
  if (lastShown.size > MAX_KEYS) {
    const extra = lastShown.size - Math.floor(MAX_KEYS * 0.75);
    const keys = [...lastShown.keys()].slice(0, extra);
    for (const k of keys) lastShown.delete(k);
  }
}

function subjectKey(req) {
  if (req.session?.user?.id) return `u:${req.session.user.id}`;
  if (req.sessionID) return `s:${req.sessionID}`;
  const ip = getClientIP(req) || toIPv4(null, req) || 'anon';
  return `i:${ip}`;
}

function visitorHash(key) {
  const pepper = getAppPepper('ads').slice(0, 64);
  return createHash('sha256').update(`${pepper}\0${key}`).digest('hex').slice(0, 24);
}

function recordAdEvent(kind, context, visitor) {
  try {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const hour = new Date(now).getUTCHours();
    const k = kind === 'shown' ? 'shown' : 'attempt';
    const ctx = CONTEXTS.has(context) ? context : 'game';
    const vis = typeof visitor === 'string' && visitor.length === 24 ? visitor : 'anon';
    db.prepare(
      'INSERT INTO ad_events (ts, day, hour, kind, context, visitor) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(now, day, hour, k, ctx, vis);
    if (Math.random() < 0.02) {
      const cutoff = now - 120 * 24 * 60 * 60 * 1000;
      db.prepare('DELETE FROM ad_events WHERE ts < ?').run(cutoff);
    }
  } catch {}
}

function envOn(name, fallback = 'true') {
  const v = String(process.env[name] ?? fallback).trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

function isVideoAdsEnabled() {
  if (process.env.EXOCLICK_ENABLED != null) return envOn('EXOCLICK_ENABLED');
  if (process.env.ADCASH_ENABLED != null) return envOn('ADCASH_ENABLED');
  return true;
}

function vastUrl() {
  const raw = typeof process.env.EXOCLICK_VAST_URL === 'string'
    ? process.env.EXOCLICK_VAST_URL.trim()
    : '';
  return raw || DEFAULT_VAST;
}

export async function adsGateHandler(req, res) {
  if (!isVideoAdsEnabled()) {
    return res.json({ show: false, reason: 'disabled' });
  }

  if (isAdFreeRequest(req)) {
    return res.json({ show: false, reason: 'premium' });
  }

  const context = typeof req.body?.context === 'string'
    ? req.body.context.trim().toLowerCase()
    : '';
  if (!CONTEXTS.has(context)) {
    return res.status(400).json({ show: false, reason: 'invalid_context' });
  }

  prune();
  const key = subjectKey(req);
  const now = Date.now();
  const stamps = (lastShown.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (stamps.length >= MAX_PER_WINDOW) {
    const oldest = Math.min(...stamps);
    return res.json({
      show: false,
      reason: 'cooldown',
      retryAfterMs: WINDOW_MS - (now - oldest),
      cooldownMs: WINDOW_MS,
    });
  }

  lastShown.set(key, stamps);
  recordAdEvent('attempt', context, visitorHash(key));

  return res.json({
    show: true,
    context,
    cooldownMs: WINDOW_MS,
    maxMs: 90000,
  });
}

export async function adsShownHandler(req, res) {
<<<<<<< HEAD
  if (!isVideoAdsEnabled() || isAdFreeRequest(req)) {
=======
  if (!isAdsEnabled() || isAdFreeRequest(req)) {
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
    return res.json({ ok: true });
  }
  prune();
  const key = subjectKey(req);
  const now = Date.now();
  const stamps = (lastShown.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length < MAX_PER_WINDOW) stamps.push(now);
  lastShown.set(key, stamps);
  const context = typeof req.body?.context === 'string'
    ? req.body.context.trim().toLowerCase()
    : 'game';
  recordAdEvent('shown', CONTEXTS.has(context) ? context : 'game', visitorHash(key));
  return res.json({ ok: true });
}

export async function adsVastHandler(req, res) {
  if (!isVideoAdsEnabled() || isAdFreeRequest(req)) {
    return res.json({ tagUrl: '', mediaUrl: '', clickThrough: '' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ tagUrl: vastUrl(), mediaUrl: '', clickThrough: '' });
}

export async function adsVastXmlHandler(req, res) {
  if (!isVideoAdsEnabled() || isAdFreeRequest(req)) {
    return res.status(204).end();
  }
  try {
    const r = await fetch(vastUrl(), { redirect: 'follow' });
    const xml = await r.text();
    if (!r.ok || !xml) {
      return res.status(502).end();
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(xml);
  } catch {
    return res.status(502).end();
  }
}
