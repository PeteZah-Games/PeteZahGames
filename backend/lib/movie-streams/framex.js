/**
 * Lyra-style FrameX title streams (selenesia/lyra → mochi/stream/titles.rs).
 * API calls go through Tor so FrameX doesn't ban the VPS IP.
 */
import { torFetch, torConfigured } from "./torFetch.js";

const APIS = [
  "https://api.framextv.tech",
  "https://api.framextv.xyz",
  "https://api.framextv.cc",
];
const REFERER = "https://framextv.cc/";
const ORIGIN = "https://framextv.cc";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FX_HEADERS = {
  "User-Agent": UA,
  Referer: REFERER,
  Origin: ORIGIN,
  Accept: "application/json",
};

const PLAY_HEADERS = { Referer: REFERER, Origin: ORIGIN };
const UNAVAILABLE = new Set(["down", "unavailable", "disabled"]);

function apiUrl(base, path, params) {
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/**
 * Unwrap FrameX / hybrows worker wrappers → real media URL + play headers.
 * Lyra strips spatula/zenith proxies; FrameX also uses frappe.*.workers.dev.
 */
export function unwrapMedia(raw, apiBase = APIS[0]) {
  if (!raw || typeof raw !== "string") return null;
  let href;
  try {
    href = new URL(raw.trim(), apiBase).href;
  } catch {
    return null;
  }
  let referer = REFERER;
  let origin = ORIGIN;
  try {
    const u = new URL(href);
    const host = u.hostname;
    const path = u.pathname;
    const isFxProxy =
      (host === "api.framextv.tech" ||
        host === "api.framextv.xyz" ||
        host === "api.framextv.cc") &&
      (path === "/api/proxy" || path === "/api/subtitles/proxy");
    const isWorker = /\.hybrows\.workers\.dev$/i.test(host);
    if (isFxProxy || isWorker) {
      const targets = [...u.searchParams.entries()]
        .filter(([k]) => k === "url")
        .map(([, v]) => v);
      if (targets.length === 1) {
        const ref = u.searchParams.get("ref") || u.searchParams.get("referer");
        const org = u.searchParams.get("origin");
        if (ref && /^https?:\/\//i.test(ref)) {
          referer = ref.endsWith("/") ? ref : ref.replace(/\?.*$/, "") + "/";
        }
        if (org && /^https?:\/\//i.test(org)) origin = org.replace(/\/$/, "");
        href = targets[0];
      }
    }
  } catch {
    return null;
  }
  try {
    const final = new URL(href);
    if (final.protocol !== "https:") return null;
    if (final.username || final.password) return null;
    return {
      url: final.href,
      headers: { Referer: referer, Origin: origin },
    };
  } catch {
    return null;
  }
}

export function unwrapMediaUrl(raw, apiBase = APIS[0]) {
  return unwrapMedia(raw, apiBase)?.url || null;
}

function streamPayload(value) {
  if (value?.detail && value.detail.success !== undefined) return value.detail;
  return value;
}

function playable(payload) {
  return (
    payload?.success === true &&
    Array.isArray(payload?.sources) &&
    payload.sources.length > 0
  );
}

function labelHeight(label) {
  const lower = String(label || "").toLowerCase();
  if (lower.includes("4k") || lower.includes("uhd")) return 2160;
  const m = lower.match(/(?:^|[^a-z0-9])(\d{3,4})p(?:$|[^a-z0-9])/);
  if (!m) return 0;
  const h = Number(m[1]);
  return h >= 144 && h <= 4320 ? h : 0;
}

function collectStreams(payload, providerName) {
  const out = [];
  const seen = new Set();
  for (const src of payload?.sources || []) {
    const kind = String(src?.type || "hls").toLowerCase();
    if (kind && kind !== "hls") continue;
    const media = unwrapMedia(src.url || src.file);
    if (!media?.url || seen.has(media.url)) continue;
    seen.add(media.url);
    const quality = src.quality || src.label || undefined;
    const server = src.server || providerName || "framex";
    out.push({
      url: media.url,
      type: "hls",
      quality,
      height: labelHeight(quality),
      provider: "framex",
      providerName: `FrameX · ${server}`,
      label: `FrameX · ${server}${quality ? ` ${quality}` : ""}`,
      headers: { ...PLAY_HEADERS, ...media.headers },
    });
  }
  out.sort((a, b) => (b.height || 0) - (a.height || 0));
  return out;
}

async function apiJson(path, params, { preferTor = true } = {}) {
  let lastErr;
  for (const base of APIS) {
    try {
      const r = await torFetch(apiUrl(base, path, params), {
        preferTor,
        timeoutMs: 14000,
        headers: FX_HEADERS,
      });
      if (r.status === 404) return { success: false, code: "not_found" };
      if (!r.ok && r.status !== 429) {
        lastErr = new Error(`http ${r.status}`);
        continue;
      }
      const text = await r.text();
      if (text.trimStart().startsWith("<!")) {
        lastErr = new Error("cloudflare");
        continue;
      }
      const data = JSON.parse(text);
      return streamPayload(data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("framex unreachable");
}

async function listProviders() {
  try {
    const payload = await apiJson("/api/providers", {});
    const list = Array.isArray(payload?.providers) ? payload.providers : [];
    return list
      .filter((p) => {
        const cat = p?.category;
        if (cat && cat !== "movie_tv") return false;
        const st = String(p?.status || "").toLowerCase();
        return !UNAVAILABLE.has(st);
      })
      .map((p) => ({
        id: String(p.id || "").trim(),
        height: labelHeight(p.tagline || p.name || ""),
      }))
      .filter((p) => /^[a-z0-9_]{1,40}$/.test(p.id))
      .sort((a, b) => b.height - a.height)
      .map((p) => p.id);
  } catch {
    return [];
  }
}

function titleParams(type, tmdbId, season, episode) {
  const params = { type: type === "tv" ? "tv" : "movie", id: String(tmdbId) };
  if (type === "tv") {
    params.season = String(season || 1);
    params.episode = String(episode || 1);
  }
  return params;
}

/**
 * Resolve FrameX HLS sources via Tor (Lyra titles path).
 */
export async function resolveFramex(type, tmdbId, season = 1, episode = 1) {
  const id = Number(tmdbId);
  if (!id) return [];
  const base = titleParams(type, id, season, episode);
  const preferTor = torConfigured();
  const streams = [];
  const seen = new Set();

  const pushAll = (payload, name) => {
    for (const s of collectStreams(payload, name)) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      streams.push(s);
    }
  };

  // Default stream (no provider) — often enough.
  try {
    const payload = await apiJson("/api/stream", base, { preferTor });
    if (playable(payload)) pushAll(payload, payload.provider || "default");
  } catch (e) {
    console.log("[framex] default:", e.message);
  }
  if (streams.length) return streams.slice(0, 10);

  // Fan out a few providers (Lyra does concurrent registry resolve).
  const providers = (await listProviders()).slice(0, 6);
  const pending = providers.map((provider) =>
    apiJson("/api/stream", { ...base, provider }, { preferTor })
      .then((payload) => {
        if (playable(payload)) pushAll(payload, provider);
      })
      .catch(() => {})
  );
  await Promise.race([
    Promise.all(pending),
    new Promise((r) => setTimeout(r, 12000)),
  ]);

  return streams.slice(0, 10);
}

export { REFERER as FRAMEX_REFERER, ORIGIN as FRAMEX_ORIGIN };
