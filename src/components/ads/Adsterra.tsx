import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ExoClickBanner } from "@/components/ads/ExoClick";
import { isAdFreeClient, useAdFreeGate } from "@/lib/adFree";

const KEY_728 = "5aed292251276d82b269fc3b8ecc354d";
const KEY_320 = "fee48967b89db2d0bd32a6c670ffa744";
const NATIVE_ID = "1f9ef1ea03eb9743ae2feb0b3f839a92";
const NATIVE_SRC = `https://pl25832426.effectivecpmnetwork.com/${NATIVE_ID}/invoke.js`;
const NATIVE2_ID = "49296616653e0fc0c3a7aa4792bb1d80";
const NATIVE2_SRC = `https://pl31174667.profitableratecpmnetwork.com/${NATIVE2_ID}/invoke.js`;
const LOADING_SRC =
  "https://pl27983175.effectivecpmnetwork.com/c1/07/27/c10727dadb32856a5f427df5cc7f44ab.js";
const MONETAG_SRC = "https://quge5.com/88/tag.min.js";
const MONETAG_ZONE = "268321";
const INVOKE_HOST = "https://www.highperformanceformat.com";

export function adSrcDoc(key: string, width: number, height: number) {
  const opts = JSON.stringify({
    key,
    format: "iframe",
    height,
    width,
    params: {},
  });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;width:100%;height:100%;}iframe{border:0;display:block;margin:0 auto;max-width:100%;}</style></head><body><script>window.atOptions=${opts};<\/script><script src="${INVOKE_HOST}/${key}/invoke.js"><\/script></body></html>`;
}

function AdFrame({
  adKey,
  width,
  height,
}: {
  adKey: string;
  width: number;
  height: number;
}) {
  const srcDoc = useMemo(() => adSrcDoc(adKey, width, height), [adKey, width, height]);
  return (
    <iframe
      title="Advertisement"
      srcDoc={srcDoc}
      width={width}
      height={height}
      scrolling="no"
      frameBorder={0}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="attribution-reporting"
      style={{
        border: 0,
        overflow: "hidden",
        display: "block",
        margin: "0 auto",
        maxWidth: "100%",
        width,
        height,
        background: "transparent",
        flexShrink: 0,
      }}
    />
  );
}

function AdLabel() {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "hsla(0,0%,100%,0.35)",
      }}
    >
      Ad
    </span>
  );
}

const slotShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  gap: 4,
  padding: "10px 0 12px",
  minHeight: 64,
};

export function AdBanner728({ className = "" }: { className?: string }) {
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div className={className} style={{ ...slotShell, minHeight: 110 }} data-ad-slot="728">
      <AdLabel />
      <AdFrame adKey={KEY_728} width={728} height={90} />
    </div>
  );
}

export function AdBanner320({ className = "" }: { className?: string }) {
  const blocked = useAdFreeGate();
  if (blocked) return null;
  return (
    <div className={className} style={{ ...slotShell, minHeight: 70 }} data-ad-slot="320">
      <AdLabel />
      <AdFrame adKey={KEY_320} width={320} height={50} />
    </div>
  );
}

export function AdResponsiveBanner({
  className = "",
  exo = true,
}: {
  className?: string;
  /** When false, only Adsterra banners are shown (no ExoClick). */
  exo?: boolean;
}) {
  const blocked = useAdFreeGate();
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  if (blocked) return null;
  return (
    <div className={className} style={{ width: "100%" }}>
      {mobile ? <AdBanner320 /> : <AdBanner728 />}
      {exo ? <ExoClickBanner /> : null}
    </div>
  );
}

export function AdNativeBar() {
  const blocked = useAdFreeGate();
  const id = useId().replace(/:/g, "");
  const containerId = `container-${NATIVE_ID}`;
  const mounted = useRef(false);
  useEffect(() => {
    if (blocked) return;
    if (mounted.current) return;
    mounted.current = true;
    if (document.querySelector(`script[data-pz-native="${NATIVE_ID}"]`)) return;
    const script = document.createElement("script");
    script.async = true;
    script.dataset.cfasync = "false";
    script.dataset.pzNative = NATIVE_ID;
    script.src = NATIVE_SRC;
    document.body.appendChild(script);
  }, [blocked]);
  if (blocked) return null;
  return (
    <div style={{ width: "100%", padding: "4px 0 12px" }} data-ad-slot={id}>
      <AdLabel />
      <div
        id={containerId}
        style={{
          width: "100%",
          minHeight: 48,
          maxHeight: 120,
          overflow: "hidden",
          marginTop: 4,
        }}
      />
    </div>
  );
}

/** Compact native unit for content pages (games/apps/media) — not homepage. */
export function AdNativeBarAlt() {
  const blocked = useAdFreeGate();
  const id = useId().replace(/:/g, "");
  const containerId = `container-${NATIVE2_ID}`;
  const mounted = useRef(false);
  useEffect(() => {
    if (blocked) return;
    if (mounted.current) return;
    mounted.current = true;
    if (document.querySelector(`script[data-pz-native="${NATIVE2_ID}"]`)) return;
    const script = document.createElement("script");
    script.async = true;
    script.dataset.cfasync = "false";
    script.dataset.pzNative = NATIVE2_ID;
    script.src = NATIVE2_SRC;
    document.body.appendChild(script);
  }, [blocked]);
  if (blocked) return null;
  return (
    <div style={{ width: "100%", padding: "2px 0 10px" }} data-ad-slot={id}>
      <AdLabel />
      <div
        id={containerId}
        style={{
          width: "100%",
          minHeight: 40,
          maxHeight: 100,
          overflow: "hidden",
          marginTop: 4,
        }}
      />
    </div>
  );
}

const LOADING_HOST_ID = "pz-adsterra-loading-host";
const MONETAG_HOST_ID = "pz-monetag-loading-host";
const AD_BLEED_SRC_RE =
  /effectivecpmnetwork\.com|profitableratecpmnetwork\.com|highperformanceformat\.com|profitablegatecpm\.com|adsterra\.com|senty\.com\.au|quge5\.com|monetag/i;

function scrubHost(id: string) {
  try {
    document.getElementById(id)?.remove();
  } catch {}
}

/** Remove leftover Social Bar / notification / Monetag widgets from the top document. */
export function scrubAdsterraLoadingArtifacts() {
  scrubHost(LOADING_HOST_ID);
  scrubHost(MONETAG_HOST_ID);

  try {
    document
      .querySelectorAll('script[data-pz-loading-ad="1"], script[data-pz-monetag="1"]')
      .forEach((el) => {
        try {
          el.remove();
        } catch {}
      });
  } catch {}

  try {
    for (const el of Array.from(document.body.children)) {
      if (el.id === "root" || el.id === "app" || el.id === "pz-video-ad-root") continue;
      if (el.id === LOADING_HOST_ID || el.id === MONETAG_HOST_ID) {
        try {
          el.remove();
        } catch {}
        continue;
      }
      const tag = el.tagName;
      if (tag === "SCRIPT") {
        const src = (el as HTMLScriptElement).src || "";
        if (AD_BLEED_SRC_RE.test(src) && !src.includes(NATIVE_ID) && !src.includes(NATIVE2_ID)) {
          try {
            el.remove();
          } catch {}
        }
        continue;
      }
      if (tag !== "IFRAME" && tag !== "DIV" && tag !== "INS" && tag !== "SECTION") continue;
      const html = (el as HTMLElement).outerHTML?.slice(0, 2500) || "";
      const src = tag === "IFRAME" ? (el as HTMLIFrameElement).src || "" : "";
      if (!AD_BLEED_SRC_RE.test(html) && !AD_BLEED_SRC_RE.test(src)) continue;
      if ((el as HTMLElement).closest?.("[data-ad-slot]")) continue;
      try {
        const style = window.getComputedStyle(el);
        const fixed =
          style.position === "fixed" ||
          style.position === "sticky" ||
          el.parentElement === document.body;
        if (fixed) el.remove();
      } catch {
        try {
          el.remove();
        } catch {}
      }
    }
  } catch {}
}

function mountSandboxedAdScript(opts: {
  hostId: string;
  scriptSrc: string;
  scriptAttrs?: Record<string, string>;
  zIndex: number;
}): { host: HTMLDivElement; frame: HTMLIFrameElement; preserved: Set<Element> } {
  const preserved = new Set<Element>(Array.from(document.body.children));
  scrubHost(opts.hostId);

  const host = document.createElement("div");
  host.id = opts.hostId;
  host.style.cssText = `position:fixed;inset:0;z-index:${opts.zIndex};pointer-events:none;overflow:hidden;background:transparent;`;

  const attrs = Object.entries(opts.scriptAttrs || {})
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");

  const frame = document.createElement("iframe");
  frame.title = "Advertisement";
  frame.setAttribute(
    "sandbox",
    "allow-scripts allow-popups allow-popups-to-escape-sandbox"
  );
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  frame.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:auto;background:transparent;";
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}</style></head><body><script src="${opts.scriptSrc}" ${attrs}><\/script></body></html>`;

  host.appendChild(frame);
  document.body.appendChild(host);
  return { host, frame, preserved };
}

