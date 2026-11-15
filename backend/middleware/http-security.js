export function isJsdelivrOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    // only cdn/content subdomains, not the bare apex (that's the marketing site,
    // never a shell host) - keeps the credentialed-cors surface tighter
    return h.endsWith('.jsdelivr.net');
  } catch {
    return false;
  }
}

function frameAncestorList() {
  const extras = (process.env.FRAME_ANCESTORS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    // Never allow wildcard-all — keep clickjacking surface bounded.
    .filter((s) => s !== '*' && s !== "'*'");
  // blob: — about:blank/blob cloak shells iframe the app; 'self' alone rejects them.
  // jsdelivr — existing game/mirror host pattern.
  return ["'self'", 'blob:', 'https://cdn.jsdelivr.net', 'https://*.jsdelivr.net', ...extras];
}

function isFramingOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  if (isJsdelivrOrigin(origin)) return true;
  const allowed = (process.env.FRAME_ANCESTORS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

export function crossSiteCookieFlags(req) {
  const origin = req?.headers?.origin || '';
  const cross = isJsdelivrOrigin(origin) || isFramingOrigin(origin);
  return {
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production' || cross,
    sameSite: cross ? 'none' : 'lax',
    ...(cross ? { partitioned: true } : {}),
  };
}

export function wrapCrossSiteCookies() {
  return (req, res, next) => {
    const origin = req.headers.origin || '';
    if (!isJsdelivrOrigin(origin) && !isFramingOrigin(origin)) return next();
    const orig = res.cookie.bind(res);
    res.cookie = (name, value, options = {}) =>
      orig(name, value, {
        ...options,
        sameSite: 'none',
        secure: true,
        partitioned: true,
      });
    next();
  };
}

export function createSecurityHeaders() {
  return (req, res, next) => {
    const p = req.path || '';
    const remoteFrame =
      p === '/storage/ag' ||
      p.startsWith('/storage/ag/') ||
      p.startsWith('/f/g/') ||
      p.startsWith('/n/m/') ||
      p.startsWith('/!!/') ||
      p.startsWith('/!cover!/');
    const ancestors = remoteFrame
      ? ["'self'", 'https://cdn.jsdelivr.net', 'https://*.jsdelivr.net', ...frameAncestorList().filter((a) => a !== "'self'")]
      : frameAncestorList();
    // Dedupe while preserving order
    const seen = new Set();
    const list = ancestors.filter((a) => (seen.has(a) ? false : (seen.add(a), true)));

    res.setHeader('X-Content-Type-Options', 'nosniff');
    // X-Frame-Options cannot express blob:/allowlists — CSP frame-ancestors is the control.
    // Omitting XFO lets cloak shells and allowlisted mirrors embed without opening *.
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      [
        `frame-ancestors ${list.join(' ')}`,
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join('; ')
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(self), display-capture=(self), interest-cohort=()'
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
  };
}

export function createCorsConfig() {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const frameExtra = (process.env.FRAME_ANCESTORS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('http'));
  const appUrl = (process.env.APP_URL || process.env.PUBLIC_URL || process.env.BASE_URL || '')
    .replace(/\/$/, '');
  const isProd = process.env.NODE_ENV === 'production';

  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (appUrl && origin === appUrl) return cb(null, true);
      if (isJsdelivrOrigin(origin)) return cb(null, true);
      if (allowed.length && allowed.includes(origin)) return cb(null, true);
      if (frameExtra.length && frameExtra.includes(origin)) return cb(null, true);
      if (!isProd && !appUrl && allowed.length === 0) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-PZ-Gate',
      'X-PZ-Legal',
      'X-PZ-Session',
      'X-PZ-Svg',
    ],
  };
}

export function createUploadGuard() {
  return (req, res, next) => {
    const normalized = req.path.replace(/\.\./g, '');
    if (normalized !== req.path) return res.status(400).end();
    next();
  };
}
