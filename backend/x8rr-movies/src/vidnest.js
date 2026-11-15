import { RotatingKey, fetchPageScripts, stringLiterals } from "./keys.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SITE = "https://vidnest.fun";
const API = "https://new.vidnest.fun";
// Key baked into the vidnest.fun player bundle (module "decryptCipherResponse"), declared
// right before the API host literal. Other token-like literals are tried after that one.
const SECRET = new RotatingKey({
  name: "vidnest",
  env: "VIDNEST_SECRET",
  fallback: "K3p8vQ2mX9rL5wZ0fN7bG1sH4tJ6dC9_y8S3wM1nQ5pL2",
  discover: async () => {
    const code = (await fetchPageScripts(SITE + "/movie/550")).join("\n");
    const host = API.replace(/[.\/]/g, "\\$&");
    const near = [...code.matchAll(new RegExp(`=["'\`]([^"'\`]{16,128})["'\`],\\w+=["'\`]${host}["'\`]`, "g"))].map((m) => m[1]);
    return [...near, ...stringLiterals(code, "[A-Za-z0-9_-]{32,64}")];
  },
});
// Alfa returns relative "/hls/..." paths that the player prefixes with one of these.
const ALFA_HOSTS = [
  "https://long-night-d802.streamed-5.workers.dev",
  "https://blue-bush-5977.streamed-7.workers.dev",
  "https://rapid-heart-03c8.streamed-4.workers.dev",
  "https://super-flower-9c85.streamed-2.workers.dev",
  "https://flat-sky-cf20.streamed-850.workers.dev",
  "https://vidrift-cf.streamed-8.workers.dev",
];
const TIMEOUT = 12000;

// server key -> backend path segment (the "hexa" server is a VidLink proxy; skipped,
// VidLink is Cloudflare-blocked for us).
const SERVERS = {
  catflix: "yflix",
  filxer: "rogflix",
  gama: "vidzee",
  lamda: "ophim",
  beta: "flixhq",
  alfa: "onehd",
  prime: "rpmvid",
  zeta: "nextgencloudfabric",
  ophim: "klikxxi",
  sigma: "hollymoviehd",
  delta: "allmovies",
};

function b64url(s) {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64");
}

async function decrypt(j) {
  if (!(j && j.v === 2 && j.d)) return j;
  const buf = b64url(j.d);
  const out = await SECRET.use(async (secret) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${j.n}|${secret}`));
    const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, key, buf.subarray(12));
  });
  const text = new TextDecoder().decode(out);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function api(path) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const resp = await fetch(`${API}${path}?_n=${nonce}`, {
    headers: { "User-Agent": UA, Referer: SITE + "/", Origin: SITE },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!resp.ok) throw new Error(`${path} ${resp.status}`);
  return decrypt(await resp.json());
}

function pickHeaders(h) {
  if (!h || typeof h !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.trim();
    if (/^(referer|origin)$/i.test(key)) out[key[0].toUpperCase() + key.slice(1).toLowerCase()] = String(v).trim();
  }
  return Object.keys(out).length ? out : undefined;
}

function quality(q) {
  const m = /(\d{3,4})p?/i.exec(q || "");
  return m ? m[1] + "p" : undefined;
}

function mk(server, url, { type, q, headers, label } = {}) {
  const s = {
    url: url.trim().replace(/\s+/g, ""),
    type: type === "mp4" ? "file" : "hls",
    provider: "vidnest",
    providerName: `VidNest ${server[0].toUpperCase()}${server.slice(1)}${label ? ` (${label})` : ""}`,
  };
  const qq = quality(q);
  if (qq) s.quality = qq;
  if (headers) s.headers = headers;
  return s;
}

// Each handler mirrors the matching branch in the vidnest.fun player.
const HANDLERS = {
  catflix: (d) => (d?.url ? [mk("catflix", d.url, { headers: pickHeaders(d.headers) })] : []),
  filxer: (d) => (d?.url ? [mk("filxer", d.url)] : []),
  gama: (d) =>
    (d?.streams || [])
      .filter((s) => s?.url)
      .map((s) => mk("gama", s.url, { type: s.type, q: s.quality, headers: pickHeaders(s.headers), label: s.language })),
  lamda: (d) =>
    (d?.streams || [])
      .filter((s) => s?.url)
      .map((s) => mk("lamda", s.url, { type: s.type, q: s.quality, headers: pickHeaders(s.headers) })),
  beta: (d) => (d?.status === "success" && d.url ? [mk("beta", d.url, { type: d.type, q: d.quality })] : []),
  alfa: (d) =>
    d?.status === "success"
      ? (d.streams || [])
          .filter((s) => s?.url && ["original", "multi"].includes((s.language || "").toLowerCase()))
          .map((s, i) =>
            mk("alfa", /^https?:\/\//.test(s.url) ? s.url : ALFA_HOSTS[i % ALFA_HOSTS.length] + s.url, {
              type: s.type,
              q: s.quality,
            }),
          )
      : [],
  prime: (d) =>
    (d?.streams || [])
      .filter((s) => s?.url)
      .map((s) =>
        mk("prime", s.url, {
          type: s.type,
          q: s.quality,
          headers: s.type === "mp4" ? undefined : { Referer: "https://vidora.stream/", Origin: "https://vidora.stream" },
        }),
      ),
  zeta: (d) =>
    (d?.streams || [])
      .filter((s) => s?.url)
      .map((s) => mk("zeta", s.url, { type: s.type, q: s.quality, headers: pickHeaders(s.headers), label: s.language })),
  ophim: (d) =>
    (d?.sources || []).filter((s) => s?.url).map((s) => mk("ophim", s.url, { type: s.type, q: s.quality })),
  sigma: (d) =>
    (d?.streams || [])
      .filter((s) => s?.url && s.type === "hls" && s.language === "GS-25")
      .map((s) => mk("sigma", s.url, { headers: pickHeaders(s.headers) })),
  delta: (d) =>
    (d?.streams || [])
      .filter((s) => s?.url)
      .map((s) => mk("delta", s.url, { type: s.type, headers: pickHeaders(s.headers), label: s.language })),
};

// Several vidnest servers intermittently hand back dead/Cloudflare-blocked or embed-page
// URLs, so probe each candidate (in parallel) and keep only ones that actually serve media.
async function alive(s) {
  if (/\/embed[./]/.test(s.url)) return false;
  try {
    const r = await fetch(s.url, {
      headers: { "User-Agent": UA, Referer: new URL(s.url).origin + "/", ...(s.headers || {}), Range: "bytes=0-1023" },
      signal: AbortSignal.timeout(6000),
    });
    if (s.type === "hls") return r.ok && (await r.text()).trimStart().startsWith("#EXTM3U");
    r.body?.cancel();
    return r.status === 200 || r.status === 206;
  } catch {
    return false;
  }
}

export async function vidnestExtract(type, tmdbId, season, episode) {
  try {
    const isTV = type !== "movie";
    const jobs = Object.entries(SERVERS).map(async ([server, seg]) => {
      // hollymoviehd has no movie/tv prefix in its base path, so it gets the same shape anyway.
      const path = isTV ? `/${seg}/tv/${tmdbId}/${season}/${episode}` : `/${seg}/movie/${tmdbId}`;
      try {
        return HANDLERS[server](await api(path));
      } catch (e) {
        return [];
      }
    });
    const streams = (await Promise.all(jobs)).flat();
    const ok = await Promise.all(streams.map(alive));
    return streams.filter((_, i) => ok[i]);
  } catch (e) {
    console.log("[vidnest] error:", e.message);
    return [];
  }
}