function teardownSandboxedAd(
  host: HTMLDivElement,
  frame: HTMLIFrameElement,
  preserved: Set<Element>
) {
  try {
    frame.srcdoc = "<!DOCTYPE html><html><body></body></html>";
    frame.src = "about:blank";
  } catch {}
  try {
    host.remove();
  } catch {}
  try {
    for (const el of Array.from(document.body.children)) {
      if (preserved.has(el)) continue;
      if (el.id === "root" || el.id === "app" || el.id === "pz-video-ad-root") continue;
      try {
        el.remove();
      } catch {}
    }
  } catch {}
}

/**
 * Temporary Social Bar / notification unit for the game/app loader.
 * Runs inside an opaque-origin sandbox so it cannot keep injecting into the
 * top page after the interstitial ends.
 */
export function playAdsterraLoadingAd(ms = 3600): Promise<"shown" | "skipped"> {
  if (isAdFreeClient()) return Promise.resolve("skipped");
  return new Promise((resolve) => {
    let settled = false;
    scrubAdsterraLoadingArtifacts();

    let pack: ReturnType<typeof mountSandboxedAdScript> | null = null;
    try {
      pack = mountSandboxedAdScript({
        hostId: LOADING_HOST_ID,
        scriptSrc: LOADING_SRC,
        scriptAttrs: { "data-cfasync": "false", "data-pz-loading-ad": "1" },
        zIndex: 2147483645,
      });
    } catch {
      resolve("skipped");
      return;
    }

    const finish = (r: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pack) teardownSandboxedAd(pack.host, pack.frame, pack.preserved);
      scrubAdsterraLoadingArtifacts();
      resolve(r);
    };

    const timer = window.setTimeout(() => finish("shown"), Math.max(1200, ms));
    pack.frame.onerror = () => finish("skipped");
  });
}

