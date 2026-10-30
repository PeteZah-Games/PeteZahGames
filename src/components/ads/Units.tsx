/**
 * RevIQ display ads — rebuilt to match https://docs.rev.iq/quickstart/frontend
 *
 * - Script: /api/ads/net.js (same-origin proxy of js.rev.iq/{host})
 * - Units: <div data-ad="…" />
 * - ads.txt: 302 → rev.iq/{host}/ads.txt (backend)
 * - Premium: reviq.setAdsEnabled(false)
 * - Optional: reviq.setUid({ e, u }) when signed in
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { hrefs, isGHref, isGvHref } from "@/lib/uiMarks";
import {
  isAdFreeClient,
  refreshAdFreeStatus,
  setAdFreeListener,
  useAdFreeGate,
} from "@/lib/adFree";

export { isAdFreeClient, refreshAdFreeStatus, useAdFreeGate } from "@/lib/adFree";

declare global {
  interface Window {
    reviq?: Array<(api: RevIqApi) => void> | RevIqApi;
  }
}

type RevIqApi = {
  setAdsEnabled?: (on: boolean) => void;
  setUid?: (uid: { e?: string; u?: string; p?: string }) => void;
  refresh?: () => void;
  push?: (fn: (api: RevIqApi) => void) => void;
};

/** Path includes ".rev.iq" so RevIQ can discover the tag + re-fetch CR-* headers same-origin. */
function revScriptSrc() {
  try {
    const host = (window.location.hostname || "petezahgames.com").replace(/^www\./, "");
    return `/api/ads/js.rev.iq/${encodeURIComponent(host)}`;
  } catch {
    return "/api/ads/js.rev.iq/petezahgames.com";
  }
}

let netHooked = false;
let refreshTimer: number | null = null;

setAdFreeListener((on) => {
  withApi((api) => {
    try {
      api.setAdsEnabled?.(!on);
    } catch {}
  });
});

function withApi(fn: (api: RevIqApi) => void) {
  const q = (window.reviq = window.reviq || []);
  if (Array.isArray(q) && typeof (q as any).push === "function") {
    (q as Array<(api: RevIqApi) => void>).push(fn);
    return;
  }
  try {
    fn(q as RevIqApi);
  } catch {}
}

function refreshAds() {
  if (isAdFreeClient()) {
    withApi((api) => {
      try {
        api.setAdsEnabled?.(false);
      } catch {}
    });
    return;
  }
  withApi((api) => {
    try {
      api.setAdsEnabled?.(true);
    } catch {}
    try {
      api.refresh?.();
    } catch {}
  });
}

function scheduleRefresh() {
  if (typeof window === "undefined") return;
  if (refreshTimer != null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    refreshAds();
  }, 150);
  window.setTimeout(() => refreshAds(), 800);
}

function ensureScript() {
  if (typeof document === "undefined") return;
  window.reviq = window.reviq || [];
  const src = revScriptSrc();
  const existing =
    document.querySelector(`script[data-pz-slot-net="1"]`) ||
    document.querySelector('script[src*=".rev.iq"]') ||
    document.querySelector(`script[src="${src}"]`);
  if (existing) {
    if (!netHooked) {
      netHooked = true;
      existing.addEventListener("load", () => scheduleRefresh(), { once: true });
      window.setTimeout(() => scheduleRefresh(), 0);
    }
    return;
  }
  const s = document.createElement("script");
  s.src = src;
  s.defer = true;
  s.dataset.pzSlotNet = "1";
  netHooked = true;
  s.addEventListener("load", () => scheduleRefresh(), { once: true });
  document.head.appendChild(s);
}

export function bootSlotNet() {
  void refreshAdFreeStatus();
  ensureScript();
}

/** Push a privacy-safe hashed identity when the user is signed in (RevIQ setUid). */
export function setRevIqUid(user: { email?: string | null; username?: string | null } | null) {
  if (!user) return;
  const e = String(user.email || "").trim();
  const u = String(user.username || "").trim();
  // Skip junk that produces invalid PPIDs (GPT wants 22–150 chars after hashing path).
  if (!e && !u) return;
  if (e && (e.length < 3 || !e.includes("@"))) return;
  withApi((api) => {
    try {
      const payload: { e?: string; u?: string } = {};
      if (e) payload.e = e;
      if (u) payload.u = u;
      api.setUid?.(payload);
    } catch {}
  });
}

