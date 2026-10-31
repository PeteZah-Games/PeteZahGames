import { createHash, createHmac, randomBytes } from 'crypto';
import { Router } from 'express';
import { activeAnnouncementsFor } from '../api/admin-presence.js';
import { noteError } from '../utils/error-ring.js';
import {
  attachCard,
  attachGroups,
  attachMessages,
  attachViewer,
  faceState,
  readSiteUser,
  sameFaceOrigin,
  setFace,
} from '../api/chat-face.js';
import {
  ChatError,
  acceptRules,
  appGuild,
  authorizeUrl,
  callbackOrigin,
  banMember,
  auditPage,
  channelPresence,
  clearBanMember,
  clearTimeoutMember,
  commandList,
  deleteAs,
  discordRooms,
  editAs,
  emoteMap,
  ensureLinkKey,
  exchangeCode,
  existingLinkKey,
  guildRoles,
  knownChannel,
  latestMessages,
  memberCard,
  memberMarks,
  olderMessages,
  pickChannel,
  prepareSignIn,
  readLink,
  removeChannel,
  reportMessage,
  revokeLink,
  sameSecret,
  saveChannel,
  saveLink,
  sendAs,
  setMemberRole,
  mentionUsers,
  timeoutMember,
  browserPass,
  viewerState,
  vortexClientId,
  vortexJoinEnabled,
  VORTEX_ORIGIN,
} from '../vortex.js';

const router = Router();
const ID = /^[a-f0-9]{24}$/;
const sentAt = new Map();
const seats = new Map();
const typers = new Map();
const passAt = new Map();
const SEAT_TTL = 35000;

function markSeat(channelId, viewer) {
  const id = String(viewer?.id || '');
  if (!ID.test(id)) return;
  if (seats.has(id)) seats.delete(id);
  seats.set(id, {
    id,
    username: String(viewer.username || 'Member').slice(0, 64),
    avatar: String(viewer.avatar || ''),
    color: String(viewer.color || '').slice(0, 16),
    channelId,
    at: Date.now(),
  });
  while (seats.size > 200) {
    const first = seats.keys().next().value;
    seats.delete(first);
  }
}

function markTyping(channelId, viewer) {
  const id = String(viewer?.id || '');
  if (!ID.test(id)) return;
  typers.set(id, {
    id,
    username: String(viewer.username || 'Member').slice(0, 64),
    channelId,
    at: Date.now(),
  });
  while (typers.size > 200) {
    const first = typers.keys().next().value;
    typers.delete(first);
  }
}

function typingNames(channelId, selfId) {
  const now = Date.now();
  const names = [];
  for (const row of typers.values()) {
    if (now - row.at > 5000 || row.channelId !== channelId || row.id === selfId) continue;
    names.push(row.username);
  }
  return names.slice(0, 3);
}

function mergeHere(live, channelId) {
  const now = Date.now();
  const groups = (live.groups || []).map((group) => ({
    role: group.role,
    members: [...(group.members || [])],
  }));
  const taken = new Set();
  for (const group of groups) {
    for (const member of group.members) taken.add(member.id);
  }
  const extra = [];
  for (const seat of seats.values()) {
    if (now - seat.at > SEAT_TTL || seat.channelId !== channelId || taken.has(seat.id)) continue;
    extra.push({
      id: seat.id,
      username: seat.username,
      avatar: seat.avatar,
      color: seat.color,
      status: 'online',
    });
  }
  if (!extra.length) return { count: Number(live.count) || 0, groups: attachGroups(groups) };
  const open = groups.find((group) => !group.role);
  if (open) open.members.push(...extra);
  else groups.push({ role: null, members: extra });
  return { count: (Number(live.count) || 0) + extra.length, groups: attachGroups(groups) };
}

function quiet(res) {
  res.setHeader('Cache-Control', 'private, no-store');
}

function fail(res, err) {
  const status = Number(err?.status) || 502;
  const detail = String(err?.detail || '').slice(0, 180);
  if (status === 429) return res.status(429).json({ error: 'Slow mode is on. Try again in a moment.' });
  if (status === 409) return res.status(409).json({ error: 'That was already reported.' });
  if (status === 403) return res.status(403).json({ error: detail || 'You cannot do that in this room.' });
  if (status === 400) return res.status(400).json({ error: detail || 'That message could not be sent.' });
  if (status === 401) return res.status(401).json({ error: 'Sign in with Vortex again.' });
  return res.status(502).json({ error: 'Chat is unavailable right now.' });
}

