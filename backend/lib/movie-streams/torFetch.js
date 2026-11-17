/**
 * Outbound fetch via Tor SOCKS.
 * Lyra hits FrameX from a clean Gcore edge; we use local Tor so FrameX
 * doesn't see/ban the VPS (or Cursor sandbox) IP.
 *
 * TOR_SOCKS_URL / MOVIES_TOR_SOCKS — socks5h://127.0.0.1:9050 (default)
 * MOVIES_TOR=0 — disable Tor (direct only; FrameX will Cloudflare-block).
 *
 * Never reuse ALL_PROXY/HTTP_PROXY — those are often http:// sandbox proxies
 * and break SocksProxyAgent.
 */
import fetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";

const DEFAULT_SOCKS = "socks5h://127.0.0.1:9050";

let agent = null;
let agentKey = "";
let torOk = null;

function socksUrl() {
  if (String(process.env.MOVIES_TOR || "1").trim() === "0") return "";
  const raw = String(
    process.env.TOR_SOCKS_URL || process.env.MOVIES_TOR_SOCKS || DEFAULT_SOCKS
  ).trim();
  if (!raw) return "";
  // Only accept socks schemes — ignore accidental http(s) proxy env bleed.
  if (!/^socks5h?:\/\//i.test(raw) && !/^socks4a?:\/\//i.test(raw)) {
    console.log("[torFetch] ignoring non-socks proxy URL:", raw.slice(0, 32));
    return DEFAULT_SOCKS;
  }
  return raw;
}

function getAgent() {
  const url = socksUrl();
  if (!url) return null;
  if (agent && agentKey === url) return agent;
  try {
    agent = new SocksProxyAgent(url);
    agentKey = url;
    return agent;
  } catch (e) {
    console.log("[torFetch] agent error:", e.message);
    agent = null;
    agentKey = "";
    return null;
  }
}

export function torConfigured() {
  return !!socksUrl();
}

/** Probe Tor once (cached). Soft-fail — don't throw. */
export async function torAvailable() {
  if (torOk !== null) return torOk;
  const a = getAgent();
  if (!a) {
    torOk = false;
    return false;
  }
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      agent: a,
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });
    const d = await r.json().catch(() => null);
    torOk = !!(r.ok && d && d.ip);
    if (torOk) console.log("[torFetch] tor exit", d.ip);
  } catch (e) {
    console.log("[torFetch] tor probe failed:", e.message);
    torOk = false;
  }
  return torOk;
}

/**
 * Prefer Tor; fall back to direct if Tor fails (so local/dev still works).
 * @param {string} url
 * @param {{ preferTor?: boolean, timeoutMs?: number, headers?: Record<string,string>, method?: string, body?: any }} [opts]
 */
export async function torFetch(url, opts = {}) {
  const {
    preferTor = true,
    timeoutMs = 16000,
    headers,
    method,
    body,
  } = opts;
  const hdrs = headers || {};
  const signal = AbortSignal.timeout(timeoutMs);

  const tryOnce = async (useAgent) => {
    const init = { method: method || "GET", headers: hdrs, signal };
    if (body !== undefined) init.body = body;
    if (useAgent) init.agent = useAgent;
    return fetch(url, init);
  };

  if (preferTor) {
    const a = getAgent();
    if (a) {
      try {
        return await tryOnce(a);
      } catch (e) {
        console.log("[torFetch] tor miss, trying direct:", e.message);
      }
    }
  }
  return tryOnce(undefined);
}
