import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
function revPublisherHost() {
  try {
    const host = (window.location.hostname || "petezahgames.com").replace(/^www\./, "").toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return "petezahgames.com";
    }
    return host;
  } catch {
    return "petezahgames.com";
  }
}

function revScriptSrc() {
  // Prefer CourseAtlas-style /ad.js; fall back to js.rev.iq path if needed.
  try {
    if (typeof document !== "undefined" && document.querySelector('script[src="/ad.js"]')) {
      return "/ad.js";
    }
  } catch {}
  return `/api/ads/js.rev.iq/${encodeURIComponent(revPublisherHost())}`;
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

export function isGamesCatalog(url: string) {
  const u = String(url || "");
  return isGHref(u) && !isGvHref(u);
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

  if (quiet || immersive) {
    withApi((api) => {
      try {
        api.setAdsEnabled?.(false);
      } catch {}
    });
    return { sticky: false };
  }

  // Home + catalog: same shell as CourseAtlas (rails / sticky / interstitial).
  if (home || isSoftEarn(url)) {
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

function useMq(query: string) {
  const [show, setShow] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setShow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return show;
}

/** Match Rosin long-banner breakpoint (728 leaderboard from 760px up). */
function DesktopOnly({ children }: { children: ReactNode }) {
  if (!useMq("(min-width: 760px)")) return null;
  return <>{children}</>;
}

function MobileOnly({ children }: { children: ReactNode }) {
  if (!useMq("(max-width: 759px)")) return null;
  return <>{children}</>;
}

/** Soft close chip inset on the creative — not hanging off the corner. */
const closeBtnStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  zIndex: 5,
  width: 22,
  height: 22,
  borderRadius: 999,
  border: "1px solid hsla(210,30%,80%,0.14)",
  background: "hsla(220, 20%, 8%, 0.45)",
  color: "hsla(0,0%,100%,0.55)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1,
  pointerEvents: "auto",
  boxShadow: "none",
};

/**
 * Sticky bottom anchor — shell #pz-anchor in index.html is the primary unit.
 * This React fallback only runs if the shell node was removed.
 */
export function StickyAnchor({ enabled = true }: { enabled?: boolean }) {
  const blocked = useAdFreeGate();

  useEffect(() => {
    if (blocked || !enabled) return;
    ensureScript();
    scheduleRefresh();
    try {
      if (!document.getElementById("pz-anchor") && !document.querySelector('[data-ad="anchor"]')) {
        const el = document.createElement("div");
        el.id = "pz-anchor";
        el.setAttribute("data-ad", "anchor");
        document.body.appendChild(el);
      }
      if (!document.querySelector('[data-ad="interstitial-1"]')) {
        const el = document.createElement("div");
        el.setAttribute("data-ad", "interstitial-1");
        document.body.appendChild(el);
      }
    } catch {}
  }, [blocked, enabled]);

  return null;
}

function railSideClosed(side: "l" | "r") {
  try {
    return sessionStorage.getItem(side === "l" ? "pz-rail-l-closed" : "pz-rail-r-closed") === "1";
  } catch {
    return false;
  }
}

/** Ensures CourseAtlas-style left-rail-1 / right-rail-1 shell nodes exist. */
export function SideRails({ enabled = true }: { enabled?: boolean }) {
  const blocked = useAdFreeGate();

  useEffect(() => {
    if (blocked || !enabled) return;
    ensureScript();
    scheduleRefresh();
    try {
      if (!railSideClosed("l") && !document.querySelector(".pz-side-l, [data-ad='left-rail-1']")) {
        const el = document.createElement("div");
        el.className = "pz-side-l";
        el.setAttribute("data-ad", "left-rail-1");
        document.body.appendChild(el);
      }
      if (!railSideClosed("r") && !document.querySelector(".pz-side-r, [data-ad='right-rail-1']")) {
        const el = document.createElement("div");
        el.className = "pz-side-r";
        el.setAttribute("data-ad", "right-rail-1");
        document.body.appendChild(el);
      }
    } catch {}
  }, [blocked, enabled]);

  return null;
}

const HOME_AD_KEY = "pz-home-long-ad-closed";

/** Long, centered, dismissible homepage banner — RevIQ only (no Adsterra). */
export function HomeLongAd({ enabled = true }: { enabled?: boolean }) {
  const [closed, setClosed] = useState(() => {
    try {
      return sessionStorage.getItem(HOME_AD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const blocked = useAdFreeGate();
  const wide = useMq("(min-width: 760px)");

  useEffect(() => {
    if (!enabled) setClosed(false);
  }, [enabled]);

  useEffect(() => {
    if (blocked || !enabled || closed) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked, enabled, closed]);

  if (blocked || !enabled || closed) return null;

  return (
    <div
      data-pz-home-banner="1"
      data-pz-content-ad="1"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 14,
        transform: "translateX(-50%)",
        zIndex: 45,
        width: "min(728px, calc(100% - 32px))",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 14,
          overflow: "hidden",
          padding: "8px 10px 10px",
          background: "hsla(220, 35%, 6%, 0.72)",
          border: "1px solid hsla(210, 40%, 80%, 0.12)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
        }}
      >
        <button
          type="button"
          aria-label="Close ad"
          onClick={() => {
            try {
              sessionStorage.setItem(HOME_AD_KEY, "1");
            } catch {}
            setClosed(true);
          }}
          style={closeBtnStyle}
        >
          ×
        </button>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            width: "100%",
            minHeight: wide ? 90 : 50,
          }}
        >
          <Slot
            name={wide ? "leaderboard-1" : "mobile-unit-1"}
            size={wide ? "728x90" : "320x50"}
            kv={{ surface: "home" }}
            style={{ width: "100%", minHeight: wide ? 90 : 50 }}
          />
        </div>
      </div>
    </div>
  );
}

function LongBannerShell({
  slotName,
  mobileName = "mobile-unit-1",
  dense = false,
  kv,
  idAttr,
  idValue,
}: {
  slotName: string;
  mobileName?: string;
  dense?: boolean;
  kv: Record<string, string>;
  idAttr: string;
  idValue: string;
}) {
  const blocked = useAdFreeGate();
  const wide = useMq("(min-width: 760px)");
  useEffect(() => {
    if (blocked) return;
    ensureScript();
    scheduleRefresh();
    const t1 = window.setTimeout(() => scheduleRefresh(), 1200);
    const t2 = window.setTimeout(() => scheduleRefresh(), 4000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [blocked, slotName]);
  if (blocked) return null;
  const minH = wide ? 90 : 100;
  return (
    <div
      data-pz-ad-slot="1"
      data-ad-slot={kv.surface || "banner"}
      {...{ [idAttr]: idValue }}
      style={{
        width: "100%",
        maxWidth: 728,
        margin: "0 auto",
        padding: dense ? "6px 0" : "10px 0 8px",
        minHeight: minH,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Slot
        name={wide ? slotName : mobileName}
        size={wide ? "728x90" : "300x250"}
        kv={kv}
        style={{ width: "100%", minHeight: minH }}
      />
    </div>
  );
}

export function AdFeedStrip() {
  const idRef = useRef(`pz-feed-${Math.random().toString(36).slice(2, 9)}`);
  return (
    <LongBannerShell
      slotName="leaderboard-1"
      kv={{ surface: "feed" }}
      idAttr="data-pz-feed-id"
      idValue={idRef.current}
    />
  );
}

/** Long in-flow banner (728×90 / 300×250) — used at bottom of games/apps/etc. */
export function AdPageStack({ dense = false }: { dense?: boolean }) {
  const idRef = useRef(`pz-page-${Math.random().toString(36).slice(2, 9)}`);
  return (
    <LongBannerShell
      slotName="leaderboard-3"
      dense={dense}
      kv={{ surface: "page" }}
      idAttr="data-pz-page-id"
      idValue={idRef.current}
    />
  );
}

/** Mid-catalog long banner for games — never uses sticky `anchor` / side-rail units. */
export function GamesAnchorStrip({
  withBanner = true,
}: {
  withBanner?: boolean;
}) {
  const idRef = useRef(`pz-ganchors-${Math.random().toString(36).slice(2, 9)}`);
  if (!withBanner) return null;
  return (
    <LongBannerShell
      slotName="leaderboard-4"
      kv={{ surface: "games", slot: "banner" }}
      idAttr="data-pz-ganchors-id"
      idValue={idRef.current}
    />
  );
}