function allowSend(key) {
  const now = Date.now();
  const last = sentAt.get(key) || 0;
  if (now - last < 1200) return false;
  if (sentAt.has(key)) sentAt.delete(key);
  sentAt.set(key, now);
  while (sentAt.size > 400) {
    const first = sentAt.keys().next().value;
    sentAt.delete(first);
  }
  return true;
}

function cleanAnnouncements(req) {
  return activeAnnouncementsFor(req).map((a) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    important: a.important ? 1 : 0,
  }));
}

async function room(req) {
  const row = readLink(existingLinkKey(req));
  let view = null;
  if (row) {
    try {
      view = await viewerState(row);
    } catch {
      view = {
        channels: [],
        rules: null,
        viewer: {
          id: String(row.vortex_id || ''),
          username: String(row.username || 'Member').slice(0, 64),
          avatar: String(row.avatar || ''),
        },
      };
    }
  }
  let box = null;
  try {
    box = await appGuild();
  } catch {
    box = null;
  }
  const base = (box?.channels || []).map((c) => ({ ...c, canSend: false }));
  const channels = view?.channels?.length ? view.channels : base;
  return { row: view ? row : null, box, channels, view };
}

async function guildOnly() {
  try {
    return await appGuild();
  } catch {
    return null;
  }
}

function seatFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.vortex_id || ''),
    username: String(row.username || 'Member').slice(0, 64),
    avatar: String(row.avatar || ''),
    color: '',
  };
}

function allowPass(key) {
  const now = Date.now();
  const last = passAt.get(key) || 0;
  if (now - last < 4000) return false;
  if (passAt.has(key)) passAt.delete(key);
  passAt.set(key, now);
  while (passAt.size > 400) {
    const first = passAt.keys().next().value;
    passAt.delete(first);
  }
  return true;
}

router.get('/boot', async (req, res) => {
  quiet(res);
  const announcements = cleanAnnouncements(req);
  try {
    const { channels, view, box, row } = await room(req);
    const channelId = pickChannel(channels, '');
    let messages = [];
    let hasMore = false;
    let rev = '0';
    let emotes = {};
    if (channelId && box) {
      const feed = await latestMessages(channelId);
      messages = feed.messages;
      hasMore = feed.hasMore;
      rev = feed.rev;
      emotes = await emoteMap();
    }
    let wire = null;
    if (row) {
      try {
        wire = await browserPass(row);
      } catch {}
    }
    res.json({
      live: !!box,
      join: vortexJoinEnabled(),
      guild: box?.guild || view?.guild || { name: 'PeteZah', tag: '' },
      channels,
      channelId,
      messages: attachMessages(messages),
      hasMore,
      rev,
      emotes,
      viewer: attachViewer(view?.viewer || null),
      powers: view?.powers || null,
      standing: view?.standing || null,
      roles: view ? await guildRoles().catch(() => []) : [],
      rules: view?.rules || null,
      announcements,
      wire,
    });
  } catch (err) {
    res.json({
      live: false,
      join: vortexJoinEnabled(),
      guild: { name: 'PeteZah', tag: '' },
      channels: [],
      channelId: '',
      messages: [],
      hasMore: false,
      rev: '0',
      emotes: {},
      viewer: null,
      rules: null,
      announcements,
      wire: null,
      error: err instanceof ChatError && err.status === 429 ? 'Slow mode is on.' : 'Chat is unavailable right now.',
    });
  }
});

