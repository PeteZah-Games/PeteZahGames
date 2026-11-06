import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import db from './db.js';

export const VORTEX_ORIGIN = 'https://backend.hutianhuilixiang.cyou';

const MSG_TTL = 5000;
const GUILD_TTL = 60000;
const EMOTE_TTL = 600000;
const PERM_TTL = 60000;
const PRESENCE_TTL = 12000;

class ChatError extends Error {
  constructor(status) {
    super('chat');
    this.status = status;
  }
}

function secret() {
  return String(process.env.VORTEX_CLIENT_SECRET || process.env.VORTEX_API_KEY || '').trim();
}

export function vortexClientId() {
  const id = String(process.env.VORTEX_CLIENT_ID || '').trim();
  return /^vtx_[a-f0-9]{20}$/.test(id) ? id : '';
}

let pairedId = '';
let pairedSecret = '';

function credentialPairs() {
  const key = secret();
  const id = vortexClientId();
  if (!key || !id) return [];
  return [{ id, secret: key }];
}

function activeClientId() {
  return pairedId || vortexClientId();
}

function activeSecret() {
  return pairedSecret || secret();
}

export function vortexJoinEnabled() {
  return !!(activeClientId() && activeSecret());
}

export async function prepareSignIn() {
  try {
    await appToken();
  } catch {}
  return activeClientId();
}

function aesKey() {
  return createHash('sha256').update(String(process.env.TOKEN_SECRET || '')).digest();
}