export function isHomeSurface(url: string) {
  const u = String(url || "").toLowerCase();
  return !u || u === "about:blank" || u.startsWith("petezah://newtab") || u.startsWith("petezah://trending");
}

export function isQuietSurface(url: string) {
  const u = String(url || "").toLowerCase();
  if (u.startsWith("petezah://account")) return true;
  if (u.startsWith("petezah://settings")) return true;
  if (u.startsWith("petezah://history")) return true;
  if (u.startsWith("petezah://bookmarks")) return true;
  if (u.startsWith("petezah://extensions")) return true;
  if (u.startsWith("petezah://tools")) return true;
  return false;
}

export function isPlaySurface(url: string, framed = false) {
  if (framed) return true;
  const u = String(url || "");
  if (isGvHref(u) || u.startsWith("petezah://appviewer")) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

export function isImmersiveSurface(url: string, framed = false) {
  return isPlaySurface(url, framed);
}

/** Catalog / media shelves — show RevIQ units. */
export function isSoftEarn(url: string) {
  const u = String(url || "");
  if (isGHref(u) && !isGvHref(u)) return true;
  if (u.startsWith("petezah://apps")) return true;
  if (u.startsWith(hrefs.mu()) || u.startsWith(hrefs.mo())) return true;
  if (u.startsWith("petezah://changelog")) return true;
  if (u.startsWith("petezah://vm")) return true;
  if (u.startsWith("petezah://ai")) return true;
  if (u.startsWith("petezah://chat")) return true;
  return false;
}

export function isStickySurface(url: string, framed = false) {
  if (isImmersiveSurface(url, framed) || isHomeSurface(url)) return false;
  return isSoftEarn(url);
}

export function isRailSurface(url: string) {
  return isSoftEarn(url);
}

export function syncSurfaceAds(url: string, opts?: { fromHome?: boolean; framed?: boolean }) {
  void refreshAdFreeStatus();
  ensureScript();

  if (isAdFreeClient()) {
    withApi((api) => {
      try {
        api.setAdsEnabled?.(false);
      } catch {}
    });
    try {
      document.documentElement.dataset.pzHomeAds = "1";
      document.documentElement.dataset.pzPlayAds = "0";
    } catch {}
    return { sticky: false };
  }

  const home = isHomeSurface(url);
  const quiet = isQuietSurface(url);
  const immersive = isImmersiveSurface(url, !!opts?.framed);
  try {
    document.documentElement.dataset.pzHomeAds = home ? "1" : "0";
    document.documentElement.dataset.pzPlayAds = immersive ? "1" : "0";
  } catch {}

  if (home || quiet || immersive) {
    withApi((api) => {
      try {
        api.setAdsEnabled?.(false);
      } catch {}
    });
    return { sticky: false };
  }

  if (isSoftEarn(url)) {
    withApi((api) => {
      try {
        api.setAdsEnabled?.(true);
      } catch {}
    });
    scheduleRefresh();
    return { sticky: true };
  }

  withApi((api) => {
    try {
      api.setAdsEnabled?.(false);
    } catch {}
  });
  return { sticky: false };
}

export function Slot({
  name,
  size,
  kv,
  style,
  className = "",
}: {
  name: string;
  size?: string;
  kv?: Record<string, string>;
  style?: CSSProperties;
  className?: string;
}) {
  const blocked = useAdFreeGate();
  useEffect(() => {
    if (blocked) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked]);
  if (blocked) return null;
  const extra: Record<string, string> = {};
  if (size) extra["data-ad-size"] = size;
  if (kv) {
    for (const [k, v] of Object.entries(kv)) {
      if (v) extra[`data-kv-${k}`] = v;
    }
  }
  return <div className={className} style={style} data-ad={name} {...extra} />;
}

function DesktopOnly({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 960px)");
    const on = () => setShow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  if (!show) return null;
  return <>{children}</>;
}

function MobileOnly({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 959px)");
    const on = () => setShow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  if (!show) return null;
  return <>{children}</>;
}

export function StickyAnchor({ enabled = true }: { enabled?: boolean }) {
  const [closed, setClosed] = useState(false);
  const [filled, setFilled] = useState(false);
  const blocked = useAdFreeGate();

  useEffect(() => {
    if (blocked || !enabled) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked, enabled]);

  useEffect(() => {
    if (!enabled) {
      setClosed(false);
      setFilled(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (blocked || !enabled || closed) return;
    const root = document.querySelector("[data-pz-forced-anchor='1']");
    if (!root) return;
    const check = () => {
      const slot = root.querySelector("[data-ad]") as HTMLElement | null;
      if (!slot) return;
      if (slot.getAttribute("data-ad-status") === "filled") {
        setFilled(true);
        return;
      }
      const media = slot.querySelector("iframe, img, video");
      if (media) {
        const r = (media as HTMLElement).getBoundingClientRect?.();
        if (r && r.height > 40 && r.width > 40) setFilled(true);
      }
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-ad-status", "style"],
    });
    const t = window.setInterval(check, 1500);
    return () => {
      mo.disconnect();
      window.clearInterval(t);
    };
  }, [blocked, enabled, closed]);

  if (blocked || !enabled || closed) return null;

  return (
    <div
      data-pz-forced-anchor="1"
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 90,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "flex-start",
        maxWidth: "min(420px, calc(100vw - 24px))",
      }}
    >
      <div
        style={{
          position: "relative",
          pointerEvents: filled ? "auto" : "none",
          maxWidth: "100%",
          borderRadius: 10,
          overflow: "visible",
          boxShadow: filled ? "0 10px 28px rgba(0,0,0,0.35)" : "none",
        }}
      >
        {filled ? (
          <button
            type="button"
            aria-label="Close ad"
            onClick={() => setClosed(true)}
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              zIndex: 5,
              width: 26,
              height: 26,
              borderRadius: 999,
              border: "1px solid hsla(210,30%,80%,0.25)",
              background: "hsla(220, 28%, 10%, 0.92)",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        ) : null}
        <Slot name="anchor" kv={{ surface: "earn" }} style={{ width: "min(336px, 100%)", minHeight: 90 }} />
      </div>
    </div>
  );
}

