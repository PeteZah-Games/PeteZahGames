const KEY = "pz-anyclip-played-at";
const WINDOW_MS = 5 * 60 * 1000;
const HOST_ID = "reviq-anyclip-aio-widget";
const PUB = "2731";
const WIDGET = "001Te000004ZYO7IAO_M13894";
/** Official CDN — sibling modules (css/etc) resolve next to this URL. */
const SRC = "https://player.anyclip.com/anyclip-widget/lre-widget/prod/v1/src/lre.js";
const READY_WAIT_MS = 12000;
const PLAY_AFTER_READY_MS = 9000;
const HARD_CAP_MS = 18000;

let audioArmed = false;
let warmPromise: Promise<void> | null = null;

function readAt() {
  try {
    const n = Number(localStorage.getItem(KEY) || 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function anyClipDue() {
  const at = readAt();
  return !at || Date.now() - at >= WINDOW_MS;
}

export function markAnyClipPlayed() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {}
}

export function armAdAudio() {
  audioArmed = true;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      void ctx.resume();
    }
  } catch {}
}

export function isAdAudioArmed() {
  return audioArmed;
}

function ensureHost(): HTMLDivElement {
  let host = document.getElementById(HOST_ID) as HTMLDivElement | null;
  const mount = document.getElementById("pz-anyclip-mount");
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    (mount || document.body).appendChild(host);
  }
  host.setAttribute("pubname", PUB);
  host.setAttribute("widgetname", WIDGET);
  host.setAttribute("data-pubname", PUB);
  host.setAttribute("data-widgetname", WIDGET);
  host.style.cssText =
    "width:min(640px,94vw);height:min(360px,56vw);max-height:360px;margin:0 auto;position:relative;z-index:5;overflow:hidden;border-radius:12px;background:#000;pointer-events:auto;visibility:visible;opacity:1";
  if (mount) {
    mount.style.pointerEvents = "auto";
    mount.style.visibility = "visible";
  }
  return host;
}

function scrubScripts(root: ParentNode | null) {
  if (!root) return;
  try {
    root.querySelectorAll("script[data-pz-anyclip='1']").forEach((n) => n.remove());
  } catch {}
}

function applyScriptAttrs(script: HTMLScriptElement) {
  script.setAttribute("pubname", PUB);
  script.setAttribute("widgetname", WIDGET);
  script.setAttribute("data-pubname", PUB);
  script.setAttribute("data-widgetname", WIDGET);
  // Force play in interstitial (widget config defaults to autoplay-inview).
  script.setAttribute("data-ap", "on");
  script.setAttribute("data-snd", "1");
  script.setAttribute("data-ads", "1");
  script.setAttribute("data-container", `#${HOST_ID}`);
  script.dataset.cfasync = "false";
  script.dataset.pzAnyclip = "1";
}

export function preloadAnyClip() {
  if (typeof document === "undefined") return warmPromise || Promise.resolve();
  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    try {
      for (const href of [
        "https://player.anyclip.com",
        "https://assets.anyclip.com",
        "https://config.anyclip.com",
        "https://trafficmanager.anyclip.com",
        "https://marketplace.anyclip.com",
        "https://cdn5-fstl-tf.anyclip.com",
      ]) {
        if (!document.querySelector(`link[data-pz-anyclip-dns="${href}"]`)) {
          const dns = document.createElement("link");
          dns.rel = "dns-prefetch";
          dns.href = href;
          dns.dataset.pzAnyclipDns = href;
          document.head.appendChild(dns);
        }
      }
      if (!document.querySelector('link[data-pz-anyclip-preconnect="1"]')) {
        const preconnect = document.createElement("link");
        preconnect.rel = "preconnect";
        preconnect.href = "https://player.anyclip.com";
        preconnect.crossOrigin = "anonymous";
        preconnect.dataset.pzAnyclipPreconnect = "1";
        document.head.appendChild(preconnect);
      }
      if (!document.querySelector('link[data-pz-anyclip-preload="1"]')) {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "script";
        link.href = SRC;
        link.dataset.pzAnyclipPreload = "1";
        document.head.appendChild(link);
      }
    } catch {}

    try {
      ensureHost();
    } catch {}
  })();

  return warmPromise;
}

