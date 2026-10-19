import './load-env.js';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import bareServerPkg from '@tomphttp/bare-server-node';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import session from 'express-session';
import { randomBytes } from 'crypto';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'process';
import BetterSqlite3Session from 'better-sqlite3-session-store';
import httpProxy from 'http-proxy';
import { PX, isStreamUpgrade, toWispLibUrl } from './px-paths.js';
import { toMochiBackendPath } from './mochi-path.js';
import { applySeoToHtml, isPeteZahHomeHost } from './utils/seo-meta.js';
import fs, { existsSync } from 'node:fs';

import { createRouteTimingMiddleware } from './utils/route-metrics.js';
import { installErrorHooks } from './utils/error-ring.js';
import { createCorsConfig, createSecurityHeaders, createUploadGuard, wrapCrossSiteCookies } from './middleware/http-security.js';
import { attachSvgSessionSid, injectSvgSessionCookie } from './utils/svg-session.js';
import { ddosShield } from './security/ddos-shield.js';
import { toIPv4, systemState, createGateMiddleware, createMemoryProtection, checkCircuitBreaker, checkSystemPressure, cleanupSecurityMaps, isTrustedWS, adjustPowDifficulty, isKillSwitchUrlExempt, updateIPReputation, getTokenSecret } from './middleware/security.js';
import { assertProductionSecrets } from './utils/secrets.js';
import { setShieldRef } from './utils/shield-ref.js';
import {
  getAdminOverviewHandler,
  setAttackModeHandler,
  setKillSwitchHandler,
  getAdminRouteMetricsHandler,
  getAdminErrorsHandler,
} from './api/admin-dashboard.js';
import { authLimiter, signinLimiter, createApiLimiter, createAiLimiter, signupLimiter, localStorageLimiter, pfpLimiter, securityActionLimiter, adminOverviewLimiter, aiConversationsLimiter, musicBrowseLimiter, musicSearchLimiter, musicPlayLimiter, musicStreamLimiter } from './middleware/rate-limit.js';
import challengeRouter from './routes/challenge.js';
import aiRouter from './routes/ai.js';
import moviesRouter from './routes/movies.js';
import musicRouter from './routes/music.js';
import searchSuggestRouter from './routes/search-suggest.js';
import studyPulseRouter from './routes/study-pulse.js';
import mochiRouter from './routes/mochi.js';
import chatRouter from './routes/chat.js';
import { mountRevAssets } from './routes/rev-assets.js';
import db from './db.js';

