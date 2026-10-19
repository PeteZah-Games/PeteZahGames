import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { hrefs, isGHref, isGvHref } from "@/lib/uiMarks";

declare global {
  interface Window {
    reviq?: Array<(api: any) => void> | any;
    adsbygoogle?: any;
  }
}

const HOST = ["js", "rev", "iq"].join(".");
const SITE = "petezahgames.com";
const GOOGLE_GAP_MS = 3 * 60 * 1000;
const GOOGLE_KEY = "pz-g-break";

function ensureNet() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[data-pz-slot-net="1"]`)) return;
  const s = document.createElement("script");
  s.src = `//${HOST}/${SITE}`;
  s.async = true;
  s.defer = true;
  s.dataset.pzSlotNet = "1";
  document.head.appendChild(s);
  window.reviq = window.reviq || [];
}

function withApi(fn: (api: any) => void) {
  window.reviq = window.reviq || [];
  if (typeof window.reviq.push === "function") {
    window.reviq.push(fn);
  } else {
    try {
      fn(window.reviq);
    } catch {}
  }
}

function lastGoogleAt() {
  try {
    return Number(sessionStorage.getItem(GOOGLE_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function markGoogle() {
  try {
    sessionStorage.setItem(GOOGLE_KEY, String(Date.now()));
  } catch {}
}

function ensureGoogle() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[data-pz-gnet="1"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6640595376330309";
  s.crossOrigin = "anonymous";
  s.dataset.pzGnet = "1";
  document.head.appendChild(s);
  try {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.pauseAdRequests = 0;
  } catch {}
}

export function bootSlotNet() {
  ensureNet();
  withApi((api) => {
    try {
      api.setAdsEnabled?.(true);
    } catch {}
  });
}

export function isQuietSurface(url: string) {
  const u = String(url || "").toLowerCase();
  if (!u || u === "about:blank") return true;
  if (u.startsWith("petezah://newtab")) return true;
  if (u.startsWith("petezah://ai")) return true;
  if (u.startsWith("petezah://account")) return true;
  if (u.startsWith("petezah://chat")) return true;
  if (u.startsWith("petezah://settings")) return true;
  if (u.startsWith("petezah://history")) return true;
  if (u.startsWith("petezah://bookmarks")) return true;
  if (u.startsWith("petezah://extensions")) return true;
  if (u.startsWith("petezah://tools")) return true;
  if (u.startsWith("petezah://trending")) return true;
  return false;
}

export function isEarnSurface(url: string) {
  const u = String(url || "");
  if (isGHref(u) || isGvHref(u)) return true;
  if (u.startsWith("petezah://apps")) return true;
  if (u.startsWith(hrefs.mu()) || u.startsWith(hrefs.mo())) return true;
  if (u.startsWith("petezah://changelog")) return true;
  if (u.startsWith("petezah://vm")) return true;
  return false;
}

export function isHomeSurface(url: string) {
  const u = String(url || "").toLowerCase();
  return !u || u === "about:blank" || u.startsWith("petezah://newtab") || u.startsWith("petezah://trending");
}

export function syncSurfaceAds(url: string, opts?: { fromHome?: boolean }) {
  ensureNet();
  withApi((api) => {
    try {
      api.setAdsEnabled?.(true);
    } catch {}
  });

  const home = isHomeSurface(url);
  const quiet = isQuietSurface(url);
  const earn = isEarnSurface(url);
  try {
    document.documentElement.dataset.pzHomeAds = home ? "1" : "0";
  } catch {}

  const fromHome = !!opts?.fromHome;
  const gamesHit = isGHref(url) || isGvHref(url);
  const due = Date.now() - lastGoogleAt() >= GOOGLE_GAP_MS;
  if (earn && (fromHome || gamesHit) && due) {
    ensureGoogle();
    markGoogle();
  } else if (earn && document.querySelector(`script[data-pz-gnet="1"]`)) {
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.pauseAdRequests = 0;
    } catch {}
  }

  return { sticky: earn && !quiet, google: true };
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
  useEffect(() => {
    ensureNet();
  }, []);
  const extra: Record<string, string> = {};
  if (size) extra["data-ad-size"] = size;
  if (kv) {
    for (const [k, v] of Object.entries(kv)) {
      if (k && v) extra[`data-kv-${k}`] = v;
    }
  }
  return <div className={className} style={style} data-ad={name} {...extra} />;
}

const shell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  gap: 6,
  padding: "8px 0 10px",
};

function DesktopOnly({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 900px)").matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const on = () => setShow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  if (!show) return null;
  return <>{children}</>;
}

function MobileOnly({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 899px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const on = () => setShow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  if (!show) return null;
  return <>{children}</>;
}

export function StickyAnchor({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    ensureNet();
    withApi((api) => {
      try {
        api.setAdsEnabled?.(true);
      } catch {}
    });
  }, []);
  if (!enabled) return null;
  return (
    <div
      aria-hidden
      data-pz-forced-anchor="1"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ pointerEvents: "auto", maxWidth: "100%" }}>
        <Slot name="anchor" kv={{ surface: "shell" }} />
      </div>
    </div>
  );
}

