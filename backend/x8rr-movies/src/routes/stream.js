import { Router } from "express";
import { Readable } from "stream";
import { tmdb } from "../tmdb.js";
import { PROVIDERS, scrapeAll } from "../providers.js";
import { listPstream, pstreamTasks } from "../pstream.js";

const router = Router();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

router.get("/sources", (_req, res) => {
  res.json({
    custom: PROVIDERS.map(({ id, name }) => ({ id, name })),
    ...listPstream(),
  });
});

router.get("/search/:type", async (req, res) => {
  const { type } = req.params;
  const { query, page } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });

  if (type === "multi") {
    res.json(await tmdb("/search/multi", { query, page }));
  } else {
    res.json(await tmdb(`/search/${type}`, { query, page }));
  }
});

router.get("/trending/:type/:window", async (req, res) => {
  const { type, window } = req.params;
  res.json(await tmdb(`/trending/${type}/${window}`, { page: req.query.page }));
});

router.get("/movie/:id", async (req, res) => {
  res.json(
    await tmdb(`/movie/${req.params.id}`, {
      append_to_response: "external_ids",
    }),
  );
});

router.get("/tv/:id", async (req, res) => {
  res.json(
    await tmdb(`/tv/${req.params.id}`, {
      append_to_response: "external_ids",
    }),
  );
});

router.get("/tv/:id/season/:season", async (req, res) => {
  res.json(await tmdb(`/tv/${req.params.id}/season/${req.params.season}`));
});

// short-lived cache: repeat plays are instant and we hit rate-limited sites less
const CACHE_TTL = 20 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();

async function scrape(type, tmdbId, season, episode) {
  const key = [type, tmdbId, season, episode].join(":");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.streams;

  const store = (streams) => {
    if (!streams.length) return;
    cache.delete(key);
    cache.set(key, { at: Date.now(), streams });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  };
  const tasks = [...PROVIDERS, ...pstreamTasks(type)];
  const streams = await scrapeAll(type, tmdbId, season, episode, tasks, store);
  store(streams);
  return streams;
}

router.get("/stream/movie/:tmdbId", async (req, res) => {
  try {
    res.json({ streams: await scrape("movie", req.params.tmdbId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/stream/tv/:tmdbId/:season/:episode", async (req, res) => {
  const { tmdbId, season, episode } = req.params;
  try {
    res.json({ streams: await scrape("tv", tmdbId, season, episode) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const BLOCKED_HEADERS = new Set(["host", "content-length", "connection", "range"]);
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];
const MAX_CHUNK = 8 * 1024 * 1024;

function parseHeaders(raw) {
  if (!raw) return {};
  try {
    const h = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(h).filter(([k, v]) => typeof v === "string" && !BLOCKED_HEADERS.has(k.toLowerCase())),
    );
  } catch {
    return {};
  }
}

// Proxy endpoint — solves CORS for HLS streams
router.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "url required" });

  const ac = new AbortController();
  res.on("close", () => ac.abort());

  try {
    const origin = new URL(url).origin;
    const extra = parseHeaders(req.query.headers);
    const headers = { "User-Agent": UA, Referer: origin + "/", ...extra };
    // Bun's fetch buffers bodies without backpressure, so an open-ended range on a
    // multi-GB mp4 would pull the whole file into RAM — serve it in bounded chunks
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), start + MAX_CHUNK - 1) : start + MAX_CHUNK - 1;
      headers.Range = `bytes=${start}-${end}`;
    } else if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const r = await fetch(url, { headers, signal: ac.signal });
    if (!r.ok) return res.status(r.status).end();

    const ct = r.headers.get("content-type") || "";
    res.setHeader("Access-Control-Allow-Origin", "*");

    // many hosts serve playlists without .m3u8 or an mpegurl type, so sniff the first bytes
    const reader = r.body?.getReader();
    const first = reader ? await reader.read() : { done: true };
    const head = first.value ? new TextDecoder().decode(first.value.subarray(0, 16)) : "";
    const isPlaylist = ct.includes("mpegurl") || head.trimStart().startsWith("#EXTM3U");

    if (isPlaylist) {
      const chunks = first.value ? [first.value] : [];
      for (let c = await reader.read(); !c.done; c = await reader.read()) chunks.push(c.value);
      let text = new TextDecoder().decode(Buffer.concat(chunks));
      const hostToken = new URL(url).searchParams.get("token");
      const hq = req.query.headers ? `&headers=${encodeURIComponent(req.query.headers)}` : "";
      const wrap = (ref) => {
        let abs = new URL(ref, r.url || url).href;
        if (hostToken && !abs.includes("token=")) {
          abs += (abs.includes("?") ? "&" : "?") + "token=" + hostToken;
        }
        return `/api/proxy?url=${encodeURIComponent(abs)}${hq}`;
      };
      text = text
        .replace(/^(?!#)(\S+)$/gm, (line) => wrap(line))
        .replace(/URI="([^"]+)"/g, (_m, ref) => `URI="${wrap(ref)}"`);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(text);
    }

    res.status(r.status);
    for (const h of PASS_HEADERS) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!ct) res.setHeader("Content-Type", "application/octet-stream");
    if (first.done) return res.end();
    res.write(first.value);
    const rest = new ReadableStream({
      async pull(ctrl) {
        const c = await reader.read();
        c.done ? ctrl.close() : ctrl.enqueue(c.value);
      },
      cancel: () => reader.cancel(),
    });
    Readable.fromWeb(rest).on("error", () => res.destroy()).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.destroy();
  }
});


export default router;