import { signupHandler } from './api/signup.js';
import { signinHandler } from './api/signin.js';
import { signoutHandler } from './api/signout.js';
import { getMeHandler, updateProfileHandler, uploadAvatarHandler, uploadBannerHandler, getPublicProfileHandler } from './api/user.js';
import { getSettingsHandler, saveSettingsHandler } from './api/settings.js';
import {
  listConversationsHandler,
  getConversationHandler,
  upsertConversationHandler,
  renameConversationHandler,
  deleteConversationHandler,
  createShareHandler,
  revokeShareHandler,
  getSharedConversationHandler,
  adminAiPromptsHandler,
} from './api/ai-conversations.js';
import { addCommentHandler, getCommentsHandler, deleteCommentHandler, cleanupMaliciousCommentsHandler } from './api/comments.js';
import { likeHandler, getLikesHandler } from './api/likes.js';
import { adminUserActionHandler } from './api/admin-user-action.js';
import { getAdminUsersHandler, getAdminUserHandler, getAdminUserRevealHandler, getAdminStaffHandler, getBadgeRarityLeaderboardHandler } from './api/admin-users.js';
import { createIpBanMiddleware } from './middleware/ip-ban.js';
import { getChangelogHandler, createChangelogHandler, deleteChangelogHandler } from './api/changelog.js';
import { listNotificationsHandler, markNotificationsReadHandler } from './api/notifications.js';
import { getFeedbackHandler, createFeedbackHandler, deleteFeedbackHandler } from './api/feedback.js';
import {
  reportPresenceHandler,
  getLiveSitesHandler,
  listAnnouncementsHandler,
  getActiveAnnouncementHandler,
  createAnnouncementHandler,
  setAnnouncementActiveHandler,
} from './api/admin-presence.js';
import {
  firefoxVmLimiter,
  firefoxVmHeartbeatHandler,
  firefoxVmEndHandler,
  getFirefoxVmLiveHandler,
  getFirefoxVmHistoryHandler,
} from './api/firefox-vm.js';
import {
  verifyEmailHandler,
  resendVerificationHandler,
} from './api/verify-email.js';
import {
  linksClaimLimiter,
  linksTotpLimiter,
  getLinksStatusHandler,
  setupLinksTotpHandler,
  enableLinksTotpHandler,
  disableLinksTotpHandler,
  claimLinkHandler,
  getAdminLinkStatsHandler,
} from './api/get-links.js';
import {
  accountTotpLimiter,
  auth2faStatusHandler,
  verifyLogin2faHandler,
  setupAccount2faHandler,
  enableAccount2faHandler,
} from './api/account-2fa.js';
import { elevated2faGate } from './middleware/elevated-2fa-gate.js';
import {
  adsGateLimiter,
  adsGateHandler,
  adsVastLimiter,
  adsVastHandler,
  adsVastXmlHandler,
  adsShownHandler,
} from './api/ads.js';
import { adReportsLimiter, getAdminAdReportsHandler } from './api/ad-reports.js';
import {
  aiGrantsLimiter,
  listAiGrantsHandler,
  createAiGrantHandler,
  updateAiGrantHandler,
  cancelAiGrantHandler,
} from './api/ai-grants.js';
import {
  getMyAchievementsHandler,
  achievementHeartbeatHandler,
  achievementEventHandler,
  achievementEventLimiter,
  getBadgeCatalogHandler,
  adminSetUserBadgeHandler,
  adminBadgeLimiter,
} from './api/achievements.js';
import {
  recordGamePlayHandler,
  getGamePlaysMapHandler,
  getAdminGameStatsHandler,
  getAdminGameLiveHandler,
  gamePlayLimiter,
  achievementHeartbeatLimiter,
} from './api/game-stats.js';
import {
  getGamesCatalogHandler,
  getAdminExcludedGamesHandler,
  adminExcludeGameHandler,
  adminUnexcludeGameHandler,
  adminAddGlobalGameHandler,
  adminRemoveGlobalGameHandler,
  adminUpdateGameHandler,
  adminGamesLimiter,
} from './api/game-catalog.js';
import { websocketNormalHandler, websocketTorHandler } from './api/websocket-auth.js';
import capRouter from './routes/cap.js';
import { createCapGateMiddleware, sendVerifyPage, requireGateUpgrade } from './middleware/cap-gate.js';
import { cleanupCapStore } from './cap/store.js';
import { legalAcceptHandler, legalStatusHandler } from './legal/accept.js';
import { redirectLegal, sendLegalPage } from './legal/pages.js';

const { createBareServer } = bareServerPkg;
const SqliteStore = BetterSqlite3Session(session);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

installErrorHooks();
assertProductionSecrets();
getTokenSecret();

logging.set_level(process.env.WISP_DEBUG === '1' ? logging.INFO : logging.ERROR);
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = false;
wisp.options.allow_direct_ip = false;
wisp.options.port_whitelist = [80, 443, 8080, 8443];
wisp.options.stream_limit_per_host = 12;
wisp.options.stream_limit_total = 48;
wisp.options.dns_ttl = 300;
wisp.options.dns_result_order = 'ipv4first';
wisp.options.parse_real_ip = true;
wisp.options.parse_real_ip_from = ['127.0.0.1', '::1'];

const bare = createBareServer(PX.edge, { websocket: { maxPayloadLength: 4096 } });
const barePremium = createBareServer('/api/bare-premium/', { websocket: { maxPayloadLength: 4096 } });
const app = express();
const mathPath = path.join(__dirname, '../public/math');
const q9Path = path.join(__dirname, '../public/q9vx');
const m4Path = path.join(__dirname, '../public/m4thx');
const e7Path = path.join(__dirname, '../public/e7px');
const l9Path = path.join(__dirname, '../public/l9cx');

