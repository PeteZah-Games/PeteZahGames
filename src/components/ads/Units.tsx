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
    reviq?: Array<(api: any) => void> | any;
    adsbygoogle?: any;
  }
}

const REV_SCRIPT = "/api/ads/net.js";
const GOOGLE_GAP_MS = 5 * 60 * 1000;
const GOOGLE_KEY = "pz-g-break";
const GOOGLE_ARMING_KEY = "pz-g-arming";
let playScrubTimer: number | null = null;
let playScrubObs: MutationObserver | null = null;
let googleArmTimer: number | null = null;

setAdFreeListener((on) => {
  if (!on) return;
  pauseGoogle(true);
  disablePartnerAds();
});

function ensureNet() {
  if (typeof document === "undefined") return;
  // Script is loaded once from index.html (same-origin proxy) — never inject a second copy.
  window.reviq = window.reviq || [];
  const existing =
    document.querySelector(`script[data-pz-slot-net="1"]`) ||
    document.querySelector(`script[src="${REV_SCRIPT}"]`) ||
    document.querySelector(`script[src*="rev-iq"]`);
  if (existing) {
    existing.setAttribute("data-pz-slot-net", "1");
    return;
  }
  const s = document.createElement("script");
  s.src = REV_SCRIPT;
  s.async = true;
  s.defer = true;
  s.dataset.pzSlotNet = "1";
  document.head.appendChild(s);
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

function markGoogle(opts?: { hideUi?: boolean }) {
  try {
    localStorage.setItem(GOOGLE_KEY, String(Date.now()));
  } catch {}
<<<<<<< HEAD
  // hideUi=false while the one allowed interstitial is on screen (CSS would kill it otherwise).
=======
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  if (opts?.hideUi !== false) {
    try {
      document.documentElement.dataset.pzGCool = "1";
      delete document.documentElement.dataset.pzGShowing;
    } catch {}
  }
}

function googleDue() {
  try {
    if (sessionStorage.getItem(GOOGLE_ARMING_KEY) === "1") return false;
  } catch {}
  return Date.now() - lastGoogleAt() >= GOOGLE_GAP_MS;
}

function syncCoolAttr() {
  try {
    document.documentElement.dataset.pzGCool = googleDue() ? "0" : "1";
  } catch {}
}

/** Closing bottom Google banner / sticky often arms vignette — consume the shared break. */
function onOverlayDismissed() {
  markGoogle();
  pauseGoogle(true);
  hideGoogleInterstitials();
}

function hideGoogleInterstitials() {
  try {
    for (const el of Array.from(
      document.querySelectorAll("body > #goog_rewarded, body > #google_vignette")
    )) {
      hideGoogleShell(el);
    }
  } catch {}
}

let bannerWatch: MutationObserver | null = null;
let lastBannerSig = "";

function bannerSignature() {
  try {
    const nodes = document.querySelectorAll(
      "body > ins.adsbygoogle, body > .google-auto-placed, body > iframe[id^='google_ads_iframe'], body > div[id^='aswift_'], body > #google_vignette, body > #goog_rewarded"
    );
    return Array.from(nodes)
      .map((el) => `${el.tagName}:${(el as HTMLElement).id || (el as HTMLElement).className || ""}`)
      .join("|");
  } catch {
    return "";
  }
}

function isGoogleArming() {
  try {
    return sessionStorage.getItem(GOOGLE_ARMING_KEY) === "1";
  } catch {
    return false;
  }
}

function watchGoogleBreakCascade() {
  if (bannerWatch || typeof MutationObserver === "undefined") return;
  lastBannerSig = bannerSignature();
  bannerWatch = new MutationObserver(() => {
    try {
      const rewarded = document.querySelector("body > #goog_rewarded");
      const vignette = document.querySelector("body > #google_vignette");
      const hit = rewarded || vignette;
      if (hit) {
        const cool = document.documentElement.dataset.pzGCool === "1";
        // Shared break: allow one interstitial only while arming / not yet cooled.
        if (cool && !isGoogleArming() && document.documentElement.dataset.pzGShowing !== "1") {
          hideGoogleInterstitials();
          pauseGoogle(true);
        } else {
          // Count this as the one combined break; keep it visible, drop the other type.
          try {
            document.documentElement.dataset.pzGShowing = "1";
          } catch {}
          markGoogle({ hideUi: false });
          pauseGoogle(true);
          if (rewarded && vignette) {
            hideGoogleShell(vignette === hit ? rewarded : vignette);
          }
          try {
            sessionStorage.removeItem(GOOGLE_ARMING_KEY);
          } catch {}
          // After it's gone (or shortly), enforce cool UI so nothing else stacks.
          window.setTimeout(() => {
            try {
              if (!document.querySelector("body > #goog_rewarded, body > #google_vignette")) {
                document.documentElement.dataset.pzGCool = "1";
                delete document.documentElement.dataset.pzGShowing;
              }
            } catch {}
          }, 2500);
        }
        lastBannerSig = bannerSignature();
        return;
      }
      const next = bannerSignature();
      if (lastBannerSig && next.length < lastBannerSig.length) {
        // A bottom unit was closed — do not let vignette/reward follow.
        onOverlayDismissed();
      }
      lastBannerSig = next;
    } catch {}
  });
  bannerWatch.observe(document.body, { childList: true, subtree: false });
}

function ensureGoogle() {
  if (typeof document === "undefined") return;
  if (isAdFreeClient()) return;
  if (!document.querySelector(`script[data-pz-gnet="1"]`)) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6640595376330309";
    s.crossOrigin = "anonymous";
    s.dataset.pzGnet = "1";
    document.head.appendChild(s);
  }
}

