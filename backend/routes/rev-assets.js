import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHost } from "../utils/seo-meta.js";
import { getClientIP } from "../utils/client-ip.js";
import { toIPv4 } from "../middleware/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADS_CANDIDATES = [
  path.join(__dirname, "../../public/ads.txt"),
  path.join(__dirname, "../../dist/ads.txt"),
];
const CACHE_DIR = path.join(__dirname, "../../.cache/rev-iq");
const REV_HOST = ["js", "rev", "iq"].join(".");
const TTL_MS = 12 * 60 * 60 * 1000;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_MS = 8000;
const MAX_BYTES = 1_500_000;
const MEM_MAX = 6;

const DEFAULT_ADS = [
  "rev.iq, 8PYLxm5fq41M0Ke4Ii_XvoaIaBE, DIRECT",
  "rev.iq, 639HKDjVJfXkpBE1CRd1jrAbLE8, DIRECT",
  "google.com, pub-6640595376330309, DIRECT, f08c47fec0942fa0",
].join("\n");

let adsTpl = { mtime: 0, text: "", checkedAt: 0, path: "" };
const mem = new Map();
const inflight = new Map();

function requestHost(req) {
  const raw = req.headers["x-forwarded-host"] || req.headers.host || req.hostname || "";
  const first = String(raw).split(",")[0].trim();
  return normalizeHost(first) || "localhost";
}

/**
 * RevIQ's net.js re-fetches its own src and reads Cloudflare-style headers:
 *   CR-IPCountry     → 2-letter country (else "invalid header: cr-geo")
 *   CR-Connecting-IP → client IPv4/IPv6 (else "invalid header: cr-cip")
 * js.rev.iq sets these via CF; our same-origin proxy must set them per visitor.
 */
function clientCountry(req) {
  const raw = String(
    req.headers["cf-ipcountry"] ||
      req.headers["cloudfront-viewer-country"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      ""
  )
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1") return raw;
  return "US";
}

function clientIpForRev(req) {
  const cf = String(req.headers["cf-connecting-ip"] || "").trim();
  if (cf && /^[\d.:a-fA-F]+$/.test(cf)) return cf;
  const trueClient = String(req.headers["true-client-ip"] || "").trim();
  if (trueClient && /^[\d.:a-fA-F]+$/.test(trueClient)) return trueClient;
  const ip = getClientIP(req) || toIPv4(null, req) || "";
  if (ip && ip !== "unknown" && /^[\d.:a-fA-F]+$/.test(ip)) return ip;
  // Last resort so XP() doesn't hard-fail; bidding quality may be lower.
  return "0.0.0.0";
}

function applyRevIqClientHeaders(req, res) {
  const country = clientCountry(req);
  const ip = clientIpForRev(req);
  res.setHeader("CR-IPCountry", country);
  res.setHeader("CR-Connecting-IP", ip);
  // Same-origin reads all headers; expose anyway for any odd CORS path.
  res.setHeader("Access-Control-Expose-Headers", "CR-IPCountry, CR-Connecting-IP, X-Rev-Host");
  res.setHeader("X-Rev-Geo", country);
}

function readAdsTemplate() {
  const now = Date.now();
  if (adsTpl.text && now - adsTpl.checkedAt < 5000) return adsTpl.text;
  adsTpl.checkedAt = now;
  for (const p of ADS_CANDIDATES) {
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs !== adsTpl.mtime || adsTpl.path !== p || !adsTpl.text) {
        adsTpl = {
          mtime: st.mtimeMs,
          text: fs.readFileSync(p, "utf8"),
          checkedAt: now,
          path: p,
        };
      }
      return adsTpl.text;
    } catch {}
  }
  adsTpl = { mtime: 0, text: DEFAULT_ADS, checkedAt: now, path: "" };
  return adsTpl.text;
}

