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

  // Home: keep RevIQ sticky/rails off (CSS); home banner is RevIQ-only.
  if (home) {
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

function DesktopOnly({ children }: { children: ReactNode }) {
  if (!useMq("(min-width: 960px)")) return null;
  return <>{children}</>;
}

function MobileOnly({ children }: { children: ReactNode }) {
  if (!useMq("(max-width: 959px)")) return null;
  return <>{children}</>;
}

const closeBtnStyle: CSSProperties = {
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
  pointerEvents: "auto",
};

function useFilled(rootSel: string, enabled: boolean) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setFilled(false);
      return;
    }
    const root = document.querySelector(rootSel);
    if (!root) return;
    const check = () => {
      const slots = root.querySelectorAll("[data-ad]");
      for (const slot of Array.from(slots)) {
        const el = slot as HTMLElement;
        if (el.getAttribute("data-ad-status") === "filled") {
          setFilled(true);
          return;
        }
        const media = el.querySelector("iframe, img, video");
        if (media) {
          const r = (media as HTMLElement).getBoundingClientRect?.();
          if (r && r.height > 40 && r.width > 40) {
            setFilled(true);
            return;
          }
        }
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
    const t = window.setInterval(check, 1200);
    return () => {
      mo.disconnect();
      window.clearInterval(t);
    };
  }, [rootSel, enabled]);
  return filled;
}

/** Bottom-left + bottom-right anchor units, scoped to content pane (not chrome). */
export function StickyAnchor({ enabled = true }: { enabled?: boolean }) {
  const [closed, setClosed] = useState(false);
  const blocked = useAdFreeGate();
  const filled = useFilled("[data-pz-forced-anchor='1']", !blocked && enabled && !closed);

  useEffect(() => {
    if (blocked || !enabled) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked, enabled]);

  useEffect(() => {
    if (!enabled) {
      setClosed(false);
    }
  }, [enabled]);

  if (blocked || !enabled || closed) return null;

  return (
    <div
      data-pz-forced-anchor="1"
      data-pz-content-ad="1"
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 10,
        zIndex: 40,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 12,
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          position: "relative",
          pointerEvents: filled ? "auto" : "none",
          maxWidth: "min(336px, calc(50% - 6px))",
          borderRadius: 10,
          overflow: "visible",
          boxShadow: filled ? "0 10px 28px rgba(0,0,0,0.35)" : "none",
        }}
      >
        {filled ? (
          <button type="button" aria-label="Close ad" onClick={() => setClosed(true)} style={closeBtnStyle}>
            ×
          </button>
        ) : null}
        <Slot name="anchor" kv={{ surface: "earn", slot: "bl" }} style={{ width: "min(336px, 100%)", minHeight: 90 }} />
      </div>
      <div
        style={{
          position: "relative",
          pointerEvents: filled ? "auto" : "none",
          maxWidth: "min(336px, calc(50% - 6px))",
          borderRadius: 10,
          overflow: "visible",
          boxShadow: filled ? "0 10px 28px rgba(0,0,0,0.35)" : "none",
          marginLeft: "auto",
        }}
      >
        <Slot name="anchor" kv={{ surface: "earn", slot: "br" }} style={{ width: "min(336px, 100%)", minHeight: 90 }} />
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

/** Side rails inside the content pane only — never over sidebar / toolbars. */
export function SideRails({ enabled = true }: { enabled?: boolean }) {
  const [closed, setClosed] = useState(railsClosed);
  const blocked = useAdFreeGate();
  const filled = useFilled("[data-pz-side-rail]", !blocked && enabled && !closed);

  useEffect(() => {
    if (blocked || !enabled || closed) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked, enabled, closed]);

  if (blocked || !enabled || closed) return null;

  const railShell: CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 35,
    width: 160,
    maxHeight: "70%",
    overflow: "hidden",
    pointerEvents: filled ? "auto" : "none",
  };

  return (
    <DesktopOnly>
      <aside data-pz-side-rail="left" data-pz-content-ad="1" style={{ ...railShell, left: 8 }}>
        {filled ? (
          <button
            type="button"
            aria-label="Close ads"
            onClick={() => {
              markRailsClosed();
              setClosed(true);
            }}
            style={{ ...closeBtnStyle, width: 22, height: 22, fontSize: 12 }}
          >
            ×
          </button>
        ) : null}
        <Slot name="left-rail-2" style={{ width: "100%", minHeight: 180 }} kv={{ surface: "rail" }} />
        <div style={{ height: 10 }} />
        <Slot name="anchor" style={{ width: "100%", minHeight: 90 }} kv={{ surface: "rail", slot: "left-anchor" }} />
      </aside>
      <aside data-pz-side-rail="right" data-pz-content-ad="1" style={{ ...railShell, right: 8 }}>
        <Slot name="right-rail-2" style={{ width: "100%", minHeight: 200 }} kv={{ surface: "rail" }} />
        <div style={{ height: 10 }} />
        <Slot name="anchor" style={{ width: "100%", minHeight: 90 }} kv={{ surface: "rail", slot: "right-anchor" }} />
      </aside>
    </DesktopOnly>
  );
}