const RAILS_CLOSED_KEY = "pz-rails-closed";

function railsClosed() {
  try {
    return sessionStorage.getItem(RAILS_CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

function markRailsClosed() {
  try {
    sessionStorage.setItem(RAILS_CLOSED_KEY, "1");
  } catch {}
}

export function SideRails({ enabled = true }: { enabled?: boolean }) {
  const [closed, setClosed] = useState(railsClosed);
  const blocked = useAdFreeGate();

  useEffect(() => {
    if (blocked || !enabled || closed) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked, enabled, closed]);

  if (blocked || !enabled || closed) return null;

  return (
    <DesktopOnly>
      <aside
        data-pz-side-rail="left"
        style={{
          position: "fixed",
          left: 8,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 80,
          width: 160,
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          aria-label="Close ads"
          onClick={() => {
            markRailsClosed();
            setClosed(true);
          }}
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            zIndex: 2,
            width: 22,
            height: 22,
            borderRadius: 999,
            border: "1px solid hsla(210,30%,80%,0.25)",
            background: "hsla(220, 28%, 10%, 0.92)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ×
        </button>
        <Slot name="left-rail-2" style={{ width: "100%", minHeight: 180 }} kv={{ surface: "rail" }} />
      </aside>
      <aside
        data-pz-side-rail="right"
        style={{
          position: "fixed",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 80,
          width: 160,
          pointerEvents: "auto",
        }}
      >
        <Slot name="right-rail-2" style={{ width: "100%", minHeight: 200 }} kv={{ surface: "rail" }} />
      </aside>
    </DesktopOnly>
  );
}

export function AdFeedStrip() {
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div data-pz-ad-slot="1" data-ad-slot="feed" style={{ width: "100%", padding: "8px 0" }}>
      <DesktopOnly>
        <Slot name="leaderboard-1" style={{ width: "100%", minHeight: 70 }} kv={{ surface: "feed" }} />
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 80 }} kv={{ surface: "feed" }} />
      </MobileOnly>
    </div>
  );
}

export function AdPageStack({ dense = false }: { dense?: boolean }) {
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div
      data-pz-ad-slot="1"
      data-ad-slot="page-stack"
      style={{ width: "100%", padding: dense ? "6px 0" : "10px 0 6px" }}
    >
      <DesktopOnly>
        <Slot name="billboard-1" style={{ width: "100%", minHeight: 90 }} kv={{ surface: "page" }} />
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 100 }} kv={{ surface: "page" }} />
      </MobileOnly>
    </div>
  );
}
