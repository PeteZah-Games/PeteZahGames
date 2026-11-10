import { useEffect, useState } from "react";

const TTL_MS = 60_000;

function readBootFree(): boolean {
  try {
    if (typeof window !== "undefined" && window.__pzAdFree === true) return true;
  } catch {}
  try {
    if (typeof document !== "undefined" && document.documentElement.dataset.pzAdFree === "1") {
      return true;
    }
  } catch {}
  try {
    return sessionStorage.getItem("pz-adfree") === "1";
  } catch {
    return false;
  }
}

let adFree = readBootFree();
let adFreeAt = adFree ? Date.now() : 0;
let pending: Promise<boolean> | null = null;
let gateConsumed = false;
const listeners = new Set<(on: boolean) => void>();

declare global {
  interface Window {
    __pzAdFree?: boolean;
    __pzAdGate?: Promise<boolean>;
  }
}

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
    window.__pzAdFree = on;
  } catch {}
  try {
    if (on) document.documentElement.dataset.pzAdFree = "1";
    else delete document.documentElement.dataset.pzAdFree;
  } catch {}
  try {
    sessionStorage.setItem("pz-adfree", on ? "1" : "0");
  } catch {}
  listeners.forEach((fn) => {
    try {
      fn(on);
    } catch {}
  });
}

/** Drop RevIQ / rails tags if Premium flips on mid-session. */
export function stripAdScripts() {
  if (typeof document === "undefined") return;
  try {
    const scripts = document.querySelectorAll(
      'script[data-pz-slot-net], script[src="/ad.js"], script[src*="pz-home-rails"], script[src*=".rev.iq"]'
    );
    scripts.forEach((s) => {
      try {
        s.remove();
      } catch {}
    });
  } catch {}
  try {
    document.querySelectorAll("[data-ad]").forEach((el) => {
      el.removeAttribute("data-ad");
      el.setAttribute("data-pz-ad-scrubbed", "1");
    });
  } catch {}
  try {
    ["goog_rewarded", "google_vignette", "pz-break-skip"].forEach((id) => {
      document.getElementById(id)?.remove();
    });
  } catch {}
  try {
    window.reviq = [];
  } catch {}
}

export function refreshAdFreeStatus(force = false): Promise<boolean> {
  if (!force && Date.now() - adFreeAt < TTL_MS && adFreeAt > 0) {
    return Promise.resolve(adFree);
  }
  if (pending) return pending;

  const bootGate =
    !gateConsumed &&
    typeof window !== "undefined" &&
    window.__pzAdGate &&
    typeof window.__pzAdGate.then === "function"
      ? window.__pzAdGate
      : null;
  if (bootGate) gateConsumed = true;

  const runFetch = () =>
    fetch("/api/ads/status", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 429 || !r.ok) return adFree;
        const d = await r.json().catch(() => null);
        return d != null && d.adFree === true;
      })
      .catch(() => {
        adFreeAt = Date.now() - Math.floor(TTL_MS * 0.75);
        return adFree;
      });

  pending = (bootGate || runFetch())
    .then((on) => {
      const free = !!on;
      apply(free);
      if (free) stripAdScripts();
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
