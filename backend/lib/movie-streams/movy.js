/**
 * Lyra-style Movy resolver (selenesia/lyra → mochi/stream/movy.rs).
 * Seed + encrypted city sources → HLS playlists for our CORS proxy.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const API = "https://api.wecollege.net";
const META = "https://db.wecollege.net";
const REFERER = "https://www.movy.sx/";
const ORIGIN = "https://www.movy.sx";

/** Prefer English/original city servers Lyra uses first. */
const SERVERS = [
  "miami",
  "boise",
  "vegas",
  "nashville",
  "chicago",
  "austin",
  "seattle",
  "phoenix",
];

const MOVY_HEADERS = {
  "User-Agent": UA,
  Referer: REFERER,
  Origin: ORIGIN,
  Accept: "application/json, text/plain, */*",
};

const PLAY_HEADERS = { Referer: REFERER, Origin: ORIGIN };

function mix(value) {
  value >>>= 0;
  value ^= value >>> 16;
  value = Math.imul(value, 2246822507) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 3266489909) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function rotl(v, n) {
  n &= 31;
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

/** Exact port of Lyra `decode_sources`. */
export function decodeSources(encoded, seed, mediaId) {
  let b64 = String(encoded).trim().replace(/=+$/, "");
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bytes = Buffer.from(b64, "base64");
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  let state = mix(mix(hash) ^ mix((mediaId ^ 0x9e3779b9) >>> 0)) >>> 0;
  const slots = Array(61).fill(null);
  for (let index = 0; index < 8; index++) {
    const slot = state % 61;
    state = rotl((state + 0x9e3779b9) >>> 0, 7 + index);
    slots[slot] = (state ^ mix(state)) >>> 0;
    state = mix((state + slot) >>> 0);
  }
  let accumulator = mix((0xa5a5a5a5 ^ state) >>> 0);
  for (let index = 0, off = 0; off < bytes.length; index++, off += 4) {
    const slot = accumulator % 61;
    const word =
      ((slots[slot] ?? 0) ^ (Math.imul(0x9e3779b9, index + 1) >>> 0)) >>> 0;
    const mask = slots[slot] != null ? 0xffffffff : 0;
    const combined =
      ((accumulator ^ word) | (accumulator & word & mask)) >>> 0;
    accumulator = mix(
      ((rotl((combined + accumulator) >>> 0, slot) ^
        rotl(accumulator, (slot * 7) & 31)) +
        0x9e3779b9) >>>
        0
    );
    slots[slot] = accumulator;
    const le = Buffer.alloc(4);
    le.writeUInt32LE(accumulator >>> 0, 0);
    for (let i = 0; i < 4 && off + i < bytes.length; i++) {
      bytes[off + i] ^= le[i];
    }
  }
  if (bytes.subarray(0, 4).toString() !== "mvm1") {
    throw new Error("movy decode magic mismatch");
  }
  return JSON.parse(bytes.subarray(4).toString("utf8"));
}

async function fetchJson(url, ms = 8000) {
  const r = await fetch(url, {
    headers: MOVY_HEADERS,
    signal: AbortSignal.timeout(ms),
  });
  const data = await r.json().catch(() => null);
  if (r.status === 429 || data?.error === "rate_limited") {
    throw new Error("rate_limited");
  }
  if (!r.ok) throw new Error(`http ${r.status}`);
  return data;
}

async function fetchText(url, ms = 8000) {
  const r = await fetch(url, {
    headers: MOVY_HEADERS,
    signal: AbortSignal.timeout(ms),
  });
  if (r.status === 429) throw new Error("rate_limited");
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.text();
}

const seedCache = new Map();
let globalCooldownUntil = 0;

async function getSeed(tmdbId) {
  if (Date.now() < globalCooldownUntil) throw new Error("rate_limited");
  const hit = seedCache.get(tmdbId);
  if (hit && hit.exp > Date.now()) return hit.seed;
  try {
    const data = await fetchJson(`${API}/seed?mediaId=${tmdbId}`, 5000);
    const seed = String(data?.seed || "").trim();
    if (!seed || seed.length > 256) throw new Error("bad seed");
    const ttl = Math.min(25000, Math.max(1000, Number(data.ttlMs) || 30000) - 5000);
    seedCache.set(tmdbId, { seed, exp: Date.now() + ttl });
    return seed;
  } catch (e) {
    if (e.message === "rate_limited") globalCooldownUntil = Date.now() + 20000;
    throw e;
  }
}

function buildParams(type, tmdbId, season, episode, details) {
  const isTv = type === "tv";
  const name = isTv ? details.name : details.title;
  if (!name) throw new Error("missing title");
  const year = String(
    (isTv ? details.first_air_date : details.release_date) || ""
  ).slice(0, 4);
  const params = new URLSearchParams({
    title: name,
    mediaType: isTv ? "tv" : "movie",
    year,
    episodeId: String(isTv ? episode : 1),
    seasonId: String(isTv ? season : 1),
    tmdbId: String(tmdbId),
  });
  const imdb = details.imdb_id || details.external_ids?.imdb_id || "";
  if (imdb) params.set("imdbId", imdb);
  if (isTv && details.number_of_seasons) {
    params.set("totalSeasons", String(details.number_of_seasons));
  }
  return params;
}

function collectUrls(payload, server) {
  const out = [];
  const seen = new Set();
  const push = (url, quality) => {
    if (!url || typeof url !== "string" || !url.startsWith("https://")) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({
      url,
      type: "hls",
      quality: quality || undefined,
      provider: "movy",
      providerName: `Movy · ${server}`,
      label: `Movy · ${server}${quality ? ` ${quality}` : ""}`,
      headers: { ...PLAY_HEADERS },
    });
  };
  if (payload?.playlist) push(payload.playlist, "auto");
  for (const s of payload?.sources || []) {
    push(s.url || s.file, s.quality || s.label);
  }
  return out;
}

async function resolveServer(tmdbId, baseParams, server) {
  const seed = await getSeed(tmdbId);
  const params = new URLSearchParams(baseParams);
  params.set("enc", "2");
  params.set("seed", seed);
  const text = await fetchText(`${API}/${server}/sources?${params}`, 7000);
  const decoded = decodeSources(text, seed, Number(tmdbId));
  return collectUrls(decoded, server);
}

/**
 * Ordered first-ready across Movy city servers (quiet — no VPS playlist probe).
 * Client + our proxy validate playback.
 */
export async function resolveMovy(type, tmdbId, season = 1, episode = 1) {
  const id = Number(tmdbId);
  if (!id) return [];
  const kind = type === "tv" ? "tv" : "movie";
  const details = await fetchJson(
    `${META}/3/${kind}/${id}?append_to_response=external_ids`,
    8000
  );
  const baseParams = buildParams(type, id, season, episode, details);
  const found = [];
  const seen = new Set();

  // One server at a time — Movy rate-limits aggressive parallel seed/source hits.
  for (const server of SERVERS.slice(0, 5)) {
    try {
      const list = await resolveServer(id, baseParams, server);
      for (const s of list) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        found.push(s);
      }
      if (found.length) break;
    } catch (e) {
      if (e.message === "rate_limited") break;
    }
  }
  return found.slice(0, 8);
}