export function playAnyClipAd(): Promise<"shown" | "skipped"> {
  if (typeof document === "undefined") return Promise.resolve("skipped");
  if (!anyClipDue()) return Promise.resolve("skipped");

  return new Promise((resolve) => {
    let settled = false;
    let ready = false;
    let started = false;
    let host: HTMLDivElement | null = null;
    let hard = 0;
    let readyTimer = 0;
    let playTimer = 0;

    const cleanupDom = (aggressive: boolean) => {
      try {
        scrubScripts(document);
        if (aggressive && host) {
          const keep = host;
          window.setTimeout(() => {
            try {
              keep.querySelectorAll("iframe, video, .video-js, .ac-lre-wrapper").forEach((n) => n.remove());
            } catch {}
          }, 120);
        }
      } catch {}
      try {
        const mount = document.getElementById("pz-anyclip-mount");
        if (mount) mount.style.pointerEvents = "none";
      } catch {}
    };

    const finish = (result: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      window.clearTimeout(hard);
      window.clearTimeout(readyTimer);
      window.clearTimeout(playTimer);
      window.removeEventListener("message", onMsg);
      cleanupDom(true);
      if (result === "shown") markAnyClipPlayed();
      resolve(result);
    };

    const onMsg = (event: MessageEvent) => {
      const data = event?.data;
      if (typeof data !== "string") return;
      if (data.indexOf("lre:playerReady://") === 0) {
        ready = true;
        started = true;
        window.clearTimeout(readyTimer);
        if (!playTimer) {
          playTimer = window.setTimeout(() => {
            if (!settled) finish("shown");
          }, PLAY_AFTER_READY_MS);
        }
      }
      if (/lre:.*(play|start|impression|adstart|adPlay)/i.test(data)) {
        started = true;
        ready = true;
        window.clearTimeout(readyTimer);
      }
    };
    window.addEventListener("message", onMsg);

    readyTimer = window.setTimeout(() => {
      // Still wait out hard cap if script loaded but ready is slow; only bail early on total silence.
      if (!settled && !ready && !started) {
        /* keep waiting until HARD_CAP */
      }
    }, READY_WAIT_MS);

    hard = window.setTimeout(() => {
      finish(started || ready ? "shown" : "skipped");
    }, HARD_CAP_MS);

    void preloadAnyClip().finally(() => {
      if (settled) return;
      host = ensureHost();
      scrubScripts(host);
      scrubScripts(document.head);

      // Prefer inserting the script as a sibling inside the mount (official embed pattern).
      const mount = document.getElementById("pz-anyclip-mount") || host.parentElement || document.body;
      scrubScripts(mount);

      const script = document.createElement("script");
      script.src = SRC;
      script.async = false;
      applyScriptAttrs(script);
      script.onerror = () => finish("skipped");
      script.onload = () => {
        // Nudge intersection / visibility for inview configs if data-ap is ignored.
        try {
          host?.scrollIntoView?.({ block: "center", inline: "nearest" });
          window.dispatchEvent(new Event("scroll"));
          window.dispatchEvent(new Event("resize"));
        } catch {}
      };

      // Insert immediately before the host so the player anchors to this node.
      try {
        if (host.parentNode) host.parentNode.insertBefore(script, host);
        else mount.appendChild(script);
      } catch {
        mount.appendChild(script);
      }
    });
  });
}

export async function runRevIqInterstitial(
  _context: "game" | "app" | "vm" = "game"
): Promise<"shown" | "skipped"> {
  if (!anyClipDue()) return "skipped";
  armAdAudio();
  await preloadAnyClip();
  return playAnyClipAd();
}