app.set('trust proxy', ['127.0.0.1', '::1']);

const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
const shield = ddosShield(discordClient);
setShieldRef(shield);

discordClient.login(process.env.BOT_TOKEN).catch(err => console.error('Discord bot login failed:', err.message));
shield.registerCommands(discordClient);
discordClient.systemState = systemState;

const apiLimiter = createApiLimiter(shield);
const aiLimiter = createAiLimiter(shield);

app.use(createSecurityHeaders());
app.use(injectSvgSessionCookie);
app.use(cookieParser());
app.use(wrapCrossSiteCookies());
app.use(compression({
  level: 1,
  threshold: 2048,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    const p = req.path || req.url || '';
    if (p.startsWith('/n/m/') || p.startsWith('/f/g/') || p.startsWith('/!!/') || p.startsWith('/!cover!/') || p.startsWith('/storage/ag/')) return false;
    const ct = String(res.getHeader('Content-Type') || '');
    if (/image|video|audio|wasm|octet-stream|font\/|woff|zip|gzip|br\b|mp4|webm|png|jpe?g|gif|webp|avif|wasm/i.test(ct)) {
      return false;
    }
    return compression.filter(req, res);
  },
}));
app.use(cors(createCorsConfig()));
const jsonParser = express.json({ limit: '512kb' });
const generateJsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '64kb', parameterLimit: 50 });
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req, res, next) => {
  if (!BODY_METHODS.has(req.method)) return next();
  const p = req.path || '';
  if (!p.startsWith('/api/') && p !== '/cap' && !p.startsWith('/cap/')) return next();
  if (p.startsWith('/api/generate')) return next();
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (!BODY_METHODS.has(req.method)) return next();
  const p = req.path || '';
  if (!p.startsWith('/api/') && p !== '/cap' && !p.startsWith('/cap/')) return next();
  return urlencodedParser(req, res, next);
});

function sessionSecret() {
  const secret = process.env.SESSION_SECRET || '';
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    console.error('SESSION_SECRET must be at least 32 characters');
    process.exit(1);
  }
  return secret || randomBytes(32).toString('hex');
}