router.get('/pass', async (req, res) => {
  quiet(res);
  try {
    const row = readLink(existingLinkKey(req));
    if (!row) return res.status(401).json({ error: 'Sign in with Vortex again.' });
    if (!allowPass(row.link_key)) return res.status(429).json({ error: 'Slow mode is on. Try again in a moment.' });
    const wire = await browserPass(row);
    if (!wire) return res.status(503).json({ error: 'Chat is unavailable right now.' });
    res.json(wire);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/feed', async (req, res) => {
  quiet(res);
  try {
    const wanted = String(req.query.channel || '');
    const box = await guildOnly();
    const channelId = ID.test(wanted) && box && knownChannel(box, wanted) ? wanted : '';
    if (!channelId || !box) {
      return res.json({ live: !!box, channelId: '', messages: [], hasMore: false, rev: '0' });
    }
    const feed = await latestMessages(channelId);
    if (String(req.query.v || '') === feed.rev) {
      return res.json({ live: true, channelId, unchanged: true, rev: feed.rev, hasMore: feed.hasMore });
    }
    res.json({
      live: true,
      channelId,
      unchanged: false,
      rev: feed.rev,
      hasMore: feed.hasMore,
      messages: attachMessages(feed.messages),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/history', async (req, res) => {
  quiet(res);
  try {
    const box = await guildOnly();
    const channelId = String(req.query.channel || '');
    const before = String(req.query.before || '');
    if (!ID.test(channelId) || !ID.test(before) || !box || !knownChannel(box, channelId)) {
      return res.status(400).json({ error: 'Unknown room.' });
    }
    const page = await olderMessages(channelId, before);
    res.json({ ...page, messages: attachMessages(page.messages) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/send', async (req, res) => {
  quiet(res);
  try {
    const row = readLink(existingLinkKey(req));
    if (!row) return res.status(401).json({ error: 'Sign in with Vortex to talk.' });
    const channelId = String(req.body?.channelId || '');
    const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 2000) : '';
    const replyTo = typeof req.body?.replyTo === 'string' ? req.body.replyTo : '';
    if (!ID.test(channelId) || !content) return res.status(400).json({ error: 'That message could not be sent.' });
    if (replyTo && !ID.test(replyTo)) return res.status(400).json({ error: 'That message could not be sent.' });
    const { channels, box, view } = await room(req);
    const channel = channels.find((c) => c.id === channelId);
    if (!channel || !box || !knownChannel(box, channelId) || !channel.canSend) {
      return res.status(403).json({ error: 'You cannot do that in this room.' });
    }
    if (view?.rules && view.rules.accepted === false) {
      return res.status(403).json({ error: 'Accept the room rules before chatting.', needRules: true });
    }
    if (!allowSend(row.link_key)) return res.status(429).json({ error: 'Slow mode is on. Try again in a moment.' });
    const sent = await sendAs(row, channelId, content, replyTo);
    if (sent?.message) sent.message = attachMessages([sent.message])[0];
    res.json(sent);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/edit', async (req, res) => {
  quiet(res);
  try {
    const row = readLink(existingLinkKey(req));
    if (!row) return res.status(401).json({ error: 'Sign in with Vortex again.' });
    const channelId = String(req.body?.channelId || '');
    const messageId = String(req.body?.messageId || '');
    const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 2000) : '';
    if (!ID.test(channelId) || !ID.test(messageId) || !content) {
      return res.status(400).json({ error: 'That message could not be sent.' });
    }
    const message = await editAs(row, channelId, messageId, content);
    res.json({ message: message ? attachMessages([message])[0] : null });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/delete', async (req, res) => {
  quiet(res);
  try {
    const row = readLink(existingLinkKey(req));
    if (!row) return res.status(401).json({ error: 'Sign in with Vortex again.' });
    const channelId = String(req.body?.channelId || '');
    const messageId = String(req.body?.messageId || '');
    if (!ID.test(channelId) || !ID.test(messageId)) return res.status(400).json({ error: 'Unknown message.' });
    await deleteAs(row, channelId, messageId);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/rules', async (req, res) => {
  quiet(res);
  try {
    const row = readLink(existingLinkKey(req));
    if (!row) return res.status(401).json({ error: 'Sign in with Vortex again.' });
    await acceptRules(row);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/logout', async (req, res) => {
  quiet(res);
  const row = readLink(existingLinkKey(req));
  await revokeLink(row);
  res.json({ ok: true });
});

function signPack(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', String(process.env.TOKEN_SECRET || 'pz')).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

function readPack(token) {
  const [raw, sig] = String(token || '').split('.');
  if (!raw || !sig) return null;
  const expect = createHmac('sha256', String(process.env.TOKEN_SECRET || 'pz')).update(raw).digest('base64url');
  if (!sameSecret(sig, expect)) return null;
  try {
    const data = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!data || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function home(returnTo) {
  const dest = safeReturnTo(returnTo) || 'petezah://chat';
  return '/?m=' + encodeURIComponent(dest);
}

function safeReturnTo(raw) {
  const v = String(raw || '').trim();
  if (!v.startsWith('petezah://')) return null;
  if (v.length > 200 || /[\s<>"']/.test(v)) return null;
  return v.split('#')[0];
}

function sendReturn(req, res) {
  const saved = readPack(req.cookies?.pz_vtx) || req.session?.vortexOauth || null;
  const back = JSON.stringify(home(saved?.returnTo));
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Signing in</title></head><body style="margin:0;background:#020810;color:#9aa4b2;font:14px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh"><p>Finishing sign-in…</p><script>
var q=location.search||"";
var back=${back};
try{history.replaceState(null,"","/api/chat/callback")}catch(e){}
var timer=setTimeout(function(){location.replace(back)},12000);
fetch("/api/chat/finish"+q,{credentials:"include",headers:{Accept:"application/json"},redirect:"manual"}).then(function(r){return r.json().catch(function(){return null})}).then(function(d){if(d&&d.returnTo){try{back="/?m="+encodeURIComponent(d.returnTo)}catch(e){}}}).finally(function(){clearTimeout(timer);location.replace(back)});
</script></body></html>`;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.type('html').send(html);
}

function sendDone(req, res, returnTo) {
  const dest = safeReturnTo(returnTo) || 'petezah://chat';
  if (req.headers['sec-fetch-mode'] === 'navigate') return res.redirect(home(dest));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, returnTo: dest });
}

async function completeLogin(req, res) {
  const state = String(req.query.state || '');
  const code = String(req.query.code || '').slice(0, 512);
  const saved = readPack(req.cookies?.pz_vtx) || req.session?.vortexOauth || null;
  const returnTo = saved?.returnTo || 'petezah://chat';
  if (req.session) delete req.session.vortexOauth;
  res.clearCookie('pz_vtx', { path: '/' });
  const redirectUri = saved?.redirectUri || `${callbackOrigin(req)}/api/chat/callback`;
  if (!saved || saved.exp < Date.now() || !sameSecret(state, saved.state) || req.query.error || !code) {
    const why = !saved ? 'missing sign-in cookie' : saved.exp < Date.now() ? 'sign-in cookie expired' : req.query.error ? 'provider returned an error' : 'sign-in state did not match';
    noteError(401, '/api/chat/finish', why);
    return sendDone(req, res, returnTo);
  }
  try {
    const tokens = await exchangeCode(code, saved.verifier, redirectUri);
    if (tokens) saveLink(ensureLinkKey(req), tokens);
  } catch (err) {
    const status = Number(err?.status) || 502;
    const msg = err instanceof Error && err.message && err.message !== 'chat' ? err.message : 'sign-in failed';
    noteError(status, '/api/chat/finish', msg);
  }
  if (req.session?.save) return req.session.save(() => sendDone(req, res, returnTo));
  return sendDone(req, res, returnTo);
}

const SPANS = new Set([10, 60, 1440, 10080]);

function linked(req, res) {
  const row = readLink(existingLinkKey(req));
  if (!row) {
    res.status(401).json({ error: 'Sign in with Vortex again.' });
    return null;
  }
  return row;
}

router.get('/pic', async (req, res) => {
  const raw = String(req.query.p || '');
  if (!raw.startsWith('/img/') || raw.includes('..') || raw.length > 240 || /[^a-zA-Z0-9._~/-]/.test(raw)) {
    return res.status(404).end();
  }
  if (raw.replace(/\/+$/, '') === '/img/uploads/843aa3394cd9e5d5') {
    return res.redirect(302, '/storage/images/vortex-petezah.webp');
  }
  let upstream;
  try {
    upstream = await fetch(VORTEX_ORIGIN + raw, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return res.status(404).end();
  }
  const type = String(upstream.headers.get('content-type') || '');
  if (!upstream.ok || !type.startsWith('image/')) {
    await upstream.body?.cancel?.().catch(() => {});
    return res.status(404).end();
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length > 2 * 1024 * 1024) return res.status(404).end();
  res.setHeader('Content-Type', type.split(';')[0]);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.end(buf);
});

router.get('/member', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const userId = String(req.query.id || '');
    if (!ID.test(userId)) return res.status(400).json({ error: 'Unknown member.' });
    res.json(attachCard(await memberCard(row, userId)));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/marks', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const ids = String(req.query.ids || '').split(',').slice(0, 40);
    res.json({ roles: await memberMarks(row, ids) });
  } catch {
    res.json({ roles: {} });
  }
});

router.post('/timeout', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const userId = String(req.body?.userId || '');
    const minutes = Number(req.body?.minutes);
    if (!ID.test(userId) || userId === row.vortex_id || !SPANS.has(minutes)) {
      return res.status(400).json({ error: 'That action could not be done.' });
    }
    const channelId = ID.test(String(req.body?.channelId || '')) ? String(req.body.channelId) : '';
    const reason = String(req.body?.reason || '').slice(0, 200);
    if (req.body?.clear) await clearTimeoutMember(row, userId, channelId);
    else await timeoutMember(row, userId, minutes, channelId, reason);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/ban', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const userId = String(req.body?.userId || '');
    const minutes = Number(req.body?.minutes);
    if (!ID.test(userId) || userId === row.vortex_id) return res.status(400).json({ error: 'That action could not be done.' });
    const channelId = ID.test(String(req.body?.channelId || '')) ? String(req.body.channelId) : '';
    if (req.body?.clear) await clearBanMember(row, userId, channelId);
    else if (minutes !== 0 && !SPANS.has(minutes)) return res.status(400).json({ error: 'That action could not be done.' });
    else await banMember(row, userId, minutes, channelId, String(req.body?.reason || '').slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/role', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const userId = String(req.body?.userId || '');
    const roleId = String(req.body?.roleId || '');
    if (!ID.test(userId) || !ID.test(roleId) || userId === row.vortex_id) {
      return res.status(400).json({ error: 'That action could not be done.' });
    }
    await setMemberRole(row, userId, roleId, !!req.body?.on);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

const REASONS = new Set(['spam', 'harassment', 'hate_speech', 'nsfw', 'self_harm', 'other']);
const SLOWS = new Set([0, 5, 10, 30, 60, 120]);

router.post('/report', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const channelId = String(req.body?.channelId || '');
    const messageId = String(req.body?.messageId || '');
    const reason = String(req.body?.reason || '');
    const note = String(req.body?.note || '').slice(0, 500);
    if (!ID.test(channelId) || !ID.test(messageId) || !REASONS.has(reason)) {
      return res.status(400).json({ error: 'That report could not be sent.' });
    }
    await reportMessage(row, channelId, messageId, reason, note);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/audit', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const after = String(req.query.after || '').slice(0, 80);
    res.json(await auditPage(row, after));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/commands', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    res.json({ commands: await commandList(row) });
  } catch {
    res.json({ commands: [] });
  }
});

router.get('/mentions', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const q = String(req.query.q || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
    if (q.length < 1) return res.json({ users: [] });
    res.json({ users: await mentionUsers(row, q) });
  } catch {
    res.json({ users: [] });
  }
});

router.get('/discord', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    res.json(await discordRooms(row));
  } catch {
    res.json({ connected: false, channels: [] });
  }
});

router.post('/typing', async (req, res) => {
  quiet(res);
  try {
    const channelId = String(req.body?.channelId || '');
    if (!ID.test(channelId)) return res.json({ ok: false });
    const row = readLink(existingLinkKey(req));
    const box = await guildOnly();
    const seat = seatFromRow(row);
    if (!box || !seat?.id || !knownChannel(box, channelId)) return res.json({ ok: false });
    markTyping(channelId, seat);
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

function channelFields(body, creating) {
  const name = String(body?.name || '').trim().slice(0, 40);
  const out = {};
  if (creating || name) out.name = name;
  if (body?.description != null) out.description = String(body.description).slice(0, 140);
  if (body?.category != null) out.category = String(body.category).slice(0, 40);
  const slow = Number(body?.slowmodeSeconds);
  if (SLOWS.has(slow)) out.slowmodeSeconds = slow;
  if (typeof body?.readOnly === 'boolean') out.readOnly = body.readOnly;
  const discord = String(body?.discordChannelId || '');
  if (discord === '' || /^[0-9]{5,32}$/.test(discord)) out.discordChannelId = discord;
  return out;
}

router.post('/channel', async (req, res) => {
  quiet(res);
  try {
    const row = linked(req, res);
    if (!row) return;
    const fields = channelFields(req.body, !req.body?.id);
    const id = String(req.body?.id || '');
    if (id && !ID.test(id)) return res.status(400).json({ error: 'Unknown channel.' });
    if (!id && !fields.name) return res.status(400).json({ error: 'Name the channel first.' });
    if (req.body?.remove) {
      if (!id) return res.status(400).json({ error: 'Unknown channel.' });
      await removeChannel(row, id);
      return res.json({ ok: true });
    }
    const channel = await saveChannel(row, id, fields);
    res.json({ channel });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/presence', async (req, res) => {
  quiet(res);
  try {
    const channelId = String(req.query.channel || '');
    if (!ID.test(channelId)) return res.json({ count: 0, groups: [] });
    const box = await guildOnly();
    if (!box || !knownChannel(box, channelId)) return res.json({ count: 0, groups: [] });
    const seat = seatFromRow(readLink(existingLinkKey(req)));
    if (seat?.id) markSeat(channelId, seat);
    const live = mergeHere(await channelPresence(channelId), channelId);
    live.typing = typingNames(channelId, seat?.id || '');
    res.json(live);
  } catch {
    res.json({ count: 0, groups: [] });
  }
});

router.get('/report-room', (req, res) => {
  const id = vortexClientId();
  if (!id) return res.status(404).end();
  res.redirect(`${VORTEX_ORIGIN}/oauth/report/${encodeURIComponent(id)}?from=embed`);
});

router.get('/face', (req, res) => {
  quiet(res);
  const row = readLink(existingLinkKey(req));
  if (!row) return res.status(401).json({ error: 'Sign in with Vortex again.' });
  const site = readSiteUser(req);
  res.json(faceState(row.vortex_id, site));
});

router.post('/face', (req, res) => {
  quiet(res);
  if (!sameFaceOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
  const type = String(req.get('content-type') || '');
  if (!type.toLowerCase().includes('application/json')) return res.status(400).json({ error: 'Invalid request' });
  const row = readLink(existingLinkKey(req));
  if (!row || !ID.test(String(row.vortex_id || ''))) {
    return res.status(401).json({ error: 'Sign in with Vortex again.' });
  }
  if (typeof req.body?.on !== 'boolean') return res.status(400).json({ error: 'Invalid request' });
  const site = readSiteUser(req);
  if (!site) return res.status(401).json({ error: 'Sign in to PeteZah first.', code: 'SITE' });
  const result = setFace(row.vortex_id, site.id, req.body.on);
  if (!result.ok) {
    const status = result.status === 429 ? 429 : result.status || 400;
    return res.status(status).json({ error: status === 429 ? 'Slow mode is on. Try again in a moment.' : 'Could not update that link.' });
  }
  res.json({ ok: true, ...faceState(row.vortex_id, site) });
});

router.get('/auth', async (req, res) => {
  const ready = await prepareSignIn();
  if (!ready) return res.status(503).json({ error: 'Vortex sign-in is not connected yet.' });
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');
  const redirectUri = `${callbackOrigin(req)}/api/chat/callback`;
  const returnTo = safeReturnTo(req.query.return) || 'petezah://chat';
  const pack = { state, verifier, exp: Date.now() + 10 * 60 * 1000, redirectUri, returnTo };
  ensureLinkKey(req);
  req.session.vortexOauth = pack;
  res.cookie('pz_vtx', signPack(pack), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!req.secure,
    maxAge: 10 * 60 * 1000,
    path: '/',
  });
  const nextUrl = authorizeUrl({ redirectUri, state, challenge });
  req.session.save(() => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Vortex</title></head><body><script>location.replace(${JSON.stringify(nextUrl)})</script></body></html>`);
  });
});

router.get('/callback', (req, res) => sendReturn(req, res));
router.get('/finish', completeLogin);

export default router;
