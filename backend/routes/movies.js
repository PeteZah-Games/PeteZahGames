import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';
import { scrapeAll, PROVIDERS as X8_PROVIDERS } from '../x8rr-movies/src/providers.js';

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
 * Direct streams via vendored x8rr/movies scrapers (no separate Bun service).
 * Optional MOVIES_API_URL still works as an override to a remote x8rr instance.
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

/** Local CORS/HLS proxy (x8rr-style) — keeps playback off Scramjet/wisp. */
router.get('/stream/proxy', async (req, res) => {
  const target = typeof req.query.url === 'string' ? req.query.url : '';
  if (!/^https?:\/\//i.test(target) || target.length > 2500) {
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
      for (const h of ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control']) {
        const v = r.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 12 * 1024 * 1024) {
        return res.status(413).json({ error: 'Payload too large' });
      }
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
    const headers = { 'User-Agent': PROXY_UA, Referer: origin + '/', ...extra };
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

    const r = await fetch(target, { headers, signal: ac.signal });
    if (!r.ok) return res.status(r.status).end();

    const ct = r.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'private, max-age=30');

    const reader = r.body?.getReader?.();
    const first = reader ? await reader.read() : { done: true, value: undefined };
    const head = first.value ? new TextDecoder().decode(first.value.subarray(0, 16)) : '';
    const isPlaylist = ct.includes('mpegurl') || head.trimStart().startsWith('#EXTM3U');

    if (isPlaylist) {
      const chunks = first.value ? [first.value] : [];
      if (reader) {
        for (;;) {
          const c = await reader.read();
          if (c.done) break;
          chunks.push(c.value);
        }
      }
      let text = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
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

    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!ct) res.setHeader('Content-Type', 'application/octet-stream');
    if (first.done || !reader) return res.end();
    res.write(Buffer.from(first.value));
    for (;;) {
      const c = await reader.read();
      if (c.done) break;
      if (!res.write(Buffer.from(c.value))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: e.message || 'Proxy failed' });
    else res.destroy();
  }
});

export default router;
