/**
 * Movie/TV stream scrapers (from https://github.com/x8rr/movies, trimmed).
 * Used by backend/routes/movies.js — keeps heavy vidfast sandboxes out.
 */
import { vidsparkExtract } from "./vidspark.js";
import { vixsrcExtract } from "./vixsrc.js";
import { vidzeeExtract } from "./vidzee.js";
import { vidrockExtract } from "./vidrock.js";
import { twoembedExtract } from "./twoembed.js";
import { vidnestExtract } from "./vidnest.js";
// cinesrc needs happy-dom — skipped to keep PeteZah deps light.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const wasmCache = new Map();

async function getWasmModule(vs) {
  if (vs.wasm_url) {
    const key = `u:${vs.w ?? vs.wasm_url}`;
    if (!wasmCache.has(key)) {
      wasmCache.set(
        key,
        fetch(vs.wasm_url, { credentials: "omit" })
          .then((r) => r.arrayBuffer())
          .then((b) => WebAssembly.compile(b)),
      );
    }
    return wasmCache.get(key);
  }
  if (vs.wasm) {
    const key = `b:${vs.w ?? Math.random()}`;
    if (!wasmCache.has(key)) {
      const bin = Buffer.from(vs.wasm, "base64");
      wasmCache.set(key, WebAssembly.compile(bin));
    }
    return wasmCache.get(key);
  }
  return null;
}

async function decryptStreamUrls(encB64, vs) {
  const mod = await getWasmModule(vs);
  if (!mod) return null;
  const inst = await WebAssembly.instantiate(mod, {});
  const { alloc, decrypt, memory } = inst.exports;
  const enc = Buffer.from(encB64, "base64");
  const ptr = alloc(enc.length);
  new Uint8Array(memory.buffer, ptr, enc.length).set(enc);
  const outLen = decrypt(ptr, enc.length);
  const text = new TextDecoder().decode(
    new Uint8Array(memory.buffer, ptr + 12, outLen),
  );
  return text.split("\n").filter(Boolean);
}

async function vidsrcFetch(url, referer) {
  return fetch(url, {
    headers: { "User-Agent": UA, Referer: referer },
  });
}

async function vidsrcExtract(type, tmdbId, season, episode) {
  try {
    const isTV = type !== "movie";
    const srcPath = isTV ? `${tmdbId}/${season}/${episode}` : String(tmdbId);

    const apiResp = await vidsrcFetch(
      `https://vidsrc.sh/vs_src.php?type=${isTV ? "tv" : "movie"}&id=${srcPath}`,
      "https://vidsrc.sh/",
    );
    const srcText = await apiResp.text();
    let src;
    try {
      ({ src } = JSON.parse(srcText));
    } catch {
      throw new Error(`vs_src ${apiResp.status} returned non-JSON`);
    }
    if (!src) return [];

    const landResp = await vidsrcFetch(src, "https://vidsrc.sh/");
    const landHtml = await landResp.text();
    const cfgMatch = landHtml.match(/window\.CFG\s*=\s*(\{[^}]+\})/);
    if (!cfgMatch) return [];
    const cfg = JSON.parse(cfgMatch[1]);
    const origin = new URL(src).origin;

    const playerResp = await vidsrcFetch(origin + cfg.playerUrl, origin + "/");
    const playerHtml = await playerResp.text();
    const configMatch = playerHtml.match(/window\.CONFIG\s*=\s*(\{.*?\});/s);
    if (!configMatch) return [];
    const config = JSON.parse(configMatch[1]);
    if (config.rateLimited) throw new Error("rate limited");
    if (!config.apiToken) return [];

    let streamApiUrl;
    if (isTV) {
      streamApiUrl = `https://data.vidsrc.sh/api.php?type=tv&tmdb=${tmdbId}&season=${season}&episode=${episode}&stream_urls&api_token=${encodeURIComponent(config.apiToken)}`;
    } else {
      streamApiUrl = `https://data.vidsrc.sh/api.php?type=movie&tmdb=${tmdbId}&stream_urls&api_token=${encodeURIComponent(config.apiToken)}`;
    }

    const streamResp = await vidsrcFetch(streamApiUrl, origin + "/");
    const json = await streamResp.json();
    if (String(json.status_code) !== "200" || !json.data) return [];

    let urls;
    if (typeof json.data.stream_urls === "string" && json.vs) {
      urls = await decryptStreamUrls(json.data.stream_urls, json.vs);
      if (!urls) return [];
    } else if (Array.isArray(json.data.stream_urls)) {
      urls = json.data.stream_urls;
    } else {
      return [];
    }

    const hostTokens = new Map();
    for (const u of urls) {
      const host = new URL(u).origin;
      if (!hostTokens.has(host)) {
        hostTokens.set(
          host,
          fetch(host + "/generate.php", {
            headers: { "User-Agent": UA, Accept: "application/json" },
          })
            .then((r) => r.text())
            .then((t) => {
              try {
                const j = JSON.parse(t);
                return typeof j === "string"
                  ? j
                  : j.token || j.data || j.string || j.result || "";
              } catch {
                return t.trim();
              }
            })
            .catch(() => ""),
        );
      }
    }

    const results = [];
    for (const rawUrl of urls) {
      const host = new URL(rawUrl).origin;
      const token = await hostTokens.get(host);
      const url = token
        ? rawUrl + (rawUrl.includes("?") ? "&" : "?") + "token=" + token
        : rawUrl;
      results.push({
        url,
        type: rawUrl.includes(".m3u8") ? "hls" : "file",
        provider: "vidsrc",
        providerName: "VidSrc",
      });
    }
    return results;
  } catch (e) {
    console.log("[vidsrc] error:", e.message);
    return [];
  }
}