export function AdResponsiveBanner({
  className = "",
  dense = false,
}: {
  className?: string;
  exo?: boolean;
  dense?: boolean;
}) {
  return (
    <div className={className} style={shell} data-pz-ad-slot="1">
      <DesktopOnly>
        <Slot name="billboard-1" style={{ width: "100%", minHeight: 90 }} kv={{ surface: "page" }} />
        {dense ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              width: "100%",
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <Slot name="left-rail-1" style={{ minWidth: 160, minHeight: 250, flex: "1 1 160px", maxWidth: 320 }} />
            <Slot name="right-rail-1" style={{ minWidth: 160, minHeight: 250, flex: "1 1 160px", maxWidth: 320 }} />
          </div>
        ) : (
          <Slot name="leaderboard-1" style={{ width: "100%", minHeight: 70, marginTop: 6 }} kv={{ surface: "page" }} />
        )}
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 100 }} kv={{ surface: "page" }} />
      </MobileOnly>
    </div>
  );
}

export function AdNativeBar() {
  return (
    <div style={{ ...shell, padding: "4px 0 8px" }} data-pz-ad-slot="1">
      <DesktopOnly>
        <Slot name="right-rail-2" style={{ width: "100%", minHeight: 200 }} kv={{ surface: "rail" }} />
      </DesktopOnly>
    </div>
  );
}

export function AdNativeBarAlt() {
  return (
    <div style={{ ...shell, padding: "2px 0 8px" }} data-pz-ad-slot="1">
      <DesktopOnly>
        <Slot name="left-rail-2" style={{ width: "100%", minHeight: 180 }} kv={{ surface: "rail" }} />
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 80 }} kv={{ surface: "rail" }} />
      </MobileOnly>
    </div>
  );
}

export function LoaderSlots() {
  useEffect(() => {
    ensureNet();
    ensureGoogle();
    withApi((api) => {
      try {
        api.setAdsEnabled?.(true);
      } catch {}
    });
  }, []);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "18px 14px 20px",
        overflow: "auto",
        pointerEvents: "auto",
        background: "radial-gradient(ellipse at 50% 0%, hsla(213,40%,18%,0.55), #070b12 55%)",
      }}
      data-pz-ad-slot="1"
      data-pz-loader-ads="1"
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 6,
          width: "min(720px, 100%)",
          marginBottom: 14,
          padding: "16px 18px",
          borderRadius: 14,
          background: "hsla(216, 32%, 8%, 0.94)",
          border: "1px solid hsla(210, 40%, 80%, 0.16)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "clamp(17px, 2.6vw, 22px)",
            fontWeight: 750,
            letterSpacing: "-0.02em",
            color: "#f4f7fb",
            lineHeight: 1.25,
          }}
        >
          Please allow a brief ad break before loading
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "hsla(210,20%,78%,0.78)" }}>
          Thanks for supporting PeteZah — your game starts right after this.
        </p>
      </div>
      <Slot name="billboard-1" style={{ width: "min(970px, 100%)", minHeight: 90 }} kv={{ surface: "loader" }} />
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
          width: "100%",
          maxWidth: 720,
          marginTop: 12,
        }}
      >
        <Slot name="left-rail-1" style={{ minWidth: 150, minHeight: 220, flex: "1 1 150px", maxWidth: 300 }} kv={{ surface: "loader" }} />
        <Slot name="right-rail-1" style={{ minWidth: 150, minHeight: 220, flex: "1 1 150px", maxWidth: 300 }} kv={{ surface: "loader" }} />
      </div>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "min(360px, 100%)", minHeight: 100, marginTop: 12 }} kv={{ surface: "loader" }} />
      </MobileOnly>
    </div>
  );
}

export function loaderAdsFilled() {
  try {
    const root = document.querySelector("[data-pz-loader-ads='1']");
    if (!root) return false;
    const frames = root.querySelectorAll("iframe, img, video, ins iframe");
    for (const el of Array.from(frames)) {
      const r = (el as HTMLElement).getBoundingClientRect?.();
      if (r && r.width > 40 && r.height > 40) return true;
    }
    const nodes = root.querySelectorAll("[data-ad]");
    for (const node of Array.from(nodes)) {
      if ((node as HTMLElement).childElementCount > 0) {
        const r = (node as HTMLElement).getBoundingClientRect?.();
        if (r && r.width > 40 && r.height > 40) return true;
      }
    }
  } catch {}
  return false;
}
