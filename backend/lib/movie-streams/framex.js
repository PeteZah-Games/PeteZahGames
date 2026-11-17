/**
 * Lyra titles/FrameX resolver (selenesia/lyra → mochi/stream/titles.rs).
 *
 * Flow (same as Lyra):
 *   1) Prefer English-capable providers (bowler first)
 *   2) GET /api/stream (+ provider registry)
 *   3) Unwrap hybrows/api proxy wrappers → real https m3u8
 *   4) Rank English + height; drop junk clip URLs
 *   5) Collect OpenSubtitles-style tracks from payload /api/subtitles
 *
 * All FrameX API calls go through Tor (torFetch) so CF/FrameX don't ban the VPS IP.
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

const UNAVAILABLE = new Set(["down", "unavailable", "disabled"]);
const NON_LANGUAGES = new Set([
  "",
  "sub",
  "dub",
  "auto",
  "multi",
  "mul",
  "original",
  "default",
  "raw",
  "und",
]);
/** Prefer these FrameX providers first (Lyra ranks by quality tagline; bowler = English Citadel). */
const PREFERRED_PROVIDERS = ["bowler", "giant", "little_prince", "root_rider", "executioner"];
/** Filenames / hosts that are spam/clip bait — never autoplay these. */
const JUNK_URL_RE =
  /bigtits|big.?boobs|xxx|porn|onlyfans|hentai|nude|nsfw|clipbait|trailer[_-]?bait/i;

function apiUrl(base, path, params) {
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/**
 * Resolve FrameX source URL + play headers.
 * Hybrows worker hostnames often fail DNS on VPS/sandbox — always unwrap to the
 * inner CDN and keep the wrapper's ref/origin (rivestream / vidrock / etc).
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
      /^api\.framextv\.(tech|xyz|cc)$/i.test(host) &&
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
          try {
            referer = new URL(ref).origin + "/";
          } catch {
            referer = ref.endsWith("/") ? ref : ref + "/";
          }
        }
        if (org && /^https?:\/\//i.test(org)) {
          try {
            origin = new URL(org).origin;
          } catch {
            origin = org.replace(/\/$/, "");
          }
        }
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
    if (JUNK_URL_RE.test(final.pathname) || JUNK_URL_RE.test(final.href)) return null;
    return {
      url: final.href,
      headers: { Referer: referer, Origin: origin },
    };
  } catch {
    return null;
  }
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

/** Lyra `language_code` + quality `| English` suffix. */
function languageCode(value) {
  const lower = String(value || "").trim().toLowerCase();
  if (!lower || NON_LANGUAGES.has(lower)) return "und";
  const named = {
    english: "en",
    hindi: "hi",
    spanish: "es",
    french: "fr",
    german: "de",
    italian: "it",
    portuguese: "pt",
    russian: "ru",
    japanese: "ja",
    korean: "ko",
    chinese: "zh",
    arabic: "ar",
    turkish: "tr",
    polish: "pl",
    dutch: "nl",
    thai: "th",
    vietnamese: "vi",
    indonesian: "id",
    tamil: "ta",
    telugu: "te",
    bengali: "bn",
    bangla: "bn",
  };
  if (named[lower]) return named[lower];
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(lower)) return lower.slice(0, 2);
  return "und";
}

/** Lyra `source_language` — language / audio / lang / quality `| Lang`. */
function sourceLanguage(src) {
  for (const field of ["language", "audio", "lang"]) {
    const code = languageCode(src?.[field]);
    if (code !== "und") return code;
  }
  const quality = String(src?.quality || src?.label || "");
  if (quality.includes("|")) {
    const code = languageCode(quality.split("|").pop());
    if (code !== "und") return code;
  }
  const server = String(src?.server || "");
  const enHint = /\benglish\b|\ben\b/i.test(server) || /\benglish\b/i.test(quality);
  if (enHint) return "en";
  return "und";
}

function collectSubtitles(payloads) {
  const out = [];
  const seen = new Set();
  for (const payload of payloads) {
    const list = Array.isArray(payload?.subtitles)
      ? payload.subtitles
      : Array.isArray(payload?.tracks)
        ? payload.tracks
        : [];
    for (const track of list) {
      const raw = track?.url || track?.file;
      if (!raw || typeof raw !== "string") continue;
      let href;
      try {
        href = new URL(raw.trim()).href;
      } catch {
        continue;
      }
      if (!/^https:/i.test(href) || seen.has(href)) continue;
      seen.add(href);
      const lang = languageCode(track.lang || track.language || track.label || "");
      out.push({
        url: href,
        label: String(track.label || track.language || lang || "CC"),
        language: lang,
        format: String(track.format || "vtt").toLowerCase(),
        isDefault: track.isDefault === true || track.default === true,
      });
      if (out.length >= 40) return out;
    }
  }
  // Prefer English default first.
  out.sort((a, b) => {
    const score = (t) =>
      (t.language === "en" ? 4 : t.language !== "und" ? 1 : 0) + (t.isDefault ? 2 : 0);
    return score(b) - score(a);
  });
  if (out.length && !out.some((t) => t.isDefault)) {
    const en = out.find((t) => t.language === "en");
    if (en) en.isDefault = true;
  }
  return out;
}