app.use(session({
  store: new SqliteStore({ client: db }),
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  name: 'pz.sid',
  cookie: {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  rolling: true,
}));
app.use(attachSvgSessionSid());
app.use(createRouteTimingMiddleware());

app.use(createMemoryProtection(shield));
app.use(createIpBanMiddleware());
app.use(createGateMiddleware(shield));
app.use(createCapGateMiddleware());

app.get('/verify', sendVerifyPage);
app.get('/verify.html', sendVerifyPage);
app.get('/terms', sendLegalPage('terms'));
app.get('/privacy-policy', sendLegalPage('privacy'));
app.get('/dmca', sendLegalPage('dmca'));
app.get('/tos', redirectLegal('/terms'));
app.get('/terms-of-service', redirectLegal('/terms'));
app.get('/terms-of-use', redirectLegal('/terms'));
app.get('/privacy', redirectLegal('/privacy-policy'));
app.get('/copyright', redirectLegal('/dmca'));
app.get('/api/legal/status', legalStatusHandler);
app.post('/api/legal/accept', legalAcceptHandler);
app.use('/cap', capRouter);
app.use('/vendor/three', express.static(path.join(__dirname, '../node_modules/three/build'), { index: false, maxAge: '7d' }));
app.use('/vendor/vanta', express.static(path.join(__dirname, '../node_modules/vanta/dist'), { index: false, maxAge: '7d' }));
const capVendorDir = path.join(__dirname, '../public/vendor/cap');
const capVendorFiles = new Set(['cap.min.js', 'cap_wasm_bg.wasm', 'pako_inflate.min.js']);
app.get('/vendor/cap/:file', (req, res) => {
  const file = path.basename(String(req.params.file || ''));
  if (!capVendorFiles.has(file)) return res.status(404).end();
  res.setHeader(
    'Content-Type',
    file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8',
  );
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.sendFile(file, { root: capVendorDir, dotfiles: 'deny', maxAge: '7d' }, (err) => {
    if (err && !res.headersSent) res.status(err.statusCode || 404).end();
  });
});

app.get('/api/websocket/normal/', websocketNormalHandler);
app.get('/api/websocket/normal', websocketNormalHandler);
app.get('/api/websocket/tor/', websocketTorHandler);
app.get('/api/websocket/tor', websocketTorHandler);

const AUTH_PATHS = new Set([
  '/api/signin',
  '/api/signup',
  '/api/bot-challenge',
  '/api/bot-verify',
  '/api/verify-email',
  '/api/verify-email/resend',
  '/api/legal/accept',
  '/api/legal/status',
  '/signin',
  '/signup',
  '/bot-challenge',
  '/bot-verify',
  '/verify-email',
  '/verify-email/resend',
  '/legal/accept',
  '/legal/status',
]);
app.use('/api/', (req, res, next) => {
  if (req.path === '/websocket/normal' || req.path === '/websocket/normal/' || req.path === '/websocket/tor' || req.path === '/websocket/tor/') {
    return next();
  }
  if (req.path === '/ads/net.js') return next();
  if (req.path.startsWith('/music/media/')) return next();
  if (req.path.startsWith('/study/') || req.path.startsWith('/flashcards/') || req.path.startsWith('/quiz/')) return next();
  return AUTH_PATHS.has(req.path) ? authLimiter(req, res, next) : apiLimiter(req, res, next);
});
app.use(PX.edge, apiLimiter);

app.use((req, res, next) => {
  const p = req.path || '';
  if (PX.blocked.some((b) => p === b.slice(0, -1) || p.startsWith(b))) {
    return res.status(404).end();
  }
  if (p === '/sw.js') return res.status(404).end();
  next();
});

function engineCache(res) {
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
}
app.get('/q9vx/ld.bin', (_req, res) => {
  res.setHeader('Content-Type', 'application/wasm');
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  res.sendFile(path.join(q9Path, 'sj.wasm.wasm'));
});
app.use(PX.core, express.static(q9Path, { index: false, setHeaders: engineCache }));
app.use(PX.mux, express.static(m4Path, { index: false, setHeaders: engineCache }));
app.use(PX.mux, express.static(mathPath, { index: false }));
app.use(PX.epoxy, express.static(e7Path, { index: false, setHeaders: engineCache }));
app.use(PX.curl, express.static(l9Path, { index: false, setHeaders: engineCache }));
app.use('/uploads', createUploadGuard(), express.static(path.join(__dirname, '../uploads'), { dotfiles: 'deny', index: false }));

const firefoxWasmCandidates = [
  path.join(__dirname, '../public/firefox-wasm'),
  path.join(__dirname, '../dist/firefox-wasm'),
];
const firefoxWasmPath = firefoxWasmCandidates.find((p) => existsSync(p));

if (firefoxWasmPath) {
  app.use(
    '/firefox-wasm',
    (req, res, next) => {
      const p = req.path || '';
      const isThanks = p === '/thanks.html';
      if (!isThanks && !req.session?.user?.id) {
        return res.status(401).type('text/plain').send('Sign in required');
      }
      if (isThanks) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      } else {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('Cache-Control', 'private, max-age=3600');
      }
      next();
    },
    express.static(firefoxWasmPath, { index: false, fallthrough: false, dotfiles: 'deny' })
  );
}

function sendSw(res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  const pub = path.join(__dirname, '../public/1k123.js');
  const built = path.join(__dirname, '../dist/1k123.js');
  res.sendFile(existsSync(pub) ? pub : built);
}

app.get(PX.sw, (_req, res) => sendSw(res));
app.get('/1k123.js', (_req, res) => sendSw(res));

app.use('/api', challengeRouter);
app.use('/api', elevated2faGate);
app.use('/api/generate', aiLimiter, generateJsonParser, aiRouter);
app.use('/api/tmdb', moviesRouter);
app.use('/api/study', studyPulseRouter);
app.use('/api/flashcards', studyPulseRouter);
app.use('/api/quiz', studyPulseRouter);
app.use('/api/music/browse', musicBrowseLimiter);
app.use('/api/music/trending', musicBrowseLimiter);
app.use('/api/music/home', musicBrowseLimiter);
app.use('/api/music/search', musicSearchLimiter);
app.use('/api/music/stream', musicPlayLimiter);
app.use('/api/music/play', musicPlayLimiter);
app.use('/api/music/media', musicStreamLimiter);
app.use('/api/music', musicRouter);
app.use('/api/search', searchSuggestRouter);
app.use('/api/chat', chatRouter);

