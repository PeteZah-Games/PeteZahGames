const KEY = "pz-anyclip-played-at";
const WINDOW_MS = 5 * 60 * 1000;
const HOST_ID = "reviq-anyclip-aio-widget";
const PUB = "2731";
const WIDGET = "001Te000004ZYO7IAO_M13894";
/** Self-hosted so Lightspeed stays same-origin; sibling module.css.js must sit next to it. */
const SRC = "/assets/anyclip/lre.js";
const CSS_MODULE = "/assets/anyclip/lre.js.module.css.js";
const READY_WAIT_MS = 4500;
const PLAY_AFTER_READY_MS = 7000;
const HARD_CAP_MS = 12000;

let audioArmed = false;
let warmPromise: Promise<void> | null = null;
let scriptCached = false;

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
  host.style.cssText =
    "width:min(640px,94vw);height:min(360px,56vw);max-height:360px;margin:0 auto;position:relative;z-index:5;overflow:hidden;border-radius:12px;background:#000;pointer-events:auto";
  if (mount) mount.style.pointerEvents = "auto";
  return host;
}

function scrubScripts(host: HTMLElement) {
  try {
    host.querySelectorAll("script[data-pz-anyclip='1']").forEach((n) => n.remove());
  } catch {}
}

export function preloadAnyClip() {
  if (typeof document === "undefined") return warmPromise || Promise.resolve();
  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    try {
      if (!document.querySelector('link[data-pz-anyclip-preload="1"]')) {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "script";
        link.href = SRC;
        link.dataset.pzAnyclipPreload = "1";
        document.head.appendChild(link);
      }
      if (!document.querySelector('link[data-pz-anyclip-css-preload="1"]')) {
        const css = document.createElement("link");
        css.rel = "preload";
        css.as = "script";
        css.href = CSS_MODULE;
        css.dataset.pzAnyclipCssPreload = "1";
        document.head.appendChild(css);
      }
    } catch {}

    try {
      for (const href of [
        "https://player.anyclip.com",
        "https://assets.anyclip.com",
        "https://trafficmanager.anyclip.com",
        "https://cdn5-fstl-tf.anyclip.com",
      ]) {
        const dns = document.createElement("link");
        dns.rel = "dns-prefetch";
        dns.href = href;
        document.head.appendChild(dns);
      }
      const preconnect = document.createElement("link");
      preconnect.rel = "preconnect";
      preconnect.href = "https://player.anyclip.com";
      preconnect.crossOrigin = "anonymous";
      document.head.appendChild(preconnect);
    } catch {}

    try {
      await Promise.all(
        [SRC, CSS_MODULE].map(async (href) => {
          const res = await fetch(href, { cache: "force-cache", credentials: "same-origin" });
          if (res.ok) await res.blob();
        })
      );
      scriptCached = true;
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

    const finish = (result: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      window.clearTimeout(hard);
      window.clearTimeout(readyTimer);
      window.clearTimeout(playTimer);
      window.removeEventListener("message", onMsg);
      try {
        scrubScripts(host as HTMLElement);
        if (host) {
          const keep = host;
          window.setTimeout(() => {
            try {
              keep.innerHTML = "";
            } catch {}
          }, 80);
        }
      } catch {}
      try {
        const mount = document.getElementById("pz-anyclip-mount");
        if (mount) mount.style.pointerEvents = "none";
      } catch {}
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
      if (/lre:.*(play|start|impression|adstart)/i.test(data)) {
        started = true;
      }
    };
    window.addEventListener("message", onMsg);

    readyTimer = window.setTimeout(() => {
      if (!settled && !ready) finish("skipped");
    }, READY_WAIT_MS);

    hard = window.setTimeout(() => {
      finish(started || ready ? "shown" : "skipped");
    }, HARD_CAP_MS);

    void preloadAnyClip().finally(() => {
      if (settled) return;
      host = ensureHost();
      scrubScripts(host);
      try {
        host.innerHTML = "";
      } catch {}

      const script = document.createElement("script");
      script.src = SRC;
      script.async = false;
      script.dataset.cfasync = "false";
      script.dataset.pzAnyclip = "1";
      script.setAttribute("pubname", PUB);
      script.setAttribute("widgetname", WIDGET);
      script.onerror = () => finish("skipped");
      script.onload = () => {
        scriptCached = true;
      };
      host.appendChild(script);
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
