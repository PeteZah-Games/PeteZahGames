import { useEffect, useState } from "react";

const TTL_MS = 60_000;

let adFree = false;
let adFreeAt = 0;
let pending: Promise<boolean> | null = null;
let onChange: ((on: boolean) => void) | null = null;

export function isAdFreeClient() {
  return adFree;
}

export function setAdFreeListener(fn: ((on: boolean) => void) | null) {
  onChange = fn;
}

function apply(on: boolean) {
  adFree = on;
  adFreeAt = Date.now();
  try {
    if (on) document.documentElement.dataset.pzAdFree = "1";
    else delete document.documentElement.dataset.pzAdFree;
  } catch {}
  try {
    onChange?.(on);
  } catch {}
}

export function refreshAdFreeStatus(force = false): Promise<boolean> {
  if (!force && Date.now() - adFreeAt < TTL_MS && adFreeAt > 0) {
    return Promise.resolve(adFree);
  }
  if (pending) return pending;
  pending = fetch("/api/ads/status", { credentials: "include", cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) return false;
      const d = await r.json().catch(() => null);
      // Strict: only explicit true opts out of ads. Failures keep ads on.
      return d != null && d.adFree === true;
    })
    .then((on) => {
      apply(!!on);
      return adFree;
    })
    .catch(() => {
      apply(false);
      return false;
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
    refreshAdFreeStatus().then((on) => {
      if (alive) setBlocked(on);
    });
    return () => {
      alive = false;
    };
  }, []);
  return blocked;
}