const PROVIDER_TIMEOUT = 15000;
const GRACE_AFTER_FIRST = 6000;
const HARD_DEADLINE = 18000;
const CHECK_TIMEOUT = 5000;

const PROVIDERS = [
  { id: "vixsrc", name: "VixSrc", extract: vixsrcExtract },
  { id: "vidnest", name: "VidNest", extract: vidnestExtract },
  { id: "vidsrc", name: "VidSrc", extract: vidsrcExtract },
  { id: "vidspark", name: "VidSpark", extract: vidsparkExtract },
  { id: "vidzee", name: "VidZee", extract: vidzeeExtract },
  { id: "vidrock", name: "VidRock", extract: vidrockExtract },
  { id: "twoembed", name: "2Embed", extract: twoembedExtract },
];

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((r) => (timer = setTimeout(() => r([]), ms))),
  ]).finally(() => clearTimeout(timer));
}

async function isAlive(stream) {
  const headers = {
    "User-Agent": UA,
    Referer: new URL(stream.url).origin + "/",
    ...(stream.headers || {}),
  };
  try {
    if (stream.type === "hls") {
      const r = await fetch(stream.url, {
        headers,
        signal: AbortSignal.timeout(CHECK_TIMEOUT),
      });
      return r.ok && (await r.text()).trimStart().startsWith("#EXTM3U");
    }
    const r = await fetch(stream.url, {
      headers: { ...headers, Range: "bytes=0-0" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT),
    });
    r.body?.cancel?.();
    return r.ok;
  } catch {
    return false;
  }
}

async function checkStreams(streams) {
  const alive = await Promise.all(streams.map(isAlive));
  return streams.filter((_, i) => alive[i]);
}

/** Run scrapers in parallel; return early after first hits + grace window. */
export async function scrapeAll(type, tmdbId, season, episode, tasks = PROVIDERS, onSettled) {
  const slots = tasks.map(() => null);
  const pending = tasks.map((p, i) =>
    withTimeout(
      Promise.resolve()
        .then(() => p.extract(type, tmdbId, season, episode))
        .then(checkStreams)
        .catch(() => []),
      p.timeout ?? PROVIDER_TIMEOUT,
    ).then((s) => (slots[i] = s)),
  );

  const collect = () => slots.flatMap((s) => s || []);
  if (onSettled) Promise.all(pending).then(() => onSettled(collect()));

  await new Promise((resolve) => {
    let grace = null;
    const hard = setTimeout(resolve, HARD_DEADLINE);
    const done = () => {
      clearTimeout(hard);
      clearTimeout(grace);
      resolve();
    };
    Promise.all(pending).then(done);
    for (const p of pending) {
      p.then((s) => {
        if (s.length && !grace) grace = setTimeout(done, GRACE_AFTER_FIRST);
      });
    }
  });

  return collect();
}

export { PROVIDERS };