const HOME_AD_KEY = "pz-home-long-ad-closed";

/** Long, centered, dismissible homepage banner — keeps glass chrome intact. */
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
          overflow: "visible",
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
          style={{ ...closeBtnStyle, top: -10, right: -10 }}
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
            kv={{ surface: "home" }}
            style={{ width: "100%", minHeight: wide ? 90 : 50 }}
          />
        </div>
      </div>
    </div>
  );
}

function useSoftCollapse(rootSel: string, enabled: boolean, waitMs = 2800) {
  const filled = useFilled(rootSel, enabled);
  const [giveUp, setGiveUp] = useState(false);
  useEffect(() => {
    if (!enabled || filled) {
      setGiveUp(false);
      return;
    }
    const t = window.setTimeout(() => setGiveUp(true), waitMs);
    return () => window.clearTimeout(t);
  }, [enabled, filled, waitMs]);
  return { filled, collapsed: !filled && giveUp };
}

export function AdFeedStrip() {
  const blocked = useAdFreeGate();
  const idRef = useRef(`pz-feed-${Math.random().toString(36).slice(2, 9)}`);
  const { filled, collapsed } = useSoftCollapse(`[data-pz-feed-id="${idRef.current}"]`, !blocked);
  useEffect(() => {
    if (blocked) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked]);
  if (blocked) return null;
  const open = filled || !collapsed;
  return (
    <div
      data-pz-ad-slot="1"
      data-ad-slot="feed"
      data-pz-feed-id={idRef.current}
      style={{
        width: "100%",
        padding: open ? "8px 0" : 0,
        overflow: open ? "visible" : "hidden",
      }}
    >
      <DesktopOnly>
        <Slot
          name="leaderboard-1"
          style={{ width: "100%", minHeight: open ? 70 : 0 }}
          kv={{ surface: "feed" }}
        />
      </DesktopOnly>
      <MobileOnly>
        <Slot
          name="mobile-unit-1"
          style={{ width: "100%", minHeight: open ? 80 : 0 }}
          kv={{ surface: "feed" }}
        />
      </MobileOnly>
    </div>
  );
}

export function AdPageStack({ dense = false }: { dense?: boolean }) {
  const blocked = useAdFreeGate();
  useEffect(() => {
    if (blocked) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked]);
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

/** Extra in-flow anchors for the games catalog — outside the card grid. */
export function GamesAnchorStrip({
  withBanner = false,
}: {
  withBanner?: boolean;
}) {
  const blocked = useAdFreeGate();
  const wide = useMq("(min-width: 760px)");
  const idRef = useRef(`pz-ganchors-${Math.random().toString(36).slice(2, 9)}`);
  const { filled, collapsed } = useSoftCollapse(`[data-pz-ganchors-id="${idRef.current}"]`, !blocked);
  useEffect(() => {
    if (blocked) return;
    ensureScript();
    scheduleRefresh();
  }, [blocked]);
  if (blocked) return null;
  const open = filled || !collapsed;
  const slotMin = open ? 90 : 0;
  return (
    <div
      data-pz-ad-slot="1"
      data-ad-slot="games-anchors"
      data-pz-ganchors-id={idRef.current}
      style={{
        width: "100%",
        padding: open ? "10px 0 6px" : 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: open ? 10 : 0,
        overflow: open ? "visible" : "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Slot
          name="anchor"
          kv={{ surface: "games", slot: "mid-a" }}
          style={{ width: "min(336px, 100%)", minHeight: slotMin, flex: "1 1 280px" }}
        />
        <Slot
          name="anchor"
          kv={{ surface: "games", slot: "mid-b" }}
          style={{ width: "min(336px, 100%)", minHeight: slotMin, flex: "1 1 280px" }}
        />
      </div>
      {withBanner ? (
        <Slot
          name={wide ? "leaderboard-1" : "mobile-unit-1"}
          kv={{ surface: "games", slot: "banner" }}
          style={{ width: "100%", minHeight: open ? (wide ? 90 : 50) : 0 }}
        />
      ) : null}
    </div>
  );
}
