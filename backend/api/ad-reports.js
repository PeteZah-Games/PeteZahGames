import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';

const CACHE_MS = 60000;

export const adReportsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'rate_limit' }),
});

let payloadCache = { at: 0, body: null };

function requireAdmin(req, res) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = db.prepare('SELECT is_admin, email, banned FROM users WHERE id = ?').get(req.session.user.id);
  if (!row || row.banned) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = isOwnerEmail(row.email);
  let level = Number(row.is_admin || 0);
  if (owner && level < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(req.session.user.id);
    level = 3;
  }
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return { id: req.session.user.id, email: row.email, is_admin: level, is_owner: owner };
}

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function oursWindow(fromDay, toDay) {
  const shown = db.prepare(
    `SELECT COUNT(*) AS n FROM ad_events WHERE kind = 'shown' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const attempts = db.prepare(
    `SELECT COUNT(*) AS n FROM ad_events WHERE kind = 'attempt' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const uniqueVisitors = db.prepare(
    `SELECT COUNT(DISTINCT visitor) AS n FROM ad_events WHERE kind = 'shown' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const uniqueAttempts = db.prepare(
    `SELECT COUNT(DISTINCT visitor) AS n FROM ad_events WHERE kind = 'attempt' AND day >= ? AND day <= ?`
  ).get(fromDay, toDay)?.n || 0;
  const byContext = db.prepare(
    `SELECT context, COUNT(*) AS n FROM ad_events WHERE kind = 'shown' AND day >= ? AND day <= ? GROUP BY context`
  ).all(fromDay, toDay);
  const ctx = { game: 0, app: 0, vm: 0 };
  for (const r of byContext) {
    if (r.context in ctx) ctx[r.context] = r.n;
  }
  return {
    views: shown,
    attempts,
    uniqueVisitors,
    uniqueAttempts,
    startRate: attempts > 0 ? shown / attempts : 0,
    freq: uniqueVisitors > 0 ? shown / uniqueVisitors : 0,
    byContext: ctx,
  };
}

function oursTodayHours(today) {
  const rows = db.prepare(
    `SELECT hour, kind, COUNT(*) AS n FROM ad_events WHERE day = ? GROUP BY hour, kind`
  ).all(today);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, attempts: 0 }));
  for (const r of rows) {
    const h = Number(r.hour);
    if (h < 0 || h > 23) continue;
    if (r.kind === 'shown') hours[h].views = r.n;
    else if (r.kind === 'attempt') hours[h].attempts = r.n;
  }
  return hours;
}

function oursDaily(fromDay, toDay) {
  const rows = db.prepare(
    `SELECT day, kind, COUNT(*) AS n, COUNT(DISTINCT visitor) AS u
     FROM ad_events WHERE day >= ? AND day <= ?
     GROUP BY day, kind`
  ).all(fromDay, toDay);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.day)) map.set(r.day, { date: r.day, views: 0, attempts: 0, uniqueVisitors: 0 });
    const rec = map.get(r.day);
    if (r.kind === 'shown') {
      rec.views = r.n;
      rec.uniqueVisitors = r.u;
    } else if (r.kind === 'attempt') rec.attempts = r.n;
  }
  const out = [];
  let d = fromDay;
  while (d <= toDay) {
    out.push(map.get(d) || { date: d, views: 0, attempts: 0, uniqueVisitors: 0 });
    d = addDays(d, 1);
  }
  return out;
}

function buildInsights(ours) {
  const out = [];
  const t = ours.today.views;
  if (t === 0) {
    out.push({
      tone: 'info',
      title: 'No loader impressions yet today',
      body: 'Starts count when the game/app/VM loader break finishes. Light traffic early is normal.',
    });
  } else {
    out.push({
      tone: 'good',
      title: 'Loader breaks recording',
      body: `${t} shown today across games ${ours.today.byContext.game}, apps ${ours.today.byContext.app}, VM ${ours.today.byContext.vm}.`,
    });
  }
  if (ours.today.startRate > 0) {
    out.push({
      tone: ours.today.startRate >= 0.7 ? 'good' : 'info',
      title: 'Fill rate',
      body: `${Math.round(ours.today.startRate * 100)}% of gated attempts became a shown break.`,
    });
  }
  if (ours.d7.views > 0) {
    out.push({
      tone: 'info',
      title: 'Last 7 days',
      body: `${ours.d7.views} shown · ${ours.d7.uniqueVisitors} unique visitors.`,
    });
  }
  return out.slice(0, 8);
}

export async function getAdminAdReportsHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (payloadCache.body && Date.now() - payloadCache.at < CACHE_MS) {
    return res.json(payloadCache.body);
  }

  const today = utcDay();
  const yesterday = addDays(today, -1);
  const d7 = addDays(today, -6);
  const d30 = addDays(today, -29);

  const ours = {
    today: oursWindow(today, today),
    yesterday: oursWindow(yesterday, yesterday),
    d7: oursWindow(d7, today),
    d30: oursWindow(d30, today),
    hours: oursTodayHours(today),
    byDate: oursDaily(d30, today),
  };

  const body = {
    configured: true,
    generatedAt: Date.now(),
    day: today,
    ours,
    insights: buildInsights(ours),
  };

  payloadCache = { at: Date.now(), body };
  return res.json(body);
}
