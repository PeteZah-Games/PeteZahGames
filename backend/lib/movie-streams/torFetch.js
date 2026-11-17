/**
 * Outbound fetch via Tor SOCKS (Lyra routes FrameX through a clean edge;
 * PeteZah uses local Tor so FrameX doesn't see the VPS IP).
 *
 * TOR_SOCKS_URL / MOVIES_TOR_SOCKS default: socks5h://127.0.0.1:9050
 * Set MOVIES_TOR=0 to force direct-only.
 */
import fetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";

const DEFAULT_SOCKS = "socks5h://127.0.0.1:9050";

let agent = null;
let agentKey = "";
let torOk = null;

function socksUrl() {
  if (String(process.env.MOVIES_TOR || "1").trim() === "0") return "";
  return String(
    process.env.TOR_SOCKS_URL ||
      process.env.MOVIES_TOR_SOCKS ||
      process.env.ALL_PROXY ||
      DEFAULT_SOCKS
  ).trim();
}

function getAgent() {
  const url = socksUrl();
  if (!url) return null;
  if (agent && agentKey === url) return agent;
  agent = new SocksProxyAgent(url);
  agentKey = url;
  return agent;
}

export function torConfigured() {
  return !!socksUrl();
}

/** Probe Tor once (cached). */
export async function torAvailable() {
  if (torOk !== null) return torOk;
  const a = getAgent();
  if (!a) {
    torOk = false;
    return false;
  }
  try {
    const r = await fetch("https://check.torproject.org/api/ip", {
      agent: a,
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    const d = await r.json().catch(() => null);
    torOk = !!(r.ok && d && d.IsTor === true);
  } catch {
    torOk = false;
  }
  return torOk;
}

/**
 * @param {string} url
 * @param {RequestInit & { preferTor?: boolean, timeoutMs?: number }} [opts]
 */
export async function torFetch(url, opts = {}) {
  const {
    preferTor = true,
    timeoutMs = 14000,
    headers,
    ...rest
  } = opts;
  const signal = rest.signal || AbortSignal.timeout(timeoutMs);
  const hdrs = headers || {};

  const tryOnce = async (agent) => {
    const init = { ...rest, headers: hdrs, signal };
    if (agent) init.agent = agent;
    return fetch(url, init);
  };

  const wantTor = preferTor && !!getAgent();
  if (wantTor) {
    try {
      return await tryOnce(getAgent());
    } catch (e) {
      // Fall through to direct — Tor daemon may be down.
      if (!preferTor) throw e;
    }
  }
  return tryOnce(undefined);
}
