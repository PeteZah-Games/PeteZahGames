const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 2;
const PLAYS_KEY = "pz-slot-ok";
const DISPLAY_MS = 6000;

let audioArmed = false;

function readPlays(): number[] {
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr.map(Number).filter((t) => Number.isFinite(t) && now - t < WINDOW_MS);
  } catch {
    return [];
  }
}

function clientCanPlay() {
  return readPlays().length < MAX_PER_WINDOW;
}

function recordPlay() {
  try {
    const next = [...readPlays(), Date.now()].slice(-8);
    localStorage.setItem(PLAYS_KEY, JSON.stringify(next));
  } catch {}
}

function markShown(context: "game" | "app" | "vm") {
  recordPlay();
  fetch("/api/ads/shown", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
  }).catch(() => {});
}

export function armAdAudio() {
  audioArmed = true;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      void ctx.resume();
    }
  } catch {}
}

export async function requestAdGate(
  context: "game" | "app" | "vm"
): Promise<{ show: boolean; reason?: string }> {
  if (!clientCanPlay()) return { show: false, reason: "cooldown" };
  try {
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 4000);
    const r = await fetch("/api/ads/gate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
      signal: ac.signal,
    });
    window.clearTimeout(t);
    if (!r.ok) return { show: clientCanPlay(), reason: "fallback" };
    const data = await r.json().catch(() => ({}));
    return { show: !!data?.show, reason: data?.reason };
  } catch {
    return { show: clientCanPlay(), reason: "offline" };
  }
}

export function playDisplayBreak(context: "game" | "app" | "vm" = "game"): Promise<"done" | "skip"> {
  return new Promise((resolve) => {
    const ms = audioArmed ? DISPLAY_MS : Math.max(5200, DISPLAY_MS - 800);
    window.setTimeout(() => {
      markShown(context);
      resolve("done");
    }, ms);
  });
}

export async function runInterstitial(context: "game" | "app" | "vm" = "game"): Promise<"done" | "skip"> {
  const gate = await requestAdGate(context);
  if (!gate.show) return "skip";
  return playDisplayBreak(context);
}

export function stopVideoAd() {}
export function playVideoAd(context?: "game" | "app" | "vm") {
  return playDisplayBreak(context || "game");
}

export const CONTAINER_ID = "pz-slot-ad-root";
export { DISPLAY_MS };