<<<<<<< HEAD
/** Allow Google (reward OR vignette, not both) briefly; shared 5‑min cooldown after. */
=======
/** Combined rewarded+vignette: at most one Google break / 5 min / person. */
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
function armGoogleBreak() {
  if (isAdFreeClient()) return false;
  if (!googleDue()) return false;
  try {
    sessionStorage.setItem(GOOGLE_ARMING_KEY, "1");
  } catch {}
  ensureGoogle();
<<<<<<< HEAD
  // Don't mark yet — mark when one actually shows (or when the arm window ends).
=======
  markGoogle({ hideUi: false });
  try {
    document.documentElement.dataset.pzGShowing = "1";
  } catch {}
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  pauseGoogle(false);
  if (googleArmTimer) window.clearTimeout(googleArmTimer);
  googleArmTimer = window.setTimeout(() => {
    pauseGoogle(true);
    markGoogle();
    try {
      sessionStorage.removeItem(GOOGLE_ARMING_KEY);
      delete document.documentElement.dataset.pzGShowing;
    } catch {}
    googleArmTimer = null;
  }, 18_000);
  return true;
}

/** Closing a partner banner must not free a Google vignette/reward. */
function sealAfterDismiss() {
  pauseGoogle(true);
  markGoogle();
  if (googleArmTimer) {
    window.clearTimeout(googleArmTimer);
    googleArmTimer = null;
  }
  try {
    sessionStorage.removeItem(GOOGLE_ARMING_KEY);
    delete document.documentElement.dataset.pzGShowing;
  } catch {}
  scrubPlayOverlays();
}

function hideGoogleShell(el: Element) {
  const h = el as HTMLElement;
  h.style.setProperty("display", "none", "important");
  h.style.setProperty("visibility", "hidden", "important");
  h.style.setProperty("pointer-events", "none", "important");
  h.setAttribute("data-pz-scrubbed", "1");
}

function clearScrubbed() {
  try {
    for (const el of Array.from(document.querySelectorAll("[data-pz-scrubbed='1']"))) {
      const h = el as HTMLElement;
      h.style.removeProperty("display");
      h.style.removeProperty("visibility");
      h.style.removeProperty("pointer-events");
      h.removeAttribute("data-pz-scrubbed");
    }
  } catch {}
}

/** Gameviewer: kill Google + partner overlays (keep only our sticky if present). */
function scrubPlayOverlays() {
  try {
    pauseGoogle(true);
    const nodes = document.querySelectorAll(
      "body > #goog_rewarded, body > #google_vignette, body > .google-auto-placed, body > ins.adsbygoogle, body > iframe, body > div"
    );
    for (const el of Array.from(nodes)) {
      const h = el as HTMLElement;
      if (h.id === "root") continue;
      if (h.dataset?.pzForcedAnchor === "1") continue;
      if (h.dataset?.pzAdSlot === "1") continue;
      if (h.dataset?.pzKeep === "1") continue;
      const tag = h.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "META" || tag === "NOSCRIPT") continue;
      const src = String((el as HTMLIFrameElement).src || "");
      const id = String(h.id || "");
      const cls = String(h.className || "");
      const google =
        /google|doubleclick|googlesyndication|pagead|adservice|aswift_|rewarded|vignette/i.test(
          src + " " + id + " " + cls
        );
      let partnerCover = false;
      try {
        const st = window.getComputedStyle(h);
        const z = Number.parseInt(st.zIndex || "0", 10) || 0;
        const fixed = st.position === "fixed";
        partnerCover =
          fixed &&
          z >= 40 &&
          (h.offsetHeight >= 80 || (h.offsetWidth >= window.innerWidth * 0.5 && h.offsetHeight >= 40));
      } catch {}
      if (google || partnerCover) hideGoogleShell(el);
    }
  } catch {}
}