function collectStreams(payload, providerName) {
  const out = [];
  const seen = new Set();
  for (const src of payload?.sources || []) {
    const kind = String(src?.type || "hls").toLowerCase();
    if (kind && kind !== "hls" && kind !== "m3u8") continue;
    const media = unwrapMedia(src.url || src.file);
    if (!media?.url || seen.has(media.url)) continue;
    seen.add(media.url);
    const quality = src.quality || src.label || undefined;
    const server = src.server || providerName || payload?.provider || "framex";
    const language = sourceLanguage(src);
    const height = labelHeight(quality) || labelHeight(server);
    out.push({
      url: media.url,
      type: "hls",
      quality,
      height,
      language,
      provider: "framex",
      providerName: `FrameX · ${server}`,
      label: `FrameX · ${server}${quality ? ` ${quality}` : ""}`,
      headers: { ...media.headers },
      skipProxy: false,
    });
  }
  return out;
}

function rankStream(s, requested = "en") {
  const lang = s.language || "und";
  const languageRank =
    lang === requested || (requested === "en" && lang === "und" && /\benglish\b/i.test(s.label || ""))
      ? 2
      : lang === "und"
        ? 1
        : lang === requested
          ? 2
          : 0;
  // Prefer explicit English over und.
  const explicitEn = lang === "en" ? 1 : 0;
  return [languageRank, explicitEn, s.height || 0];
}

function cmpRank(a, b, requested = "en") {
  const ra = rankStream(a, requested);
  const rb = rankStream(b, requested);
  for (let i = 0; i < ra.length; i++) {
    if (rb[i] !== ra[i]) return rb[i] - ra[i];
  }
  return 0;
}

async function apiJson(path, params) {
  let lastErr;
  for (const base of APIS) {
    try {
      const r = await torFetch(apiUrl(base, path, params), {
        preferTor: true,
        timeoutMs: 18000,
        headers: FX_HEADERS,
      });
      const text = await r.text();
      if (text.trimStart().startsWith("<!")) {
        lastErr = new Error(`cloudflare from ${base}`);
        continue;
      }
      if (r.status === 404) return { success: false, code: "not_found" };
      if (!r.ok && r.status !== 429) {
        lastErr = new Error(`http ${r.status} from ${base}`);
        continue;
      }
      return streamPayload(JSON.parse(text));
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
    const ids = list
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

    // Bowler / preferred English providers first, then the rest.
    const ordered = [];
    const seen = new Set();
    for (const id of PREFERRED_PROVIDERS) {
      if (ids.includes(id) && !seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
    for (const id of ids) {
      if (!seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
    return ordered;
  } catch {
    return [...PREFERRED_PROVIDERS];
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
 * Resolve FrameX HLS sources (Tor). Prefer English (bowler/Citadel), skip junk clips.
 */
export async function resolveFramex(type, tmdbId, season = 1, episode = 1) {
  const id = Number(tmdbId);
  if (!id) return [];
  const base = titleParams(type, id, season, episode);
  const streams = [];
  const seen = new Set();
  const payloads = [];

  const pushAll = (payload, name) => {
    if (!payload) return;
    payloads.push(payload);
    for (const s of collectStreams(payload, name)) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      streams.push(s);
    }
  };

  // 1) Preferred English provider first (bowler) — don't trust empty-provider default
  //    (executioner often returns clipbait m3u8 filenames).
  try {
    const bowler = await apiJson("/api/stream", { ...base, provider: "bowler" });
    if (playable(bowler)) {
      pushAll(bowler, bowler.provider || "bowler");
      console.log(
        "[framex] bowler ok",
        streams.length,
        "en=",
        streams.filter((s) => s.language === "en").length,
        "tor=",
        torConfigured()
      );
    }
  } catch (e) {
    console.log("[framex] bowler:", e.message);
  }

  // 2) Default + registry — fill more servers, still ranked later.
  try {
    const payload = await apiJson("/api/stream", base);
    if (playable(payload)) pushAll(payload, payload.provider || "default");
  } catch (e) {
    console.log("[framex] default:", e.message);
  }

  const hasEnglish = streams.some((s) => s.language === "en");
  if (!hasEnglish || streams.length < 3) {
    const providers = (await listProviders())
      .filter((p) => p !== "bowler")
      .slice(0, 6);
    console.log("[framex] trying providers", providers.join(",") || "(none)");
    await Promise.race([
      Promise.all(
        providers.map((provider) =>
          apiJson("/api/stream", { ...base, provider })
            .then((payload) => {
              if (playable(payload)) pushAll(payload, provider);
            })
            .catch(() => {})
        )
      ),
      new Promise((r) => setTimeout(r, 14000)),
    ]);
  }

  // Extra subtitle pack if stream payloads had few tracks.
  try {
    const subPayload = await apiJson("/api/subtitles", base);
    if (subPayload?.success) payloads.push(subPayload);
  } catch {}

  const subtitles = collectSubtitles(payloads);
  streams.sort((a, b) => cmpRank(a, b, "en"));

  // Prefer keeping English sources; if we have any, drop obvious non-English first.
  let ranked = streams;
  const english = streams.filter((s) => s.language === "en");
  if (english.length) {
    ranked = [...english, ...streams.filter((s) => s.language !== "en")];
  }

  const out = ranked.slice(0, 10).map((s) => ({
    ...s,
    subtitles: s === ranked[0] || s === english[0] ? subtitles : undefined,
  }));
  // Attach full subtitle list on every stream so the client can toggle CC.
  for (const s of out) s.subtitles = subtitles;

  console.log(
    "[framex] total streams",
    out.length,
    "top=",
    out[0]?.label,
    "subs=",
    subtitles.length
  );
  return out;
}

export { REFERER as FRAMEX_REFERER, ORIGIN as FRAMEX_ORIGIN };