export function seal(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', aesKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

export function unseal(packed) {
  const buf = Buffer.from(String(packed || ''), 'base64url');
  const d = createDecipheriv('aes-256-gcm', aesKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

export function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export function asset(path) {
  const raw = String(path || '');
  if (!raw) return '';
  try {
    const u = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(raw, VORTEX_ORIGIN);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    const ours = u.hostname === 'vtx.chat' || u.hostname.endsWith('.vtx.chat') || u.origin === VORTEX_ORIGIN;
    if (ours) {
      if (!u.pathname.startsWith('/img/') || u.pathname.includes('..')) return '';
      if (u.pathname.replace(/\/+$/, '') === '/img/uploads/843aa3394cd9e5d5') return '/storage/images/vortex-petezah.webp';
      return '/api/chat/pic?p=' + encodeURIComponent(u.pathname);
    }
    return u.href;
  } catch {
    return '';
  }
}

function shapeChannel(c) {
  return {
    id: String(c?.id || ''),
    name: String(c?.name || 'room').slice(0, 40),
    description: String(c?.description || '').slice(0, 140),
    category: String(c?.category || '').slice(0, 40),
    slowmodeSeconds: Number(c?.slowmodeSeconds) || 0,
    readOnly: !!c?.readOnly,
    locked: !!c?.locked,
    editable: c?.editable !== false,
    canSend: false,
  };
}

function shapeMessage(m, channelId) {
  const a = m?.authorId && typeof m.authorId === 'object' ? m.authorId : {};
  const reply = m?.replyToId && typeof m.replyToId === 'object' ? m.replyToId : null;
  return {
    id: String(m?._id || ''),
    channelId: String(channelId || m?.channelId || ''),
    content: String(m?.content || '').slice(0, 2000),
    author: {
      id: String(a._id || a.id || ''),
      username: String(a.username || 'Unknown').slice(0, 64),
      avatar: asset(a.avatar || ''),
      color: String(a.color || '').slice(0, 80),
      rank: String(a.rank || '').slice(0, 24),
    },
    at: Date.parse(m?.createdAt) || Date.now(),
    edited: m?.editedAt ? Date.parse(m.editedAt) || 0 : 0,
    system: !!m?.system,
    kind: String(m?.commandKind || '').slice(0, 40),
    reply: reply
      ? {
          id: String(reply._id || ''),
          content: String(reply.content || '').slice(0, 180),
          author: String(reply.authorId?.username || 'Unknown').slice(0, 64),
        }
      : null,
    images: (Array.isArray(m?.attachments) ? m.attachments : []).slice(0, 4).map(asset).filter(Boolean),
    gif: m?.gif?.url ? asset(m.gif.url) : '',
  };
}

function revOf(messages) {
  const last = messages[messages.length - 1];
  if (!last) return '0';
  return `${messages.length}:${last.id}:${last.edited || 0}`;
}

function remember(map, key, value, max) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const first = map.keys().next().value;
    map.delete(first);
  }
}

let appState = null;
let appWait = null;
let appDownUntil = 0;
let guildBox = null;
let guildWait = null;
let emoteBox = null;
const msgCache = new Map();
const msgJobs = new Map();
const permCache = new Map();
const refreshJobs = new Map();

const loadLinkStmt = db.prepare('SELECT * FROM vortex_links WHERE link_key = ?');
const saveLinkStmt = db.prepare(`
  INSERT INTO vortex_links (link_key, vortex_id, username, avatar, access_token, refresh_token, expires_at, updated_at)
  VALUES (@link_key, @vortex_id, @username, @avatar, @access_token, @refresh_token, @expires_at, @updated_at)
  ON CONFLICT(link_key) DO UPDATE SET
    vortex_id = excluded.vortex_id,
    username = excluded.username,
    avatar = excluded.avatar,
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
`);
const touchTokenStmt = db.prepare(
  'UPDATE vortex_links SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ? WHERE link_key = ?'
);
const dropStmt = db.prepare('DELETE FROM vortex_links WHERE link_key = ?');

export function existingLinkKey(req) {
  const userId = req.session?.user?.id;
  if (userId && loadLinkStmt.get(`u:${userId}`)) return `u:${userId}`;
  if (req.session?.vortexKey) return `g:${req.session.vortexKey}`;
  return userId ? `u:${userId}` : '';
}

export function ensureLinkKey(req) {
  if (req.session?.user?.id) return `u:${req.session.user.id}`;
  if (!req.session.vortexKey) req.session.vortexKey = randomBytes(9).toString('hex');
  return `g:${req.session.vortexKey}`;
}

export function readLink(key) {
  if (!key) return null;
  return loadLinkStmt.get(key) || null;
}

export function dropLink(key) {
  if (!key) return;
  permCache.delete(key);
  dropStmt.run(key);
}

export function saveLink(key, tokens) {
  const user = tokens.user || {};
  const now = Date.now();
  saveLinkStmt.run({
    link_key: key,
    vortex_id: String(user.id || ''),
    username: String(user.username || '').slice(0, 64),
    avatar: asset(user.avatar || ''),
    access_token: seal(tokens.accessToken),
    refresh_token: tokens.refreshToken ? seal(tokens.refreshToken) : '',
    expires_at: tokens.expiresAt || now + 3600_000,
    updated_at: now,
  });
  permCache.delete(key);
}

async function postToken(body) {
  const res = await fetch(`${VORTEX_ORIGIN}/api/partner/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) return null;
  return data;
}

function seedGuild(data) {
  const channels = (Array.isArray(data?.channels) ? data.channels : [])
    .map(shapeChannel)
    .filter((c) => /^[a-f0-9]{24}$/.test(c.id))
    .slice(0, 50);
  guildBox = {
    at: Date.now(),
    guild: {
      name: String(data?.guild?.name || 'Vortex').slice(0, 80),
      tag: String(data?.guild?.tag || '').slice(0, 8),
      icon: asset(data?.guild?.icon || data?.guild?.logo || ''),
      ownerId: String(data?.guild?.ownerId || ''),
    },
    channels,
  };
}

function takeAppToken(data, id, sec) {
  if (!data?.access_token) return '';
  if (id) pairedId = id;
  if (sec) pairedSecret = sec;
  appState = {
    token: data.access_token,
    exp: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    mode: 'oauth',
  };
  appDownUntil = 0;
  return appState.token;
}

async function mintApp() {
  const key = secret();
  if (!key) throw new ChatError(503);
  if (Date.now() < appDownUntil) throw new ChatError(503);
  for (const pair of credentialPairs()) {
    const data = await postToken({
      client_id: pair.id,
      client_secret: pair.secret,
      grant_type: 'client_credentials',
      scope: 'guild.read guild.announce guild.moderate',
    });
    const token = takeAppToken(data, pair.id, pair.secret);
    if (token) return token;
  }
  const probe = await fetch(`${VORTEX_ORIGIN}/api/partner/v1/guild`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (probe.ok) {
    const data = await probe.json().catch(() => null);
    if (data?.guild || Array.isArray(data?.channels)) {
      seedGuild(data);
      appState = { token: key, exp: Date.now() + 6 * 3600_000, mode: 'bearer' };
      appDownUntil = 0;
      return key;
    }
  }
  await probe.text().catch(() => '');
  const loose = await postToken({
    client_secret: key,
    grant_type: 'client_credentials',
    scope: 'guild.read guild.announce guild.moderate',
  });
  const looseToken = takeAppToken(loose, '', key);
  if (looseToken) return looseToken;
  appDownUntil = Date.now() + 60000;
  throw new ChatError(503);
}

async function appToken() {
  if (appState && appState.exp - Date.now() > 60000) return appState.token;
  if (!appWait) {
    appWait = mintApp().finally(() => {
      appWait = null;
    });
  }
  return appWait;
}

async function appFetch(method, path, body, retried = false) {
  const token = await appToken();
  const res = await fetch(`${VORTEX_ORIGIN}/api/partner/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried && appState?.mode !== 'bearer') {
    appState = null;
    return appFetch(method, path, body, true);
  }
  if (!res.ok) throw new ChatError(res.status);
  return data;
}

export async function appGuild() {
  if (guildBox && Date.now() - guildBox.at < GUILD_TTL) return guildBox;
  if (!guildWait) {
    guildWait = appFetch('GET', '/guild')
      .then((data) => {
        seedGuild(data);
        return guildBox;
      })
      .finally(() => {
        guildWait = null;
      });
  }
  return guildWait;
}

export async function emoteMap() {
  if (emoteBox && Date.now() - emoteBox.at < EMOTE_TTL) return emoteBox.map;
  try {
    const data = await appFetch('GET', '/emotes');
    const map = {};
    for (const [name, val] of Object.entries(data?.emotes || {}).slice(0, 120)) {
      const src = asset(val?.src || '');
      const key = String(name || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
      if (key && src) map[key] = src;
    }
    emoteBox = { at: Date.now(), map };
  } catch {
    emoteBox = { at: Date.now(), map: emoteBox?.map || {} };
  }
  return emoteBox.map;
}

async function pullMessages(channelId, before) {
  const q = new URLSearchParams({ limit: '40' });
  if (before) q.set('before', before);
  const data = await appFetch('GET', `/guild/channels/${channelId}/messages?${q}`);
  const messages = (Array.isArray(data?.messages) ? data.messages : [])
    .map((m) => shapeMessage(m, channelId))
    .filter((m) => m.id);
  return { messages, hasMore: !!data?.hasMore };
}

export async function latestMessages(channelId) {
  const hit = msgCache.get(channelId);
  if (hit && Date.now() - hit.at < MSG_TTL) return hit;
  let job = msgJobs.get(channelId);
  if (!job) {
    job = pullMessages(channelId)
      .then((pulled) => {
        const box = { at: Date.now(), ...pulled, rev: revOf(pulled.messages) };
        remember(msgCache, channelId, box, 6);
        return box;
      })
      .finally(() => {
        msgJobs.delete(channelId);
      });
    msgJobs.set(channelId, job);
  }
  return job;
}

export async function olderMessages(channelId, before) {
  const pulled = await pullMessages(channelId, before);
  return pulled;
}

const presenceCache = new Map();
const presenceJobs = new Map();

function hexColor(raw) {
  const hit = String(raw || '').match(/#[0-9a-fA-F]{6}/);
  return hit ? hit[0] : '';
}

export async function channelPresence(channelId) {
  const hit = presenceCache.get(channelId);
  if (hit && Date.now() - hit.at < PRESENCE_TTL) return hit.data;
  let job = presenceJobs.get(channelId);
  if (!job) {
    job = appFetch('GET', `/guild/online?channelId=${encodeURIComponent(channelId)}`)
      .then((data) => {
        const groups = (Array.isArray(data?.groups) ? data.groups : []).slice(0, 10).map((group) => ({
          role: group?.role
            ? {
                name: String(group.role.name || '').slice(0, 32),
                color: hexColor(group.role.color),
              }
            : null,
          members: (Array.isArray(group?.members) ? group.members : []).slice(0, 40).map((member) => ({
            id: String(member?.id || ''),
            username: String(member?.username || 'Unknown').slice(0, 64),
            avatar: asset(member?.avatar || ''),
            color: hexColor(member?.color),
            status: String(member?.status || '').slice(0, 16),
          })),
        }));
        const shaped = { count: Number(data?.count) || 0, groups };
        remember(presenceCache, channelId, { at: Date.now(), data: shaped }, 6);
        return shaped;
      })
      .finally(() => {
        presenceJobs.delete(channelId);
      });
    presenceJobs.set(channelId, job);
  }
  return job;
}

export function sanitizeOrigin(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (u.protocol === 'http:' && host !== 'localhost' && host !== '127.0.0.1') return null;
    if (!host || host.length > 253) return null;
    return u.origin;
  } catch {
    return null;
  }
}

function originFromHost(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!host) return null;
  const hostname = host.split(':')[0];
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const proto = local
    ? String(req.headers['x-forwarded-proto'] || '').includes('https') || req.secure
      ? 'https'
      : 'http'
    : 'https';
  return sanitizeOrigin(`${proto}://${host}`);
}

export function callbackOrigin(req, explicit) {
  const self = originFromHost(req);
  const fromQuery = sanitizeOrigin(explicit ?? req?.query?.origin);
  // Only trust ?origin= when it is the host that actually served this request.
  if (fromQuery && self && fromQuery === self) return fromQuery;
  if (self) return self;
  return publicOrigin();
}

export function knownChannel(box, channelId) {
  return !!box?.channels?.some((c) => c.id === channelId);
}

export function pickChannel(channels, prefer) {
  if (prefer && channels.some((c) => c.id === prefer)) return prefer;
  const named = channels.find((c) => c.name.toLowerCase() === 'general');
  return (named || channels[0] || {}).id || '';
}

function announceChannel(channels) {
  for (const name of ['announcements', 'announce', 'general']) {
    const hit = channels.find((c) => c.name.toLowerCase() === name);
    if (hit) return hit;
  }
  return channels[0] || null;
}

export function mirrorAnnouncement(title, content) {
  const text = `${String(title || '').trim()}\n\n${String(content || '').trim()}`.trim().slice(0, 2000);
  if (!text || !secret()) return;
  void (async () => {
    const box = await appGuild();
    const ch = announceChannel(box?.channels || []);
    if (!ch) return;
    await appFetch('POST', `/guild/channels/${ch.id}/announce`, { content: text });
    msgCache.delete(ch.id);
  })().catch(() => {});
}

async function accessFor(row) {
  const fresh = loadLinkStmt.get(row.link_key);
  if (!fresh) throw new ChatError(401);
  if (!(fresh.refresh_token && fresh.expires_at - Date.now() < 60000)) return unseal(fresh.access_token);
  let job = refreshJobs.get(fresh.link_key);
  if (!job) {
    job = doRefresh(fresh).finally(() => refreshJobs.delete(fresh.link_key));
    refreshJobs.set(fresh.link_key, job);
  }
  return job;
}

async function doRefresh(row) {
  const id = activeClientId();
  const key = activeSecret();
  if (!id || !key) {
    dropLink(row.link_key);
    throw new ChatError(401);
  }
  const data = await postToken({
    client_id: id,
    client_secret: key,
    grant_type: 'refresh_token',
    refresh_token: unseal(row.refresh_token),
  });
  if (!data?.access_token) {
    dropLink(row.link_key);
    throw new ChatError(401);
  }
  const expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  const refreshToken = data.refresh_token || unseal(row.refresh_token);
  touchTokenStmt.run(seal(data.access_token), seal(refreshToken), expiresAt, Date.now(), row.link_key);
  row.expires_at = expiresAt;
  return data.access_token;
}

async function userFetch(row, method, path, body, retried = false) {
  const token = await accessFor(row);
  const res = await fetch(`${VORTEX_ORIGIN}/api/partner/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried && row.refresh_token) {
    row.expires_at = 0;
    return userFetch(row, method, path, body, true);
  }
  if (!res.ok) {
    const err = new ChatError(res.status);
    err.detail = String(data?.message || '').slice(0, 180);
    throw err;
  }
  return data;
}

let roleBox = null;

export async function guildRoles() {
  if (roleBox && Date.now() - roleBox.at < GUILD_TTL) return roleBox.roles;
  try {
    const data = await appFetch('GET', '/guild/roles');
    const roles = (Array.isArray(data?.roles) ? data.roles : []).slice(0, 24).map((role) => ({
      id: String(role?.id || ''),
      name: String(role?.name || '').slice(0, 32),
      color: hexColor(role?.color),
    })).filter((role) => /^[a-f0-9]{24}$/.test(role.id));
    roleBox = { at: Date.now(), roles };
  } catch {
    roleBox = { at: Date.now(), roles: roleBox?.roles || [] };
  }
  return roleBox.roles;
}

function shapePowers(data) {
  const p = data?.permissions || {};
  return {
    messages: !!p.manageMessages,
    timeout: !!p.timeout,
    ban: !!p.ban,
    roles: !!p.manageRoles,
    channels: !!p.manageChannels,
  };
}

export async function memberCard(row, userId) {
  const data = await userFetch(row, 'GET', `/guild/members/${userId}`);
  const user = data?.user || {};
  return {
    id: String(user.id || userId),
    username: String(user.username || 'Unknown').slice(0, 64),
    avatar: asset(user.avatar || ''),
    rank: String(user.rank || '').slice(0, 24),
    color: hexColor(user.color),
    owner: !!data?.owner,
    staff: !!data?.vortexStaff,
    joinedAt: Date.parse(data?.joinedAt) || 0,
    timeoutUntil: data?.timeoutUntil ? Date.parse(data.timeoutUntil) || 0 : 0,
    banned: !!data?.banned,
    roles: (Array.isArray(data?.roles) ? data.roles : []).slice(0, 8).map((role) => ({
      id: String(role?.id || ''),
      name: String(role?.name || '').slice(0, 32),
      color: hexColor(role?.color),
    })),
  };
}

export async function memberMarks(row, ids) {
  const clean = ids.filter((id) => /^[a-f0-9]{24}$/.test(id)).slice(0, 40);
  if (!clean.length) return {};
  const data = await userFetch(row, 'GET', `/guild/member-roles?ids=${clean.join(',')}`);
  const out = {};
  for (const id of clean) {
    const role = data?.roles?.[id];
    out[id] = role && role.name
      ? { name: String(role.name).slice(0, 32), color: hexColor(role.color) }
      : null;
  }
  return out;
}

function withChannel(body, channelId) {
  if (channelId) body.channelId = channelId;
  return body;
}

export async function timeoutMember(row, userId, minutes, channelId, reason) {
  await userFetch(row, 'PUT', `/guild/timeouts/${userId}`, withChannel({ minutes, reason: String(reason || 'PeteZah').slice(0, 200) }, channelId));
}

export async function clearTimeoutMember(row, userId, channelId) {
  const q = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  await userFetch(row, 'DELETE', `/guild/timeouts/${userId}${q}`);
}

export async function banMember(row, userId, minutes, channelId, reason) {
  await userFetch(row, 'PUT', `/guild/bans/${userId}`, withChannel({ minutes, reason: String(reason || 'PeteZah').slice(0, 200) }, channelId));
}

export async function clearBanMember(row, userId, channelId) {
  const q = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  await userFetch(row, 'DELETE', `/guild/bans/${userId}${q}`);
}

export async function setMemberRole(row, userId, roleId, on) {
  const method = on ? 'PUT' : 'DELETE';
  await userFetch(row, method, `/guild/members/${userId}/roles/${roleId}`);
}

export function forgetGuild() {
  guildBox = null;
}

export async function reportMessage(row, channelId, messageId, reason, note) {
  await userFetch(row, 'POST', `/chat/channels/${channelId}/messages/${messageId}/report`, {
    reason,
    ...(note ? { note } : {}),
  });
}

export async function auditPage(row, after) {
  const q = new URLSearchParams({ limit: '25' });
  if (after) q.set('after', after);
  const data = await userFetch(row, 'GET', `/guild/audit?${q}`);
  return {
    cursor: data?.nextCursor ? String(data.nextCursor).slice(0, 80) : '',
    entries: (Array.isArray(data?.entries) ? data.entries : []).slice(0, 25).map((entry) => ({
      id: String(entry?.id || ''),
      action: String(entry?.action || '').slice(0, 40),
      category: String(entry?.category || '').slice(0, 24),
      message: String(entry?.message || '').slice(0, 240),
      at: Date.parse(entry?.at) || 0,
      by: String(entry?.by?.username || '').slice(0, 64),
    })),
  };
}

export async function commandList(row) {
  const data = await userFetch(row, 'GET', '/guild/commands');
  return (Array.isArray(data?.commands) ? data.commands : []).slice(0, 40).map((cmd) => ({
    name: String(cmd?.name || '').replace(/[^a-z]/g, '').slice(0, 24),
    usage: String(cmd?.usage || '').slice(0, 80),
    description: String(cmd?.description || '').slice(0, 140),
    moderation: !!cmd?.moderation,
  })).filter((cmd) => cmd.name);
}

export async function mentionUsers(row, q) {
  const data = await userFetch(row, 'GET', `/guild/mentions?q=${encodeURIComponent(q)}`);
  return (Array.isArray(data?.users) ? data.users : []).slice(0, 8).map((user) => ({
    id: String(user?.id || ''),
    username: String(user?.username || '').slice(0, 64),
    avatar: asset(user?.avatar || ''),
    color: hexColor(user?.color),
  })).filter((user) => /^[a-f0-9]{24}$/.test(user.id));
}

export async function discordRooms(row) {
  try {
    const data = await userFetch(row, 'GET', '/guild/discord-channels');
    return {
      connected: !!data?.connected,
      channels: (Array.isArray(data?.channels) ? data.channels : []).slice(0, 80).map((ch) => ({
        id: String(ch?.id || '').slice(0, 32),
        name: String(ch?.name || '').slice(0, 80),
        category: String(ch?.category || '').slice(0, 40),
        usable: !!ch?.usable,
      })).filter((ch) => ch.id),
    };
  } catch {
    return { connected: false, channels: [] };
  }
}

export async function saveChannel(row, channelId, body) {
  const path = channelId ? `/guild/channels/${channelId}` : '/guild/channels';
  const data = await userFetch(row, channelId ? 'PATCH' : 'POST', path, body);
  permCache.delete(row.link_key);
  forgetGuild();
  return data?.channel ? shapeChannel(data.channel) : null;
}

export async function removeChannel(row, channelId) {
  await userFetch(row, 'DELETE', `/guild/channels/${channelId}`);
  permCache.delete(row.link_key);
  forgetGuild();
}

export async function viewerState(row) {
  if (!row) return null;
  const hit = permCache.get(row.link_key);
  if (hit && Date.now() - hit.at < PERM_TTL) return hit;
  const data = await userFetch(row, 'GET', '/guild');
  const channels = (Array.isArray(data?.channels) ? data.channels : [])
    .map((c) => ({
      ...shapeChannel(c),
      canSend: !!c?.canSend && !c?.readOnly && !c?.locked,
    }))
    .filter((c) => /^[a-f0-9]{24}$/.test(c.id))
    .slice(0, 50);
  const rules = data?.rules
    ? {
        accepted: !!data.rules.accepted,
        items: (Array.isArray(data.rules.items) ? data.rules.items : []).slice(0, 12).map((it) => ({
          title: String(it?.title || '').slice(0, 120),
          description: String(it?.description || '').slice(0, 500),
          locked: !!it?.locked,
        })),
      }
    : null;
  let card = null;
  if (/^[a-f0-9]{24}$/.test(String(row.vortex_id || ''))) {
    try {
      card = await memberCard(row, row.vortex_id);
    } catch {
      card = null;
    }
  }
  const packed = {
    at: Date.now(),
    channels,
    rules,
    powers: shapePowers(data),
    guild: {
      name: String(data?.guild?.name || 'PeteZah').slice(0, 80),
      tag: String(data?.guild?.tag || '').slice(0, 8),
      icon: asset(data?.guild?.icon || data?.guild?.logo || ''),
      ownerId: String(data?.guild?.ownerId || ''),
    },
    standing: {
      muted: !!data?.standing?.muted,
      timedOut: !!data?.standing?.timedOut,
      until: Date.parse(data?.standing?.timeoutUntil || data?.standing?.mutedUntil || '') || 0,
    },
    viewer: {
      id: String(card?.id || row.vortex_id || ''),
      username: String(card?.username || row.username || '').slice(0, 64),
      avatar: card?.avatar || asset(row.avatar || ''),
      rank: String(card?.rank || '').slice(0, 24),
      color: card?.color || '',
      owner: !!card?.owner,
    },
  };
  remember(permCache, row.link_key, packed, 80);
  return packed;
}

export async function exchangeCode(code, verifier, redirectUri) {
  const id = activeClientId();
  const key = activeSecret();
  if (!id || !key) throw new ChatError(503);
  const data = await postToken({
    client_id: id,
    client_secret: key,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (!data?.access_token) throw new ChatError(401);
  let user = data.user || null;
  if (!user) {
    const res = await fetch(`${VORTEX_ORIGIN}/api/partner/v1/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${data.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    const me = await res.json().catch(() => null);
    if (res.ok) user = me?.user || null;
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user,
  };
}

export function authorizeUrl({ redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    client_id: activeClientId(),
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify chat.read chat.write',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${VORTEX_ORIGIN}/oauth/authorize?${params}`;
}

export async function revokeLink(row) {
  if (!row) return;
  const id = activeClientId();
  const key = activeSecret();
  let token = '';
  try {
    token = row.refresh_token ? unseal(row.refresh_token) : unseal(row.access_token);
  } catch {
    token = '';
  }
  dropLink(row.link_key);
  if (!id || !key || !token) return;
  await fetch(`${VORTEX_ORIGIN}/api/partner/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: key, token }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

export async function sendAs(row, channelId, content, replyTo) {
  const data = await userFetch(row, 'POST', `/chat/channels/${channelId}/messages`, {
    content,
    ...(replyTo ? { replyToId: replyTo } : {}),
  });
  msgCache.delete(channelId);
  if (data?.command) {
    return {
      message: null,
      command: { ok: !!data.ok, text: String(data.message || '').slice(0, 500) },
    };
  }
  return { message: data?.message ? shapeMessage(data.message, channelId) : null, command: null };
}

export async function editAs(row, channelId, messageId, content) {
  const data = await userFetch(row, 'PATCH', `/chat/channels/${channelId}/messages/${messageId}`, { content });
  msgCache.delete(channelId);
  return data?.message ? shapeMessage(data.message, channelId) : null;
}

export async function deleteAs(row, channelId, messageId) {
  await userFetch(row, 'DELETE', `/chat/channels/${channelId}/messages/${messageId}`);
  msgCache.delete(channelId);
}

export async function acceptRules(row) {
  await userFetch(row, 'POST', '/guild/rules/accept');
  permCache.delete(row.link_key);
}

export async function browserPass(row) {
  const id = activeClientId();
  if (!id || !row) return null;
  const token = await accessFor(row);
  const fresh = loadLinkStmt.get(row.link_key);
  if (!token || !fresh) return null;
  return {
    clientId: id,
    accessToken: token,
    expiresAt: Number(fresh.expires_at) || Date.now() + 3600_000,
  };
}

export function publicOrigin() {
  const env = String(process.env.PUBLIC_ORIGIN || '').trim();
  if (env) {
    const base = /^https?:\/\//i.test(env) ? env : `https://${env}`;
    return base.replace(/\/$/, '');
  }
  return 'https://petezahgames.com';
}

export { ChatError };