app.post('/api/signup', signupLimiter, signupHandler);
app.post('/api/signin', signinLimiter, signinHandler);
app.post('/api/signout', signoutHandler);
app.get('/api/verify-email', verifyEmailHandler);
app.post('/api/verify-email/resend', authLimiter, resendVerificationHandler);

app.get('/api/auth/2fa/status', auth2faStatusHandler);
app.post('/api/auth/2fa/verify', accountTotpLimiter, verifyLogin2faHandler);
app.post('/api/auth/2fa/setup', accountTotpLimiter, setupAccount2faHandler);
app.post('/api/auth/2fa/enable', accountTotpLimiter, enableAccount2faHandler);

app.get('/api/me', getMeHandler);
app.put('/api/me', updateProfileHandler);
app.post('/api/me/avatar', pfpLimiter, uploadAvatarHandler);
app.post('/api/me/banner', pfpLimiter, uploadBannerHandler);
app.get('/api/user/:username', getPublicProfileHandler);

app.get('/api/links/status', getLinksStatusHandler);
app.post('/api/links/2fa/setup', linksTotpLimiter, setupLinksTotpHandler);
app.post('/api/links/2fa/enable', linksTotpLimiter, enableLinksTotpHandler);
app.post('/api/links/2fa/disable', linksTotpLimiter, disableLinksTotpHandler);
app.post('/api/links/claim', linksClaimLimiter, claimLinkHandler);
app.get('/api/admin/link-stats', getAdminLinkStatsHandler);

app.post('/api/ads/gate', adsGateLimiter, adsGateHandler);
app.post('/api/ads/shown', adsGateLimiter, adsShownHandler);
app.get('/api/ads/vast', adsVastLimiter, adsVastHandler);
app.get('/api/ads/vast.xml', adsVastLimiter, adsVastXmlHandler);
// Same-origin RevIQ script + domain-aware ads.txt (must not live under /assets — nginx serves that static).
mountRevAssets(app);
app.get('/api/admin/ad-reports', adReportsLimiter, getAdminAdReportsHandler);
app.get('/api/admin/ai-grants', aiGrantsLimiter, listAiGrantsHandler);
app.post('/api/admin/ai-grants', aiGrantsLimiter, createAiGrantHandler);
app.patch('/api/admin/ai-grants/:id', aiGrantsLimiter, updateAiGrantHandler);
app.post('/api/admin/ai-grants/:id/cancel', aiGrantsLimiter, cancelAiGrantHandler);

app.get('/api/settings', getSettingsHandler);
app.put('/api/settings', localStorageLimiter, saveSettingsHandler);

app.get('/api/ai/conversations', aiConversationsLimiter, listConversationsHandler);
app.get('/api/ai/conversations/:id', aiConversationsLimiter, getConversationHandler);
app.post('/api/ai/conversations', aiConversationsLimiter, upsertConversationHandler);
app.patch('/api/ai/conversations/:id', aiConversationsLimiter, renameConversationHandler);
app.delete('/api/ai/conversations/:id', aiConversationsLimiter, deleteConversationHandler);
app.post('/api/ai/conversations/:id/share', aiConversationsLimiter, createShareHandler);
app.delete('/api/ai/conversations/:id/share', aiConversationsLimiter, revokeShareHandler);
app.get('/api/ai/share/:token', aiConversationsLimiter, getSharedConversationHandler);
app.get('/api/admin/ai-prompts', adminAiPromptsHandler);

app.get('/api/changelog', getChangelogHandler);
app.post('/api/changelog', createChangelogHandler);
app.delete('/api/changelog/:id', deleteChangelogHandler);

app.get('/api/feedback', getFeedbackHandler);
app.post('/api/feedback', createFeedbackHandler);
app.delete('/api/feedback/:id', deleteFeedbackHandler);

