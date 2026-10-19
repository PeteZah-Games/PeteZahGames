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
const GOOGLE_GAP_MS = 5 * 60 * 1000;
const GOOGLE_KEY = "pz-g-break";
const GOOGLE_ARMING_KEY = "pz-g-arming";
let playScrubTimer: number | null = null;
let playScrubObs: MutationObserver | null = null;
let googleArmTimer: number | null = null;

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

function pauseGoogle(on: boolean) {
  try {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.pauseAdRequests = on ? 1 : 0;
  } catch {}
}

function lastGoogleAt() {
  try {
    return Number(localStorage.getItem(GOOGLE_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function markGoogle() {
  try {
    localStorage.setItem(GOOGLE_KEY, String(Date.now()));
  } catch {}
}

function googleDue() {
  try {
    if (sessionStorage.getItem(GOOGLE_ARMING_KEY) === "1") return false;
  } catch {}
  return Date.now() - lastGoogleAt() >= GOOGLE_GAP_MS;
}

function loadGooglePaused() {
  if (typeof document === "undefined") return;
  if (!document.querySelector(`script[data-pz-gnet="1"]`)) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6640595376330309";
    s.crossOrigin = "anonymous";
    s.dataset.pzGnet = "1";
    document.head.appendChild(s);
  }
  pauseGoogle(true);
}

function armGoogleBreak() {
  if (!googleDue()) {
    pauseGoogle(true);
    return false;
  }
  try {
    sessionStorage.setItem(GOOGLE_ARMING_KEY, "1");
  } catch {}
  loadGooglePaused();
  markGoogle();
  pauseGoogle(false);
  if (googleArmTimer) window.clearTimeout(googleArmTimer);
  googleArmTimer = window.setTimeout(() => {
    pauseGoogle(true);
    try {
      sessionStorage.removeItem(GOOGLE_ARMING_KEY);
    } catch {}
    googleArmTimer = null;
  }, 6000);
  return true;
}

function isGoogleOverlay(el: Element) {
  if ((el as HTMLElement).closest?.("[data-pz-forced-anchor='1']")) return false;
  if ((el as HTMLElement).closest?.("#root")) return false;
  const tag = el.tagName;
  if (tag === "IFRAME") {
    const src = String((el as HTMLIFrameElement).src || "");
    return /google|doubleclick|googlesyndication|pagead|adservice|adnxs|safeframe/i.test(src);
  }
  const id = String((el as HTMLElement).id || "");
  const cls = String((el as HTMLElement).className || "");
  return /google_ads|GoogleActiveView|adsbygoogle|vignette|rewarded/i.test(id + " " + cls);
}

function hideOverlay(el: Element) {
  const h = el as HTMLElement;
  h.style.setProperty("display", "none", "important");
  h.style.setProperty("visibility", "hidden", "important");
  h.style.setProperty("pointer-events", "none", "important");
  h.style.setProperty("opacity", "0", "important");
  h.setAttribute("data-pz-scrubbed", "1");
}

function clearScrubbed() {
  try {
    for (const el of Array.from(document.querySelectorAll("[data-pz-scrubbed='1']"))) {
      const h = el as HTMLElement;
      h.style.removeProperty("display");
      h.style.removeProperty("visibility");
      h.style.removeProperty("pointer-events");
      h.style.removeProperty("opacity");
      h.style.removeProperty("max-height");
      h.style.removeProperty("max-width");
      h.removeAttribute("data-pz-scrubbed");
    }
  } catch {}
}

function scrubPlayOverlays() {
  try {
    pauseGoogle(true);
    // Only Google reward/vignette shells as direct body children.
    // Never touch [data-ad] fills inside #root.
    const nodes = document.querySelectorAll(
      "body > iframe, body > ins.adsbygoogle, body > #google_vignette, body > .google-auto-placed, body > div[id*='google'], body > div[class*='GoogleActiveView'], body > div[id^='aswift_']"
    );
    for (const el of Array.from(nodes)) {
      const h = el as HTMLElement;
      if (h.dataset?.pzForcedAnchor === "1") continue;
      if (h.dataset?.pzAdSlot === "1") continue;
      const src = String((el as HTMLIFrameElement).src || "");
      const id = String(h.id || "");
      const cls = String(h.className || "");
      const google =
        /google|doubleclick|googlesyndication|pagead|adservice|aswift_/i.test(src) ||
        /google_ads|GoogleActiveView|adsbygoogle|vignette|rewarded|google_vignette|google-auto-placed|aswift_/i.test(
          id + " " + cls
        );
      if (!google) continue;
      hideOverlay(el);
    }
  } catch {}
}

function startPlayScrub() {
  scrubPlayOverlays();
  if (playScrubTimer == null) {
    playScrubTimer = window.setInterval(scrubPlayOverlays, 900);
  }
  if (!playScrubObs && typeof MutationObserver !== "undefined") {
    playScrubObs = new MutationObserver(() => scrubPlayOverlays());
    playScrubObs.observe(document.body, { childList: true, subtree: false });
  }
}

function stopPlayScrub() {
  if (playScrubTimer != null) {
    window.clearInterval(playScrubTimer);
    playScrubTimer = null;
  }
  if (playScrubObs) {
    playScrubObs.disconnect();
    playScrubObs = null;
  }
  clearScrubbed();
}

function enablePartnerAds() {
  withApi((api) => {
    try {
      api.setAdsEnabled?.(true);
    } catch {}
  });
}

export function bootSlotNet() {
  ensureNet();
  loadGooglePaused();
  enablePartnerAds();
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
  if (isGHref(String(url || ""))) return true;
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

export function isPlaySurface(url: string, framed = false) {
  return isGvHref(String(url || "")) || !!framed;
}

export function isHomeSurface(url: string) {
  const u = String(url || "").toLowerCase();
  return !u || u === "about:blank" || u.startsWith("petezah://newtab") || u.startsWith("petezah://trending");
}

function isSoftEarn(url: string) {
  const u = String(url || "");
  if (u.startsWith("petezah://apps")) return true;
  if (u.startsWith(hrefs.mu()) || u.startsWith(hrefs.mo())) return true;
  if (u.startsWith("petezah://changelog")) return true;
  return false;
}

export function syncSurfaceAds(url: string, opts?: { fromHome?: boolean; framed?: boolean }) {
  ensureNet();
  enablePartnerAds();
  const home = isHomeSurface(url);
  const quiet = isQuietSurface(url);
  const play = isPlaySurface(url, !!opts?.framed);
  // Hard lock only on gameviewer — proxy frames still get sticky, but keep page units alive.
  const hardPlay = isGvHref(String(url || ""));
  try {
    document.documentElement.dataset.pzHomeAds = home || isGHref(url) ? "1" : "0";
    document.documentElement.dataset.pzPlayAds = hardPlay ? "1" : "0";
  } catch {}

  if (hardPlay) {
    startPlayScrub();
    pauseGoogle(true);
    loadGooglePaused();
    return { sticky: true, google: false };
  }

  stopPlayScrub();

  if (play) {
    // Proxied tab: closable sticky OK, do not nuke partner/Google inventory for other surfaces.
    pauseGoogle(true);
    return { sticky: true, google: false };
  }

  // Keep partner display slots filling on apps / movies / music / changelog / loader.
  if (!quiet && isSoftEarn(url) && googleDue()) {
    armGoogleBreak();
    return { sticky: false, google: true };
  }

  pauseGoogle(true);
  return { sticky: false, google: false };
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
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    ensureNet();
    enablePartnerAds();
  }, []);

  useEffect(() => {
    if (!enabled) setClosed(false);
  }, [enabled]);

  if (!enabled || closed) return null;

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
          pointerEvents: "auto",
          maxWidth: "100%",
          borderRadius: 10,
          overflow: "visible",
          boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        }}
      >
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
            boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
          }}
        >
          ×
        </button>
        <Slot name="anchor" kv={{ surface: "play" }} />
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
    enablePartnerAds();
    pauseGoogle(true);
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
