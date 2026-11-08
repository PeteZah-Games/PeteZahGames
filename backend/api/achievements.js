import db from '../db.js';
import rateLimit from 'express-rate-limit';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';
import { bumpUsage } from '../utils/usage-daily.js';

export const ACHIEVEMENTS = [
  { id: 'welcome_explorer', name: 'Welcome Explorer', desc: 'Create a PeteZah account', rarity: 'common', icon: 'Compass', color: '#6ee7b7', manual: false },
  { id: 'first_adventure', name: 'First Adventure', desc: 'Play your first game', rarity: 'common', icon: 'Gamepad2', color: '#93c5fd', manual: false },
  { id: 'identity_created', name: 'Identity Created', desc: 'Customize your profile', rarity: 'common', icon: 'UserRound', color: '#a5b4fc', manual: false },
  { id: 'music_starter', name: 'Music Starter', desc: 'Add your first song to your profile', rarity: 'common', icon: 'Music', color: '#f9a8d4', manual: false },
  { id: 'link_collector', name: 'Link Collector', desc: 'Save your first bookmark', rarity: 'common', icon: 'Bookmark', color: '#67e8f9', manual: false },
  { id: 'ai_apprentice', name: 'AI Apprentice', desc: 'Send your first AI message', rarity: 'common', icon: 'Bot', color: '#c4b5fd', manual: false },
  { id: 'virtual_explorer', name: 'Virtual Explorer', desc: 'Launch Firefox VM for the first time', rarity: 'common', icon: 'Monitor', color: '#7dd3fc', manual: false },
  { id: 'game_collector', name: 'Game Collector', desc: 'Play 25 different games', rarity: 'rare', icon: 'Dice5', color: '#38bdf8', manual: false },
  { id: 'internet_explorer', name: 'Internet Explorer', desc: 'Visit 50 different websites through the proxy', rarity: 'rare', icon: 'Globe', color: '#34d399', manual: false },
  { id: 'playlist_creator', name: 'Playlist Creator', desc: 'Create your first playlist', rarity: 'rare', icon: 'ListMusic', color: '#fb7185', manual: false },
  { id: 'social_butterfly', name: 'Social Butterfly', desc: 'Send 100 chat messages', rarity: 'rare', icon: 'MessageCircle', color: '#f472b6', manual: false },
  { id: 'week_warrior', name: 'Week Warrior', desc: 'Use PeteZah for 7 consecutive days', rarity: 'rare', icon: 'Flame', color: '#fb923c', manual: false },
  { id: 'profile_artist', name: 'Profile Artist', desc: 'Fully customize your profile', rarity: 'rare', icon: 'Palette', color: '#e879f9', manual: false },
  { id: 'gaming_legend', name: 'Gaming Legend', desc: 'Play 100 different games', rarity: 'epic', icon: 'Trophy', color: '#818cf8', manual: false },
  { id: 'dedicated_user', name: 'Dedicated User', desc: 'Spend 10 hours on PeteZah', rarity: 'epic', icon: 'Timer', color: '#a78bfa', manual: false },
  { id: 'community_star', name: 'Community Star', desc: 'Receive 50 profile views', rarity: 'epic', icon: 'Star', color: '#fbbf24', manual: false },
  { id: 'achievement_hunter', name: 'Achievement Hunter', desc: 'Unlock 10 other achievements', rarity: 'epic', icon: 'Medal', color: '#f59e0b', manual: false },
  { id: 'power_user', name: 'Power User', desc: 'Spend 100 hours on PeteZah', rarity: 'legendary', icon: 'Rocket', color: '#f43f5e', manual: false },
  { id: 'ultimate_explorer', name: 'Ultimate Explorer', desc: 'Play 1000 games', rarity: 'legendary', icon: 'Sparkles', color: '#ec4899', manual: false },
  { id: 'beta_pioneer', name: 'Beta Pioneer', desc: 'Joined during beta / early access', rarity: 'legendary', icon: 'FlaskConical', color: '#14b8a6', manual: true },
  { id: 'bug_hunter', name: 'Bug Hunter', desc: 'Report a verified bug', rarity: 'legendary', icon: 'Bug', color: '#22c55e', manual: true },
  { id: 'contributor', name: 'Contributor', desc: 'Contribute code, content, or help', rarity: 'legendary', icon: 'Wrench', color: '#3b82f6', manual: true },
  { id: 'founder', name: 'Founder', desc: 'Owner-only badge', rarity: 'special', icon: 'Crown', color: '#f43f5e', manual: true },
];