function buildAdsTxt(host) {
  const lines = String(readAdsTemplate() || "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l && !/^ownerdomain\s*=/i.test(l.trim()));
  lines.push(`ownerdomain=${host}`);
  return `${lines.join("\n")}\n`;
}

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
}

function diskPaths(host) {
  const safe = host.replace(/[^a-z0-9.-]/gi, "_").slice(0, 120);
  return {
    js: path.join(CACHE_DIR, `${safe}.js`),
    meta: path.join(CACHE_DIR, `${safe}.json`),
  };
}

function readDisk(host) {
  try {
    const { js, meta } = diskPaths(host);
    const buf = fs.readFileSync(js);
    if (!buf.length || buf.length > MAX_BYTES) return null;
    let fetchedAt = 0;
    try {
      fetchedAt = Number(JSON.parse(fs.readFileSync(meta, "utf8")).fetchedAt) || 0;
    } catch {
      fetchedAt = fs.statSync(js).mtimeMs || 0;
    }
    return { buf, fetchedAt };
  } catch {
    return null;
  }
}

function writeDisk(host, buf) {
  try {
    ensureCacheDir();
    const { js, meta } = diskPaths(host);
    const tmp = `${js}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, js);
    fs.writeFileSync(meta, JSON.stringify({ fetchedAt: Date.now(), bytes: buf.length }));
  } catch {}
}

function memPut(host, entry) {
  if (mem.has(host)) mem.delete(host);
  mem.set(host, entry);
  while (mem.size > MEM_MAX) {
    const oldest = mem.keys().next().value;
    mem.delete(oldest);
  }
}

async function fetchUpstream(host) {
  const url = `https://${REV_HOST}/${encodeURIComponent(host)}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/javascript,*/*",
        "User-Agent": "PeteZahRevProxy/1.0",
      },
      redirect: "follow",
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const ab = await r.arrayBuffer();
    if (ab.byteLength < 32 || ab.byteLength > MAX_BYTES) throw new Error("bad size");
    return Buffer.from(ab);
  } finally {
    clearTimeout(t);
  }
}

async function loadScript(host) {
  const now = Date.now();
  const hit = mem.get(host);
  if (hit && now - hit.fetchedAt < TTL_MS) return hit.buf;

  const disk = readDisk(host);
  if (disk && now - disk.fetchedAt < TTL_MS) {
    memPut(host, disk);
    return disk.buf;
  }

  if (inflight.has(host)) return inflight.get(host);

  const job = (async () => {
    try {
      const buf = await fetchUpstream(host);
      const entry = { buf, fetchedAt: Date.now() };
      memPut(host, entry);
      writeDisk(host, buf);
      return buf;
    } catch (err) {
      if (hit) return hit.buf;
      if (disk && now - disk.fetchedAt < STALE_MS) {
        memPut(host, disk);
        return disk.buf;
      }
      throw err;
    } finally {
      inflight.delete(host);
    }
  })();

  inflight.set(host, job);
  return job;
}

export function adsTxtHandler(req, res) {
  const host = requestHost(req);
  const body = buildAdsTxt(host);
  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("X-Owner-Domain", host);
  res.send(body);
}

export async function revIqJsHandler(req, res) {
  const host = requestHost(req);
  try {
    const buf = await loadScript(host);
    res.status(200);
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    // Body may be cached; geo/IP headers MUST stay per-visitor (no shared edge cache).
    res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
    res.setHeader("Vary", "CF-IPCountry, CF-Connecting-IP, X-Forwarded-For");
    res.setHeader("X-Rev-Host", host);
    applyRevIqClientHeaders(req, res);
    res.send(buf);
  } catch {
    res.status(502).type("text/plain").send("ad script unavailable");
  }
}

export function mountRevAssets(app) {
  app.get("/ads.txt", adsTxtHandler);
  // Under /api so nginx proxies to Node (static /assets/* is nginx-only).
  app.get("/api/ads/net.js", revIqJsHandler);
}