function startPlayScrub() {
  scrubPlayOverlays();
  if (playScrubTimer == null) {
    playScrubTimer = window.setInterval(scrubPlayOverlays, 1200);
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
  if (isAdFreeClient()) {
    disablePartnerAds();
    return;
  }
  withApi((api) => {
    try {
      api.setAdsEnabled?.(true);
    } catch {}
  });
}

function disablePartnerAds() {
  withApi((api) => {
    try {
      api.setAdsEnabled?.(false);
    } catch {}
  });
}

export function bootSlotNet() {
  void refreshAdFreeStatus().then((on) => {
<<<<<<< HEAD
    if (on) return;
    ensureNet();
    ensureGoogle();
    enablePartnerAds();
  });
  syncCoolAttr();
  watchGoogleBreakCascade();
  // Start paused until syncSurfaceAds decides; avoids homepage flood on boot.
=======
    if (on) {
      pauseGoogle(true);
      disablePartnerAds();
      return;
    }
    ensureNet();
  });
  // Never load googlesyndication on boot — only when arming a due earn break.
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  pauseGoogle(true);
}

export function isQuietSurface(url: string) {
  const u = String(url || "").toLowerCase();
  if (!u || u === "about:blank") return true;
  if (u.startsWith("petezah://newtab")) return true;
  if (u.startsWith("petezah://account")) return true;
  if (u.startsWith("petezah://settings")) return true;
  if (u.startsWith("petezah://history")) return true;
  if (u.startsWith("petezah://bookmarks")) return true;
  if (u.startsWith("petezah://extensions")) return true;
  if (u.startsWith("petezah://tools")) return true;
  if (u.startsWith("petezah://trending")) return true;
<<<<<<< HEAD
  // Games catalog, AI, chat are earn surfaces (not quiet). Gameviewer/proxy handled separately.
  return false;
}

export function isEarnSurface(url: string) {
  const u = String(url || "");
  if (isGHref(u) || isGvHref(u)) return true;
  if (u.startsWith("petezah://apps")) return true;
  if (u.startsWith(hrefs.mu()) || u.startsWith(hrefs.mo())) return true;
  if (u.startsWith("petezah://changelog")) return true;
  if (u.startsWith("petezah://vm")) return true;
=======
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  return false;
}

export function isPlaySurface(url: string, framed = false) {
  return isImmersiveSurface(String(url || ""), !!framed);
}