const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3, special: 4 };
const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export const achievementEventLimiter = rateLimit({
  windowMs: 60000,
  max: 30,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many events' },
});

export const adminBadgeLimiter = rateLimit({
  windowMs: 60000,
  max: 60,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many badge actions' },
});

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
  return { id: req.session.user.id, is_admin: Math.max(level, owner ? 3 : level), is_owner: owner };
}

function ensureStats(userId) {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO user_stats
     (user_id, time_ms, games_played, unique_games, vm_sessions, ai_messages, chat_messages,
      proxy_hosts, bookmarks, playlists, profile_views, streak_days, last_active_day,
      last_heartbeat, created_at, updated_at)
     VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, ?, ?)`
  ).run(userId, now, now);
  return db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
}

function parseFavoriteMusic(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function unlockAchievement(userId, achievementId) {
  if (!userId || !ACHIEVEMENT_MAP.has(achievementId)) return false;
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
       VALUES (?, ?, ?)`
    )
    .run(userId, achievementId, now);
  return info.changes > 0;
}

function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function yesterdayKey(ts = Date.now()) {
  return dayKey(ts - 86400000);
}

export function evaluateAchievements(userId) {
  if (!userId) return [];
  const user = db
    .prepare(
      `SELECT id, email, username, display_name, bio, avatar_url, status, location, website,
       profile_color, banner_url, favorite_music, is_admin FROM users WHERE id = ?`
    )
    .get(userId);
  if (!user) return [];
  const stats = ensureStats(userId);
  const newly = [];
  const tryUnlock = (id, cond) => {
    if (cond && unlockAchievement(userId, id)) newly.push(id);
  };

  tryUnlock('welcome_explorer', true);
  tryUnlock('first_adventure', (stats.games_played || 0) >= 1);
  tryUnlock('virtual_explorer', (stats.vm_sessions || 0) >= 1);
  tryUnlock('game_collector', (stats.unique_games || 0) >= 25);
  tryUnlock('gaming_legend', (stats.unique_games || 0) >= 100);
  tryUnlock('ultimate_explorer', (stats.games_played || 0) >= 1000);
  tryUnlock('dedicated_user', (stats.time_ms || 0) >= 10 * 3600000);
  tryUnlock('power_user', (stats.time_ms || 0) >= 100 * 3600000);
  tryUnlock('internet_explorer', (stats.proxy_hosts || 0) >= 50);
  tryUnlock('ai_apprentice', (stats.ai_messages || 0) >= 1);
  tryUnlock('link_collector', (stats.bookmarks || 0) >= 1);
  tryUnlock('playlist_creator', (stats.playlists || 0) >= 1);
  tryUnlock('social_butterfly', (stats.chat_messages || 0) >= 100);
  tryUnlock('week_warrior', (stats.streak_days || 0) >= 7);
  tryUnlock('community_star', (stats.profile_views || 0) >= 50);

  const favs = parseFavoriteMusic(user.favorite_music);
  tryUnlock('music_starter', favs.length >= 1);

  const hasIdentity =
    !!(user.username && String(user.username).trim()) &&
    (!!(user.bio && String(user.bio).trim()) ||
      !!(user.avatar_url && String(user.avatar_url).trim()) ||
      !!(user.display_name && String(user.display_name).trim()));
  tryUnlock('identity_created', hasIdentity);

  const profileArtist =
    !!(user.username && String(user.username).trim()) &&
    !!(user.bio && String(user.bio).trim()) &&
    !!(user.avatar_url && String(user.avatar_url).trim()) &&
    favs.length >= 1 &&
    (!!(user.website && String(user.website).trim()) || !!(user.location && String(user.location).trim())) &&
    !!(user.profile_color && user.profile_color !== '#4d8dff');
  tryUnlock('profile_artist', profileArtist);

  const unlockedCount = db
    .prepare('SELECT COUNT(*) as c FROM user_achievements WHERE user_id = ?')
    .get(userId)?.c || 0;
  tryUnlock('achievement_hunter', unlockedCount >= 10);

  const owner = isOwnerEmail(user.email);
  tryUnlock('founder', owner);

  return newly;
}

