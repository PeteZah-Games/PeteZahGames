import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';

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

/** x8rr/movies-compatible stream API (proxied). Set MOVIES_API_URL to an x8rr instance. */
function moviesApiBase() {
  const raw = String(process.env.MOVIES_API_URL || process.env.X8RR_MOVIES_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}

const streamCache = new Map();
const STREAM_TTL = 1000 * 60 * 8;

async function fetchX8rr(path) {
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
    if (streamCache.size > 80) {
      const first = streamCache.keys().next().value;
      streamCache.delete(first);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

router.get('/stream/movie/:id', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (!moviesApiBase()) {
    return res.json({ streams: [], mode: 'embed', providers: 'x8rr-aligned' });
  }
  try {
    const data = await fetchX8rr(`/api/stream/movie/${id}`);
    const streams = Array.isArray(data?.streams) ? data.streams.slice(0, 12) : [];
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
  if (!moviesApiBase()) {
    return res.json({ streams: [], mode: 'embed', providers: 'x8rr-aligned' });
  }
  try {
    const data = await fetchX8rr(`/api/stream/tv/${id}/${season}/${episode}`);
    const streams = Array.isArray(data?.streams) ? data.streams.slice(0, 12) : [];
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ streams, mode: streams.length ? 'direct' : 'embed' });
  } catch (e) {
    res.json({ streams: [], mode: 'embed', error: e.message });
  }
});

/** CORS/HLS proxy via x8rr when configured — keeps playback off the heavy page proxy. */
router.get('/stream/proxy', async (req, res) => {
  const base = moviesApiBase();
  if (!base) return res.status(503).json({ error: 'MOVIES_API_URL not configured' });
  const target = typeof req.query.url === 'string' ? req.query.url : '';
  if (!/^https?:\/\//i.test(target) || target.length > 2000) {
    return res.status(400).json({ error: 'Invalid url' });
  }
  const headers = typeof req.query.headers === 'string' ? req.query.headers : '';
  const qs = new URLSearchParams({ url: target });
  if (headers) qs.set('headers', headers);
  try {
    const r = await fetch(`${base}/api/proxy?${qs.toString()}`, {
      headers: {
        Accept: req.headers.accept || '*/*',
        Range: req.headers.range || undefined,
      },
      redirect: 'follow',
    });
    res.status(r.status);
    const pass = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control'];
    for (const h of pass) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    // Cap memory — x8rr already chunks; refuse oversized blobs.
    if (buf.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'Payload too large' });
    }
    res.end(buf);
  } catch (e) {
    res.status(502).json({ error: e.message || 'Proxy failed' });
  }
});

export default router;
