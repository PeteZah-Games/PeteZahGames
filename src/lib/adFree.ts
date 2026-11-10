import { useEffect, useState } from "react";

const TTL_MS = 60_000;

let adFree = false;
let adFreeAt = 0;
let pending: Promise<boolean> | null = null;
const listeners = new Set<(on: boolean) => void>();

export function isAdFreeClient() {
  return adFree;
}

export function setAdFreeListener(fn: ((on: boolean) => void) | null) {
  listeners.clear();
  if (fn) listeners.add(fn);
}

export function subscribeAdFree(fn: (on: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function apply(on: boolean) {
  adFree = on;
  adFreeAt = Date.now();
  try {
    if (on) document.documentElement.dataset.pzAdFree = "1";
    else delete document.documentElement.dataset.pzAdFree;
  } catch {}
  listeners.forEach((fn) => {
    try {
      fn(on);
    } catch {}
  });
}

export function refreshAdFreeStatus(force = false): Promise<boolean> {
  if (!force && Date.now() - adFreeAt < TTL_MS && adFreeAt > 0) {
    return Promise.resolve(adFree);
  }
  if (pending) return pending;
  pending = fetch("/api/ads/status", { credentials: "include", cache: "no-store" })
    .then(async (r) => {
      // Keep the last known state on rate-limit / transient failures so Premium
      // users aren't flipped back onto ads for a full TTL window.
      if (r.status === 429 || !r.ok) return adFree;
      const d = await r.json().catch(() => null);
      // Strict: only explicit true opts out of ads.
      return d != null && d.adFree === true;
    })
    .then((on) => {
      apply(!!on);
      return adFree;
    })
    .catch(() => {
      // Network blip — keep previous; only stamp TTL so we retry soon.
      adFreeAt = Date.now() - Math.floor(TTL_MS * 0.75);
      return adFree;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useAdFreeGate() {
  const [blocked, setBlocked] = useState(adFree);
  useEffect(() => {
    let alive = true;
    const unsub = subscribeAdFree((on) => {
      if (alive) setBlocked(on);
    });
    refreshAdFreeStatus().then((on) => {
      if (alive) setBlocked(on);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return blocked;
}