export function recordTimeHeartbeat(userId, deltaMs = 12000) {
  if (!userId) return;
  const now = Date.now();
  const stats = ensureStats(userId);
  if (stats.last_heartbeat && now - stats.last_heartbeat < 5000) return;

  let add = Math.min(Math.max(0, deltaMs), 20000);
  const today = dayKey(now);
  let streak = stats.streak_days || 0;
  const dayChanged = stats.last_active_day !== today;
  if (dayChanged) {
    if (stats.last_active_day === yesterdayKey(now)) streak = Math.max(1, streak) + 1;
    else streak = 1;
  }

  db.prepare(
    `UPDATE user_stats SET
       time_ms = time_ms + ?,
       last_heartbeat = ?,
       streak_days = ?,
       last_active_day = ?,
       updated_at = ?
     WHERE user_id = ?`
  ).run(add, now, streak, today, now, userId);

  if (add > 0 || dayChanged) evaluateAchievements(userId);
}

export function recordVmSession(userId) {
  if (!userId) return;
  const now = Date.now();
  ensureStats(userId);
  db.prepare(
    `UPDATE user_stats SET vm_sessions = vm_sessions + 1, updated_at = ? WHERE user_id = ?`
  ).run(now, userId);
  evaluateAchievements(userId);
}

const STAT_UPDATE_QUERIES = {
  ai_messages: 'UPDATE user_stats SET ai_messages = ai_messages + ?, updated_at = ? WHERE user_id = ?',
  chat_messages: 'UPDATE user_stats SET chat_messages = chat_messages + ?, updated_at = ? WHERE user_id = ?',
  bookmarks: 'UPDATE user_stats SET bookmarks = bookmarks + ?, updated_at = ? WHERE user_id = ?',
  playlists: 'UPDATE user_stats SET playlists = playlists + ?, updated_at = ? WHERE user_id = ?',
  profile_views: 'UPDATE user_stats SET profile_views = profile_views + ?, updated_at = ? WHERE user_id = ?',
};

export function bumpStat(userId, column, by = 1) {
  if (!userId) return;
  const query = STAT_UPDATE_QUERIES[column];
  if (!query) return;
  ensureStats(userId);
  const now = Date.now();
  db.prepare(query).run(Math.min(Math.max(1, by), 5), now, userId);
  try {
    if (column === 'ai_messages') bumpUsage('ai', Math.min(Math.max(1, by), 5));
    if (column === 'chat_messages') bumpUsage('chat', Math.min(Math.max(1, by), 5));
  } catch {}
  evaluateAchievements(userId);
}

const proxyHostThrottle = new Map();