/** Monetag tag for the game loader — sandboxed + scrubbed after the interstitial. */
export function playMonetagLoadingAd(ms = 3600): Promise<"shown" | "skipped"> {
  return new Promise((resolve) => {
    let settled = false;

    let pack: ReturnType<typeof mountSandboxedAdScript> | null = null;
    try {
      pack = mountSandboxedAdScript({
        hostId: MONETAG_HOST_ID,
        scriptSrc: MONETAG_SRC,
        scriptAttrs: {
          "data-zone": MONETAG_ZONE,
          "data-cfasync": "false",
          "data-pz-monetag": "1",
        },
        zIndex: 2147483644,
      });
    } catch {
      resolve("skipped");
      return;
    }

    const finish = (r: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pack) teardownSandboxedAd(pack.host, pack.frame, pack.preserved);
      scrubAdsterraLoadingArtifacts();
      resolve(r);
    };

    const timer = window.setTimeout(() => finish("shown"), Math.max(1200, ms));
    pack.frame.onerror = () => finish("skipped");
  });
}

/** Run Adsterra Social Bar + Monetag together for the loader, then scrub both. */
export async function playLoaderNetworkAds(ms = 3600): Promise<"shown" | "skipped"> {
  const results = await Promise.allSettled([
    playAdsterraLoadingAd(ms),
    playMonetagLoadingAd(ms),
  ]);
  scrubAdsterraLoadingArtifacts();
  const anyShown = results.some((r) => r.status === "fulfilled" && r.value === "shown");
  return anyShown ? "shown" : "skipped";
}

/**
 * Load Adsterra/Monetag into a host that sits *behind* the video ad (full-bleed VAST in front).
 * Does not take layout space; pointer-events stay off so the video skip control remains usable.
 */
export function playLoaderNetworkAdsBehind(
  hostId: string,
  ms = 45000
): Promise<"shown" | "skipped"> {
  if (isAdFreeClient()) return Promise.resolve("skipped");
  return new Promise((resolve) => {
    let settled = false;
    const host = document.getElementById(hostId) as HTMLDivElement | null;
    if (!host) {
      resolve("skipped");
      return;
    }

    host.innerHTML = "";
    host.style.pointerEvents = "none";

    const frame = document.createElement("iframe");
    frame.title = "Advertisement";
    frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;opacity:0;background:transparent;";
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}</style></head><body><script src="${LOADING_SRC}" data-cfasync="false" data-pz-loading-ad="1"><\/script><script src="${MONETAG_SRC}" data-zone="${MONETAG_ZONE}" data-cfasync="false" data-pz-monetag="1"><\/script></body></html>`;
    host.appendChild(frame);

    const finish = (r: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        frame.srcdoc = "<!DOCTYPE html><html><body></body></html>";
        frame.src = "about:blank";
        frame.remove();
      } catch {}
      try {
        host.innerHTML = "";
      } catch {}
      try {
        scrubAdsterraLoadingArtifacts();
      } catch {}
      resolve(r);
    };

    const timer = window.setTimeout(() => finish("shown"), Math.max(1200, ms));
    frame.onerror = () => finish("skipped");
  });
}

export { LOADING_SRC, KEY_728, KEY_320, NATIVE_ID, NATIVE2_ID, INVOKE_HOST, MONETAG_SRC, MONETAG_ZONE };
