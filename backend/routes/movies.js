import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';
import { scrapeAll, PROVIDERS as X8_PROVIDERS } from '../lib/movie-streams/providers.js';
import { torFetch } from '../lib/movie-streams/torFetch.js';

const router = express.Router();
const TMDB_BASE = 'https://api.themoviedb.org/3';

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 12;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 400) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

function sanitizeId(raw) {
  const id = String(raw || '').replace(/\D/g, '');
  if (!id || id.length > 12) return null;
  return id;
}

function sanitizeQuery(q) {
  return String(q || '')
    .replace(/[<>{}[\]\\]/g, '')
    .trim()
    .slice(0, 120);
}

async function fetchTMDB(endpoint) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }
  const cached = cacheGet(endpoint);
  if (cached) return cached;
  const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    let message = 'TMDB API error';
    try {
      const err = await res.json();
      message = err.status_message || message;
    } catch {}
    throw new Error(message);
  }
  const data = await res.json();
  cacheSet(endpoint, data);
  return data;
}

router.get('/search', async (req, res) => {
  const q = sanitizeQuery(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`);
    const results = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json({ ...data, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/popular', async (_req, res) => {
  try {
    const data = await fetchTMDB('/movie/popular?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/trending', async (_req, res) => {
  try {
    const data = await fetchTMDB('/trending/movie/week');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/top_rated', async (_req, res) => {
  try {
    const data = await fetchTMDB('/movie/top_rated?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/now_playing', async (_req, res) => {
  try {
    const data = await fetchTMDB('/movie/now_playing?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/search', async (req, res) => {
  const q = sanitizeQuery(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/movie?query=${encodeURIComponent(q)}&include_adult=false`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/popular', async (_req, res) => {
  try {
    const data = await fetchTMDB('/tv/popular?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/trending', async (_req, res) => {
  try {
    const data = await fetchTMDB('/trending/tv/week');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/top_rated', async (_req, res) => {
  try {
    const data = await fetchTMDB('/tv/top_rated?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/now_playing', async (_req, res) => {
  try {
    const data = await fetchTMDB('/tv/on_the_air?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/search', async (req, res) => {
  const q = sanitizeQuery(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/tv?query=${encodeURIComponent(q)}&include_adult=false`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/:id', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await fetchTMDB(`/movie/${id}?append_to_response=videos,credits`);
    try { bumpUsage('movies', 1); } catch {}
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/:id', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await fetchTMDB(`/tv/${id}?append_to_response=videos,credits`);
    try { bumpUsage('movies', 1); } catch {}
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/:id/season/:season', async (req, res) => {
  const id = sanitizeId(req.params.id);
  const season = sanitizeId(req.params.season);
  if (!id || season === null) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await fetchTMDB(`/tv/${id}/season/${season}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Direct streams via Lyra-style FrameX resolve over Tor (backend/lib/movie-streams).
 * Optional MOVIES_API_URL still works as an override to a remote instance.
 */
function moviesApiBase() {
  const raw = String(process.env.MOVIES_API_URL || process.env.X8RR_MOVIES_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}

const streamCache = new Map();
const STREAM_TTL = 1000 * 60 * 12;
const STREAM_CACHE_MAX = 120;
const PROXY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_MAX_CHUNK = 8 * 1024 * 1024;

async function scrapeLocal(type, tmdbId, season, episode) {
  const key = `local:${type}:${tmdbId}:${season || ''}:${episode || ''}`;
  const hit = streamCache.get(key);
  if (hit && Date.now() - hit.at < STREAM_TTL) return hit.streams;

  const store = (streams) => {
    if (!streams?.length) return;
    streamCache.delete(key);
    streamCache.set(key, { at: Date.now(), streams });
    if (streamCache.size > STREAM_CACHE_MAX) {
      streamCache.delete(streamCache.keys().next().value);
    }
  };

  const streams = await scrapeAll(type, tmdbId, season, episode, X8_PROVIDERS, store);
  store(streams);
  return streams;
}

async function fetchRemoteX8rr(path) {
  const base = moviesApiBase();
  if (!base) return null;
  const key = `x8:${path}`;
  const hit = streamCache.get(key);
  if (hit && Date.now() - hit.at < STREAM_TTL) return hit.data;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);
  try {
    const r = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!r.ok) return { streams: [] };
    const data = await r.json();
    streamCache.set(key, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

router.get('/stream/sources', (_req, res) => {
  res.json({
    providers: X8_PROVIDERS.map(({ id, name }) => ({ id, name })),
    remote: !!moviesApiBase(),
  });
});

router.get('/stream/movie/:id', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    if (moviesApiBase()) {
      const data = await fetchRemoteX8rr(`/api/stream/movie/${id}`);
      const streams = Array.isArray(data?.streams) ? data.streams.slice(0, 16) : [];
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json({ streams, mode: streams.length ? 'direct' : 'embed' });
    }
    const streams = (await scrapeLocal('movie', id)).slice(0, 16);
    try {
      bumpUsage('movies', 1);
    } catch {}
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ streams, mode: streams.length ? 'direct' : 'embed' });
  } catch (e) {
    res.json({ streams: [], mode: 'embed', error: e.message });
  }
});

router.get('/stream/tv/:id/:season/:episode', async (req, res) => {
  const id = sanitizeId(req.params.id);
  const season = sanitizeId(req.params.season);
  const episode = sanitizeId(req.params.episode);
  if (!id || season === null || episode === null) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    if (moviesApiBase()) {
      const data = await fetchRemoteX8rr(`/api/stream/tv/${id}/${season}/${episode}`);
      const streams = Array.isArray(data?.streams) ? data.streams.slice(0, 16) : [];
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json({ streams, mode: streams.length ? 'direct' : 'embed' });
    }
    const streams = (await scrapeLocal('tv', id, season, episode)).slice(0, 16);
    try {
      bumpUsage('movies', 1);
    } catch {}
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ streams, mode: streams.length ? 'direct' : 'embed' });
  } catch (e) {
    res.json({ streams: [], mode: 'embed', error: e.message });
  }
});

function parseProxyHeaders(raw) {
  if (!raw) return {};
  try {
    const h = JSON.parse(raw);
    const blocked = new Set(['host', 'content-length', 'connection', 'range']);
    return Object.fromEntries(
      Object.entries(h).filter(
        ([k, v]) => typeof v === 'string' && !blocked.has(k.toLowerCase())
      )
    );
  } catch {
    return {};
  }
}

/**
 * Lyra `normalized_content_type` — FrameX Citadel disguises MPEG-TS as .jpg / image/jpeg.
 * Without this, Safari native HLS (and some players) reject the segments.
 */
function normalizedContentType(body, upstreamCt) {
  const buf = body instanceof Uint8Array ? body : null;
  if (buf && buf.length > 0) {
    const isTs =
      buf[0] === 0x47 && (buf.length <= 188 || buf[188] === 0x47);
    if (isTs) return 'video/mp2t';
    if (
      buf.length >= 8 &&
      (buf[4] === 0x66 /* f */ || buf[4] === 0x73 /* s */ || buf[4] === 0x6d /* m */) &&
      ((buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) || // ftyp
        (buf[4] === 0x73 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) || // styp
        (buf[4] === 0x6d && buf[5] === 0x6f && buf[6] === 0x6f && buf[7] === 0x66)) // moof
    ) {
      return 'video/mp4';
    }
  }
  return upstreamCt || 'application/octet-stream';
}

/** Local CORS/HLS proxy (FrameX/Lyra-style) — keeps playback off Scramjet/wisp. */
router.get('/stream/proxy', async (req, res) => {
  const target = typeof req.query.url === 'string' ? req.query.url : '';
  // Worker/CDN stream URLs often carry long tokens — 2500 was rejecting valid sources.
  if (!/^https?:\/\//i.test(target) || target.length > 12000) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  // Prefer remote x8rr proxy if configured (optional).
  const base = moviesApiBase();
  if (base) {
    try {
      const qs = new URLSearchParams({ url: target });
      if (typeof req.query.headers === 'string' && req.query.headers) {
        qs.set('headers', req.query.headers);
      }
      const r = await fetch(`${base}/api/proxy?${qs.toString()}`, {
        headers: {
          Accept: req.headers.accept || '*/*',
          Range: req.headers.range || undefined,
        },
        redirect: 'follow',
      });
      res.status(r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 12 * 1024 * 1024) {
        return res.status(413).json({ error: 'Payload too large' });
      }
      for (const h of ['content-length', 'accept-ranges', 'content-range', 'cache-control']) {
        const v = r.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      const upCt = r.headers.get('content-type') || '';
      const isPl = upCt.includes('mpegurl') || buf.toString('utf8', 0, 7).startsWith('#EXTM3U');
      res.setHeader(
        'Content-Type',
        isPl ? 'application/vnd.apple.mpegurl' : normalizedContentType(buf, upCt)
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.end(buf);
    } catch (e) {
      // Fall through to local proxy.
    }
  }

  const ac = new AbortController();
  res.on('close', () => ac.abort());

  try {
    const origin = new URL(target).origin;
    const extra = parseProxyHeaders(
      typeof req.query.headers === 'string' ? req.query.headers : ''
    );
    // FrameX CDNs expect framextv / rivestream referer when the client passed it through.
    const headers = {
      'User-Agent': PROXY_UA,
      Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,video/mp2t,video/mp4,application/octet-stream,*/*',
      Referer: origin + '/',
      Origin: origin,
      ...extra,
    };
    const range = String(req.headers.range || '').match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2]
        ? Math.min(Number(range[2]), start + PROXY_MAX_CHUNK - 1)
        : start + PROXY_MAX_CHUNK - 1;
      headers.Range = `bytes=${start}-${end}`;
    } else if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    // FrameX / Citadel CDNs often only resolve cleanly via Tor (same as resolve).
    const r = await torFetch(target, {
      preferTor: true,
      timeoutMs: 28000,
      headers,
    });
    if (ac.signal.aborted) return;
    if (!r.ok) {
      console.log('[stream-proxy] upstream', r.status, target.slice(0, 120));
      return res.status(r.status).end();
    }

    const ct = r.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'private, max-age=30');

    // Buffer the body — streaming readers have been flaky with some CDNs under Express.
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'Payload too large' });
    }
    const head = buf.toString('utf8', 0, Math.min(16, buf.length));
    const isPlaylist = ct.includes('mpegurl') || head.trimStart().startsWith('#EXTM3U');
    const isVtt =
      ct.includes('text/vtt') ||
      ct.includes('application/x-subrip') ||
      head.trimStart().startsWith('WEBVTT') ||
      /\.vtt(\?|$)/i.test(target) ||
      /\.srt(\?|$)/i.test(target);

    if (isPlaylist) {
      let text = buf.toString('utf8');
      const hostToken = new URL(target).searchParams.get('token');
      const hq = req.query.headers
        ? `&headers=${encodeURIComponent(String(req.query.headers))}`
        : '';
      const wrap = (ref) => {
        let abs = new URL(ref, r.url || target).href;
        if (hostToken && !abs.includes('token=')) {
          abs += (abs.includes('?') ? '&' : '?') + 'token=' + hostToken;
        }
        return `/api/tmdb/stream/proxy?url=${encodeURIComponent(abs)}${hq}`;
      };
      text = text
        .replace(/^(?!#)(\S+)$/gm, (line) => wrap(line))
        .replace(/URI="([^"]+)"/g, (_m, ref) => `URI="${wrap(ref)}"`);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(text);
    }

    if (isVtt) {
      res.setHeader(
        'Content-Type',
        head.trimStart().startsWith('WEBVTT') || /\.vtt(\?|$)/i.test(target)
          ? 'text/vtt; charset=utf-8'
          : 'application/x-subrip; charset=utf-8'
      );
      return res.end(buf);
    }

    res.status(r.status);
    for (const h of ['content-range', 'accept-ranges']) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    // Sniff MPEG-TS / fMP4 — do NOT trust upstream image/jpeg disguises (Lyra).
    res.setHeader('Content-Type', normalizedContentType(buf, ct));
    res.setHeader('Content-Length', String(buf.length));
    return res.end(buf);
  } catch (e) {
    console.log('[stream-proxy] error', e.message, String(req.query.url || '').slice(0, 120));
    if (!res.headersSent) res.status(502).json({ error: e.message || 'Proxy failed' });
    else res.destroy();
  }
});

export default router;