/** Viewer / proxied browsing — zero ads (Lightspeed-safe: no third-party ad nets). */
export function isImmersiveSurface(url: string, framed = false) {
  const u = String(url || "");
  if (isGvHref(u)) return true;
  if (framed) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

/** Gameviewer OR active proxy — zero overlay ads. */
export function isImmersiveSurface(url: string, framed = false) {
  const u = String(url || "");
  if (isGvHref(u)) return true;
  if (framed) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

export function isHomeSurface(url: string) {
  const u = String(url || "").toLowerCase();
  return !u || u === "about:blank" || u.startsWith("petezah://newtab") || u.startsWith("petezah://trending");
}

/** Catalog / media shelves — denser non-intrusive inventory. */
export function isSoftEarn(url: string) {
  const u = String(url || "");
<<<<<<< HEAD
  if (isGHref(u)) return true;
  if (u.startsWith("petezah://apps")) return true;
  if (u.startsWith(hrefs.mu()) || u.startsWith(hrefs.mo())) return true;
  if (u.startsWith("petezah://changelog")) return true;
=======
  if (isGHref(u) && !isGvHref(u)) return true;
  if (u.startsWith("petezah://apps")) return true;
  if (u.startsWith(hrefs.mu()) || u.startsWith(hrefs.mo())) return true;
  if (u.startsWith("petezah://changelog")) return true;
  if (u.startsWith("petezah://vm")) return true;
  if (u.startsWith("petezah://ai")) return true;
  if (u.startsWith("petezah://chat")) return true;
  return false;
}

/** Closable bottom sticky on earn catalogs (never viewer/proxy/home). */
export function isStickySurface(url: string, framed = false) {
  if (isImmersiveSurface(url, framed) || isHomeSurface(url)) return false;
  return isSoftEarn(url);
}

/** Desktop side rails: AI, chat, and VM only. */
export function isRailSurface(url: string) {
  const u = String(url || "").toLowerCase();
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  if (u.startsWith("petezah://ai")) return true;
  if (u.startsWith("petezah://chat")) return true;
  if (u.startsWith("petezah://vm")) return true;
  return false;
}

/** Closable desktop corner rails on high-traffic earn pages. */
export function isRailSurface(url: string) {
  const u = String(url || "").toLowerCase();
  if (isGHref(u)) return true;
  if (u.startsWith("petezah://apps")) return true;
  if (u.startsWith(hrefs.mu()) || u.startsWith(hrefs.mo())) return true;
  if (u.startsWith("petezah://ai")) return true;
  if (u.startsWith("petezah://chat")) return true;
  if (u.startsWith("petezah://vm")) return true;
  if (u.startsWith("petezah://changelog")) return true;
  return false;
}

export function syncSurfaceAds(url: string, opts?: { fromHome?: boolean; framed?: boolean }) {
  void refreshAdFreeStatus();
  if (isAdFreeClient()) {
    pauseGoogle(true);
    disablePartnerAds();
    stopPlayScrub();
    try {
      document.documentElement.dataset.pzHomeAds = "1";
      document.documentElement.dataset.pzPlayAds = "0";
    } catch {}
    return { sticky: false, google: false };
  }
<<<<<<< HEAD
  ensureNet();
  ensureGoogle();
  syncCoolAttr();
  watchGoogleBreakCascade();
=======

>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  const home = isHomeSurface(url);
  const quiet = isQuietSurface(url);
  const immersive = isImmersiveSurface(url, !!opts?.framed);
  try {
<<<<<<< HEAD
    document.documentElement.dataset.pzHomeAds = home || isGHref(url) ? "1" : "0";
    // Quiet overlay mode for gameviewer AND proxy.
=======
    document.documentElement.dataset.pzHomeAds = home ? "1" : "0";
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
    document.documentElement.dataset.pzPlayAds = immersive ? "1" : "0";
  } catch {}

  if (immersive) {
<<<<<<< HEAD
    // Gameviewer + proxy: zero ads.
    startPlayScrub();
    pauseGoogle(true);
    disablePartnerAds();
=======
    // Viewer + proxy gameplay: never load googlesyndication; no sticky/rails.
    // Same-origin loader slots may still fill during the pre-entry break only.
    startPlayScrub();
    pauseGoogle(true);
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
    return { sticky: false, google: false };
  }

  stopPlayScrub();
<<<<<<< HEAD
=======
  ensureNet();
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  enablePartnerAds();

  if (quiet || home) {
    pauseGoogle(true);
    return { sticky: false, google: false };
  }

  const earn = isSoftEarn(url);
<<<<<<< HEAD
  // Soft earn: closable sticky + page units; Google interstitial at most once / 5 min combined.
=======
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  if (earn && googleDue()) {
    armGoogleBreak();
    return { sticky: true, google: true };
  }

  pauseGoogle(true);
<<<<<<< HEAD
  hideGoogleInterstitials();
=======
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  return { sticky: earn, google: false };
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
    ensureNet();
    enablePartnerAds();
  }, [blocked]);
  if (blocked) return null;
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
  const blocked = useAdFreeGate();

  useEffect(() => {
<<<<<<< HEAD
    if (blocked) return;
    ensureNet();
    enablePartnerAds();
  }, [blocked]);
=======
    if (blocked || !enabled) return;
    ensureNet();
    enablePartnerAds();
  }, [blocked, enabled]);
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))

  useEffect(() => {
    if (!enabled) setClosed(false);
  }, [enabled]);

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
          onClick={() => {
            setClosed(true);
<<<<<<< HEAD
            // Closing bottom/sticky must not cascade into Google vignette/reward.
            onOverlayDismissed();
=======
            sealAfterDismiss();
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
          }}
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
        <Slot name="anchor" kv={{ surface: "earn" }} />
      </div>
    </div>
  );
}

const RAILS_CLOSED_KEY = "pz-rails-closed";