app.post('/api/comment', addCommentHandler);
app.get('/api/comments', getCommentsHandler);
app.post('/api/comment/delete', deleteCommentHandler);

app.post('/api/likes', likeHandler);
app.get('/api/likes', getLikesHandler);

app.post('/api/admin/user-action', adminUserActionHandler);
app.post('/api/admin/cleanup-comments', cleanupMaliciousCommentsHandler);
app.get('/api/admin/staff', getAdminStaffHandler);
app.get('/api/admin/users', getAdminUsersHandler);
app.get('/api/admin/users/:id/reveal', adminOverviewLimiter, getAdminUserRevealHandler);
app.get('/api/admin/users/:id', getAdminUserHandler);
app.get('/api/admin/badge-rarity', getBadgeRarityLeaderboardHandler);
app.get('/api/admin/overview', adminOverviewLimiter, getAdminOverviewHandler);
app.get('/api/admin/route-metrics', adminOverviewLimiter, getAdminRouteMetricsHandler);
app.get('/api/admin/errors', adminOverviewLimiter, getAdminErrorsHandler);
app.post('/api/admin/security/attack-mode', securityActionLimiter, setAttackModeHandler);
app.post('/api/admin/security/kill-switch', securityActionLimiter, setKillSwitchHandler);
app.get('/api/admin/live-sites', getLiveSitesHandler);
app.get('/api/admin/announcements', listAnnouncementsHandler);
app.post('/api/admin/announcements', createAnnouncementHandler);
app.post('/api/admin/announcements/:id/active', setAnnouncementActiveHandler);

app.post('/api/presence', reportPresenceHandler);
app.get('/api/announcements/active', getActiveAnnouncementHandler);

app.get('/api/notifications', listNotificationsHandler);
app.post('/api/notifications/read', markNotificationsReadHandler);

app.post('/api/games/play', gamePlayLimiter, recordGamePlayHandler);
app.get('/api/games/plays', getGamePlaysMapHandler);
app.get('/api/games/catalog', getGamesCatalogHandler);
app.get('/api/admin/game-stats', getAdminGameStatsHandler);
app.get('/api/admin/game-live', getAdminGameLiveHandler);
app.get('/api/admin/games/excluded', getAdminExcludedGamesHandler);
app.post('/api/admin/games/exclude', adminGamesLimiter, adminExcludeGameHandler);
app.delete('/api/admin/games/exclude/:gameId', adminGamesLimiter, adminUnexcludeGameHandler);
app.post('/api/admin/games', adminGamesLimiter, adminAddGlobalGameHandler);
app.put('/api/admin/games/:id', adminGamesLimiter, adminUpdateGameHandler);
app.delete('/api/admin/games/:id', adminGamesLimiter, adminRemoveGlobalGameHandler);

app.get('/api/achievements', getMyAchievementsHandler);
app.post('/api/achievements/heartbeat', achievementHeartbeatLimiter, achievementHeartbeatHandler);
app.post('/api/achievements/event', achievementEventLimiter, achievementEventHandler);
app.get('/api/admin/badges', getBadgeCatalogHandler);
app.post('/api/admin/users/:id/badges', adminBadgeLimiter, adminSetUserBadgeHandler);

app.post('/api/firefox-vm/heartbeat', firefoxVmLimiter, firefoxVmHeartbeatHandler);
app.post('/api/firefox-vm/end', firefoxVmLimiter, firefoxVmEndHandler);
app.get('/api/admin/firefox-vm/live', getFirefoxVmLiveHandler);
app.get('/api/admin/firefox-vm/history', getFirefoxVmHistoryHandler);

app.use(mochiRouter);

const mochiWsProxy = httpProxy.createProxyServer({
  target: 'http://127.0.0.1:3005',
  ws: true,
});

mochiWsProxy.on('error', (err) => {
  console.error('[mochi ws proxy error]', err.message);
});

const IS_DEV = process.env.NODE_ENV !== 'production';
const VITE_PORT = parseInt(process.env.VITE_PORT || '5173');