export function trackProxyHosts(userId, urls) {
  if (!userId || !Array.isArray(urls) || !urls.length) return;
  const now = Date.now();
  const last = proxyHostThrottle.get(userId) || 0;
  if (now - last < 30000) return;
  proxyHostThrottle.set(userId, now);
  if (proxyHostThrottle.size > 20000) {
    for (const [k, t] of proxyHostThrottle) {
      if (now - t > 120000) proxyHostThrottle.delete(k);
    }
  }
  ensureStats(userId);
  const stats = db.prepare('SELECT proxy_hosts FROM user_stats WHERE user_id = ?').get(userId);
  if ((stats?.proxy_hosts || 0) >= 2000) return;

  let added = 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO user_proxy_hosts (user_id, host) VALUES (?, ?)`
  );
  for (const raw of urls.slice(0, 4)) {
    if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw)) continue;
    try {
      const host = new URL(raw).hostname.toLowerCase().slice(0, 120);
      if (!host || host.length < 3) continue;
      const info = insert.run(userId, host);
      if (info.changes > 0) added += 1;
    } catch {}
  }
  if (added > 0) {
    const now = Date.now();
    db.prepare(
      `UPDATE user_stats SET proxy_hosts = proxy_hosts + ?, updated_at = ? WHERE user_id = ?`
    ).run(added, now, userId);
    const next = (stats?.proxy_hosts || 0) + added;
    if (next === 50 || next % 25 === 0) evaluateAchievements(userId);
  }
}

const profileViewGate = new Map();

export function trackProfileView(profileUserId, viewerId) {
  if (!profileUserId) return;
  if (viewerId && viewerId === profileUserId) return;
  const key = `${viewerId || 'anon'}:${profileUserId}`;
  const now = Date.now();
  const last = profileViewGate.get(key) || 0;
  if (now - last < 60000) return;
  profileViewGate.set(key, now);
  if (profileViewGate.size > 5000 || Math.random() < 0.02) {
    for (const [k, t] of profileViewGate) {
      if (now - t > 120000) profileViewGate.delete(k);
    }
  }
  bumpStat(profileUserId, 'profile_views', 1);
}

const EVENT_MAP = {
  bookmark: 'bookmarks',
  playlist: 'playlists',
  ai_message: 'ai_messages',
  chat_message: 'chat_messages',
};

export function achievementEventHandler(req, res) {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  const type = typeof req.body?.type === 'string' ? req.body.type.trim() : '';
  const col = EVENT_MAP[type];
  if (!col) return res.status(400).json({ error: 'Invalid event' });
  bumpStat(req.session.user.id, col, 1);
  res.json({ ok: true });
}

function packBadge(a, unlockedAt = null, progress = null) {
  return {
    id: a.id,
    name: a.name,
    desc: a.desc,
    rarity: a.rarity,
    icon: a.icon,
    color: a.color,
    manual: !!a.manual,
    unlocked: unlockedAt != null,
    unlockedAt,
    progress,
  };
}

function buildProgress(a, stats, user, unlockedCount) {
  const clamp = (n, max) => Math.max(0, Math.min(Number(n) || 0, max));
  const hours = Math.floor((stats.time_ms || 0) / 3600000);
  const favs = parseFavoriteMusic(user?.favorite_music).length;
  const hasIdentity =
    !!(user?.username && String(user.username).trim()) &&
    (!!(user?.bio && String(user.bio).trim()) ||
      !!(user?.avatar_url && String(user.avatar_url).trim()) ||
      !!(user?.display_name && String(user.display_name).trim()));
  const profileArtist =
    !!(user?.username && String(user.username).trim()) &&
    !!(user?.bio && String(user.bio).trim()) &&
    !!(user?.avatar_url && String(user.avatar_url).trim()) &&
    favs >= 1 &&
    (!!(user?.website && String(user.website).trim()) || !!(user?.location && String(user.location).trim())) &&
    !!(user?.profile_color && user.profile_color !== '#4d8dff');

  const map = {
    welcome_explorer: { current: 1, target: 1, unit: 'account created' },
    first_adventure: { current: clamp(stats.games_played, 1), target: 1, unit: 'games played' },
    identity_created: { current: hasIdentity ? 1 : 0, target: 1, unit: 'profile customized' },
    music_starter: { current: clamp(favs, 1), target: 1, unit: 'song on profile' },
    link_collector: { current: clamp(stats.bookmarks, 1), target: 1, unit: 'bookmark saved' },
    ai_apprentice: { current: clamp(stats.ai_messages, 1), target: 1, unit: 'AI message' },
    virtual_explorer: { current: clamp(stats.vm_sessions, 1), target: 1, unit: 'VM launch' },
    game_collector: { current: clamp(stats.unique_games, 25), target: 25, unit: 'games played' },
    internet_explorer: { current: clamp(stats.proxy_hosts, 50), target: 50, unit: 'sites visited' },
    playlist_creator: { current: clamp(stats.playlists, 1), target: 1, unit: 'playlist created' },
    social_butterfly: { current: clamp(stats.chat_messages, 100), target: 100, unit: 'chat messages' },
    week_warrior: { current: clamp(stats.streak_days, 7), target: 7, unit: 'day streak' },
    profile_artist: { current: profileArtist ? 1 : 0, target: 1, unit: 'full profile' },
    gaming_legend: { current: clamp(stats.unique_games, 100), target: 100, unit: 'games played' },
    dedicated_user: { current: clamp(hours, 10), target: 10, unit: 'hours on site' },
    community_star: { current: clamp(stats.profile_views, 50), target: 50, unit: 'profile views' },
    achievement_hunter: { current: clamp(unlockedCount, 10), target: 10, unit: 'achievements' },
    power_user: { current: clamp(hours, 100), target: 100, unit: 'hours on site' },
    ultimate_explorer: { current: clamp(stats.games_played, 1000), target: 1000, unit: 'games played' },
  };
  return map[a.id] || null;
}

function packAchievements(userId, { includeManual = false, viewerIsStaff = false } = {}) {
  const unlockedRows = db
    .prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?')
    .all(userId);
  const unlockedMap = new Map(unlockedRows.map((r) => [r.achievement_id, r.unlocked_at]));
  const stats = ensureStats(userId);
  const showManual = includeManual || viewerIsStaff;
  const user = db
    .prepare(
      `SELECT username, display_name, bio, avatar_url, location, website, profile_color, favorite_music
       FROM users WHERE id = ?`
    )
    .get(userId);
  const unlockedCount = unlockedRows.length;

  const list = ACHIEVEMENTS.filter((a) => {
    if (a.manual || a.rarity === 'special') return showManual;
    return true;
  })
    .map((a) => {
      const unlockedAt = unlockedMap.has(a.id) ? unlockedMap.get(a.id) : null;
      let progress = buildProgress(a, stats, user, unlockedCount);
      if (unlockedAt != null && progress) {
        progress = { ...progress, current: progress.target };
      }
      return packBadge(a, unlockedAt, progress);
    })
    .sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
    });

  const visibleTotal = ACHIEVEMENTS.filter((a) => !a.manual && a.rarity !== 'special').length;

  return {
    achievements: list,
    unlockedCount: list.filter((a) => a.unlocked && !a.manual).length,
    total: showManual ? ACHIEVEMENTS.length : visibleTotal,
    stats: {
      timeMs: stats.time_ms || 0,
      gamesPlayed: stats.games_played || 0,
      uniqueGames: stats.unique_games || 0,
      vmSessions: stats.vm_sessions || 0,
      proxyHosts: stats.proxy_hosts || 0,
      streakDays: stats.streak_days || 0,
      profileViews: stats.profile_views || 0,
    },
  };
}

export function getMyAchievementsHandler(req, res) {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  const me = db.prepare('SELECT email, is_admin FROM users WHERE id = ?').get(req.session.user.id);
  const staff = (me?.is_admin || 0) >= 1 || isOwnerEmail(me?.email);
  evaluateAchievements(req.session.user.id);
  res.json(packAchievements(req.session.user.id, { viewerIsStaff: staff }));
}

export function getUserAchievementsPublic(userId, showcaseIds = null) {
  if (!userId) return [];
  evaluateAchievements(userId);
  const unlocked = db
    .prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?')
    .all(userId)
    .map((r) => r.achievement_id);
  let ids = unlocked;
  if (Array.isArray(showcaseIds)) {
    const allow = new Set(unlocked);
    ids = showcaseIds.filter((id) => typeof id === 'string' && allow.has(id)).slice(0, 12);
  }
  return ACHIEVEMENTS.filter((a) => ids.includes(a.id)).map((a) => ({
    id: a.id,
    name: a.name,
    rarity: a.rarity,
    icon: a.icon,
    color: a.color,
  }));
}

export function achievementHeartbeatHandler(req, res) {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  recordTimeHeartbeat(req.session.user.id, 12000);
  res.json({ ok: true });
}

export function getAdminUserAchievements(userId) {
  return packAchievements(userId, { includeManual: true, viewerIsStaff: true });
}

export function getBadgeCatalogHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.json({
    badges: ACHIEVEMENTS.map((a) => ({
      id: a.id,
      name: a.name,
      desc: a.desc,
      rarity: a.rarity,
      icon: a.icon,
      color: a.color,
      manual: !!a.manual,
    })),
  });
}

export function adminSetUserBadgeHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const userId = String(req.params.id || '');
  const badgeId = typeof req.body?.badgeId === 'string' ? req.body.badgeId.trim() : '';
  const grant = req.body?.grant !== false;
  if (!userId || !ACHIEVEMENT_MAP.has(badgeId)) {
    return res.status(400).json({ error: 'Invalid badge' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (grant) {
    unlockAchievement(userId, badgeId);
  } else {
    db.prepare('DELETE FROM user_achievements WHERE user_id = ? AND achievement_id = ?').run(
      userId,
      badgeId
    );
  }
  res.json({ ok: true, achievements: getAdminUserAchievements(userId).achievements });
}