function railClosed(): boolean {
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

function RailUnit({
  side,
  name,
  onClose,
}: {
  side: "left" | "right";
  name: string;
  onClose: () => void;
}) {
  return (
    <div
      data-pz-ad-slot="1"
      data-pz-side-rail={side}
      style={{
        position: "fixed",
        bottom: 56,
        [side]: 12,
        zIndex: 42,
        width: 300,
        maxWidth: "min(300px, calc(50vw - 24px))",
        minHeight: 250,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 10,
          overflow: "visible",
          background: "hsla(216, 28%, 8%, 0.72)",
          border: "1px solid hsla(210, 30%, 80%, 0.12)",
          boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        }}
      >
        <button
          type="button"
          aria-label="Close ad"
          onClick={onClose}
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
        <Slot
          name={name}
          size="300x250"
          style={{ width: "100%", minHeight: 250 }}
          kv={{ surface: "rail", page: "utility" }}
        />
      </div>
    </div>
  );
}

/** Closable desktop rails — AI / chat / VM only. */
export function SideRails({ enabled = true }: { enabled?: boolean }) {
  const blocked = useAdFreeGate();
  const [closed, setClosed] = useState(() => railClosed());

  useEffect(() => {
    if (blocked || !enabled) return;
    ensureNet();
    enablePartnerAds();
  }, [blocked, enabled]);

  useEffect(() => {
    if (!enabled) setClosed(railClosed());
  }, [enabled]);

  if (blocked || !enabled || closed) return null;

  const close = () => {
    markRailsClosed();
    setClosed(true);
<<<<<<< HEAD
    onOverlayDismissed();
=======
    sealAfterDismiss();
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
  };

  return (
    <DesktopOnly>
      <RailUnit side="left" name="left-rail-1" onClose={close} />
      <RailUnit side="right" name="right-rail-1" onClose={close} />
    </DesktopOnly>
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
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div className={className} style={shell} data-pz-ad-slot="1">
      <DesktopOnly>
        <Slot name="billboard-1" style={{ width: "100%", minHeight: 90 }} kv={{ surface: "page" }} />
        <Slot
          name="leaderboard-1"
          style={{ width: "100%", minHeight: 70, marginTop: dense ? 8 : 6 }}
          kv={{ surface: "page" }}
        />
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 100 }} kv={{ surface: "page" }} />
      </MobileOnly>
    </div>
  );
}

export function AdNativeBar() {
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div style={{ ...shell, padding: "4px 0 8px" }} data-pz-ad-slot="1">
      <DesktopOnly>
        <Slot name="right-rail-2" style={{ width: "100%", minHeight: 200 }} kv={{ surface: "rail" }} />
      </DesktopOnly>
    </div>
  );
}

export function AdNativeBarAlt() {
  const blocked = useAdFreeGate();
  if (blocked) return null;
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

/** Mid-feed strip between catalog rows — scrolls with content. */
export function AdFeedStrip() {
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div
      data-pz-ad-slot="1"
      data-ad-slot="feed"
      style={{
        width: "100%",
        margin: "4px 0 8px",
        padding: "8px 6px",
        borderRadius: 12,
        background: "hsla(216, 28%, 8%, 0.4)",
        border: "1px solid hsla(210, 30%, 80%, 0.08)",
      }}
    >
      <DesktopOnly>
        <Slot name="leaderboard-1" style={{ width: "100%", minHeight: 70 }} kv={{ surface: "feed" }} />
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 80 }} kv={{ surface: "feed" }} />
      </MobileOnly>
    </div>
  );
}

/** End-of-page stack for catalogs. */
export function AdPageStack({ dense = false }: { dense?: boolean }) {
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div data-pz-ad-slot="1" data-ad-slot="page-stack" style={{ width: "100%", padding: "10px 0 6px" }}>
      <AdResponsiveBanner dense={dense} />
      <AdNativeBar />
      <AdNativeBarAlt />
    </div>
  );
}

export function LoaderSlots() {
  const blocked = useAdFreeGate();
  useEffect(() => {
    if (blocked) return;
    ensureNet();
    enablePartnerAds();
    pauseGoogle(true);
  }, [blocked]);
  if (blocked) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
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
          Please allow a brief break before loading
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "hsla(210,20%,78%,0.78)" }}>
          Thanks for supporting PeteZah — continuing shortly.
        </p>
      </div>
      <Slot name="billboard-1" style={{ width: "min(970px, 100%)", minHeight: 90 }} kv={{ surface: "loader" }} />
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