if (IS_DEV) {
  const { createProxyMiddleware } = await import('http-proxy-middleware');
  app.use('/', createProxyMiddleware({ target: `http://localhost:${VITE_PORT}`, changeOrigin: true, ws: false }));
} else {
  const distPath = path.join(__dirname, '../dist');
  const indexPath = path.join(distPath, 'index.html');
  const storageAgPublic = path.join(__dirname, '../public/storage/ag');
  const storageAgDist = path.join(distPath, 'storage', 'ag');
  const storageAgPath = fs.existsSync(storageAgPublic) ? storageAgPublic : storageAgDist;
  let indexCache = { mtime: 0, html: '', checkedAt: 0 };
  function readIndexHtml() {
    try {
      const now = Date.now();
      if (indexCache.html && now - indexCache.checkedAt < 2000) return indexCache.html;
      const st = fs.statSync(indexPath);
      indexCache.checkedAt = now;
      if (st.mtimeMs !== indexCache.mtime || !indexCache.html) {
        indexCache = { mtime: st.mtimeMs, html: fs.readFileSync(indexPath, 'utf8'), checkedAt: now };
      }
      return indexCache.html;
    } catch {
      return '';
    }
  }
  app.get('/manifest.json', (req, res) => {
    const home = isPeteZahHomeHost(req.headers.host || req.hostname);
    const body = home
      ? {
          name: 'PeteZah Games',
          short_name: 'PeteZah',
          description: 'Games, movies, music, and browse.',
          background_color: '#0A1D37',
          theme_color: '#0A1D37',
        }
      : {
          name: 'HypeStudy',
          short_name: 'HypeStudy',
          description: 'Flashcards, quizzes, and study analytics for students.',
          background_color: '#f8f6f1',
          theme_color: '#f8f6f1',
        };
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      ...body,
      start_url: '/',
      display: 'standalone',
      icons: [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }],
    });
  });
  app.use(
    '/storage/ag',
    express.static(storageAgPath, {
      index: 'index.html',
      redirect: true,
      fallthrough: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'public, max-age=300');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
          res.setHeader('Accept-Ranges', 'bytes');
        }
      },
    })
  );
  app.use(express.static(distPath, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.includes(`${path.sep}storage${path.sep}images${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
        res.setHeader('Accept-Ranges', 'bytes');
      }
    },
  }));
  app.get('*', (req, res) => {
    if ((req.path || '').startsWith('/firefox-wasm')) {
      return res.status(404).type('text/plain').send('Firefox WASM asset not found');
    }
    // Don't SPA-fallback game asset URLs — missing files should 404
    if ((req.path || '').startsWith('/storage/ag/') || req.path === '/storage/ag') {
      return res.status(404).type('text/plain').send('Not found');
    }
    const ua = req.headers['user-agent'] || '';
    const crawler =
      req.pzVerifiedBot ||
      /discordbot|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|whatsapp|linkedinbot|googlebot|bingbot/i.test(
        ua
      );
    if (crawler) {
      // Discord/etc. need a stable 200 with OG tags — allow short caching for embeds.
      res.setHeader('Cache-Control', 'public, max-age=300');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    const raw = readIndexHtml();
    if (!raw) {
      return res.status(503).type('text/plain').send('Site updating, retry in a moment');
    }
    res.type('html').send(applySeoToHtml(raw, req.headers.host || req.hostname));
  });
}

const wsConnections = new Map();
const MAX_WS_PER_IP = 40;
const MAX_TOTAL_WS = 2400;

const server = createServer((req, res) => {
  const ip = toIPv4(null, req);
  shield.trackRequest(ip);
  if (shield.isKillSwitchActive() && !isKillSwitchUrlExempt(req.url)) {
    shield.incrementBlocked(ip, 'kill_switch');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    return;
  }
  if (bare.shouldRoute(req)) bare.routeRequest(req, res);
  else if (barePremium.shouldRoute(req)) barePremium.routeRequest(req, res);
  else app.handle(req, res);
});

server.on('upgrade', (req, socket, head) => {
  try {
    const host = req.headers.host || 'localhost';
    const u = new URL(req.url, `http://${host}`);
    const g = u.searchParams.get('g');
    const l = u.searchParams.get('l');
    if (g) req.headers['x-pz-gate'] = g;
    if (l) req.headers['x-pz-legal'] = l;
    u.searchParams.delete('g');
    u.searchParams.delete('l');
    const q = u.searchParams.toString();
    req.url = u.pathname + (q ? `?${q}` : '');
  } catch {}
  const url = req.url;
  const ip = toIPv4(null, req);

  shield.trackRequest(ip);

  if (shield.isKillSwitchActive()) {
    shield.incrementBlocked(ip, 'kill_switch');
    return socket.destroy();
  }

  if (url.startsWith('/n/m/') || url.startsWith('/f/g/') || url.startsWith('/!!/') || url.startsWith('/!cover!/')) {
    req.url = toMochiBackendPath(url);
    mochiWsProxy.ws(req, socket, head);
    return;
  }

  if (checkCircuitBreaker(ip, shield)) {
    shield.incrementBlocked(ip, 'circuit_open');
    return socket.destroy();
  }

  if (!requireGateUpgrade(req)) {
    shield.incrementBlocked(ip, 'cap_gate');
    return socket.destroy();
  }

  const current = wsConnections.get(ip) || 0;
  if (current >= MAX_WS_PER_IP || systemState.totalWS >= MAX_TOTAL_WS) {
    shield.incrementBlocked(ip, 'ws_cap');
    updateIPReputation(ip, -2);
    return socket.destroy();
  }

  const isWispUrl = isStreamUpgrade(url);
  const isBareUrl = bare.shouldRoute(req) || barePremium.shouldRoute(req);

  if (!isWispUrl && !isBareUrl) return socket.destroy();

  if (isWispUrl && (systemState.state === 'ATTACK' || shield.forceAttackMode) && !isTrustedWS(req)) {
    shield.incrementBlocked(ip, 'ws_attack_block');
    return socket.destroy();
  }

  wsConnections.set(ip, current + 1);
  systemState.activeConnections++;
  systemState.totalWS++;
  shield.trackWS(ip, 1);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    const n = wsConnections.get(ip) || 1;
    if (n <= 1) wsConnections.delete(ip);
    else wsConnections.set(ip, n - 1);
    systemState.activeConnections = Math.max(0, systemState.activeConnections - 1);
    systemState.totalWS = Math.max(0, systemState.totalWS - 1);
    shield.trackWS(ip, -1);
  };
  socket.once('close', cleanup);
  socket.once('error', cleanup);

  if (bare.shouldRoute(req)) return bare.routeUpgrade(req, socket, head);
  if (barePremium.shouldRoute(req)) return barePremium.routeUpgrade(req, socket, head);

  if (!url.startsWith('/wisp/')) {
    req.url = toWispLibUrl(url);
  }
  wisp.routeRequest(req, socket, head);
});

const port = parseInt(process.env.PORT || '3000');
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
server.requestTimeout = 120000;
server.maxRequestsPerSocket = 2000;
server.maxHeadersCount = 64;

setInterval(() => {
  checkSystemPressure(shield);
  adjustPowDifficulty(shield);
  shield.checkAttackConditions('system', systemState);
  cleanupSecurityMaps();
  cleanupCapStore();
  let live = 0;
  for (const n of wsConnections.values()) live += n;
  if (Math.abs(live - systemState.totalWS) > 8) {
    systemState.totalWS = live;
    systemState.activeConnections = live;
  }
}, 10000);

server.listen({ port, backlog: 4096 }, () => {
  const addr = server.address();
  console.log(`Listening on http://localhost:${addr.port}`);
  console.log(`\thttp://${hostname()}:${addr.port}`);
  if (IS_DEV) console.log(`\tProxying to Vite on port ${VITE_PORT}`);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', err => { shield.sendLog(`💥 Uncaught: ${err.message}`, null); console.error(err); });
process.on('unhandledRejection', reason => { shield.sendLog(`⚠️ Unhandled rejection: ${reason}`, null); console.error(reason); });

function shutdown() {
  console.log('Shutting down...');
  if (shield.isUnderAttack) shield.endAttackAlert(systemState);
  mochiWsProxy.close();
  server.close(() => { bare.close(); process.exit(0); });
  setTimeout(() => { bare.close(); process.exit(1); }, 5000);
}
