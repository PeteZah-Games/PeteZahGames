const KEY = "pz-anyclip-played-at";
const WINDOW_MS = 5 * 60 * 1000;
const HOST_ID = "reviq-anyclip-aio-widget";
const PUB = "2731";
const WIDGET = "001Te000004ZYO7IAO_M13894";
const SRC = "/assets/anyclip/lre.js";
const READY_WAIT_MS = 3500;
const PLAY_CAP_MS = 9000;

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

function scrub(host: HTMLElement | null) {
  if (!host) return;
  try {
    host.querySelectorAll("script[data-pz-anyclip='1']").forEach((n) => n.remove());
  } catch {}
  try {
    host.innerHTML = "";
  } catch {}
}

let warmed = false;

export function preloadAnyClip() {
  if (typeof document === "undefined" || warmed) return;
  warmed = true;
  const s = document.createElement("link");
  s.rel = "preload";
  s.as = "script";
  s.href = SRC;
  document.head.appendChild(s);
}

export function playAnyClipAd(ms = PLAY_CAP_MS): Promise<"shown" | "skipped"> {
  if (typeof document === "undefined") return Promise.resolve("skipped");
  if (!anyClipDue()) return Promise.resolve("skipped");

  return new Promise((resolve) => {
    let settled = false;
    let ready = false;
    let host: HTMLDivElement | null = null;

    const finish = (result: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      window.clearTimeout(hard);
      window.clearTimeout(readyTimer);
      window.removeEventListener("message", onMsg);
      try {
        scrub(host);
      } catch {}
      try {
        const mount = document.getElementById("pz-anyclip-mount");
        if (mount) mount.style.pointerEvents = "none";
      } catch {}
      if (result === "shown") markAnyClipPlayed();
      resolve(result);
    };

    const mount = document.getElementById("pz-anyclip-mount");
    if (mount) mount.style.pointerEvents = "auto";

    host = document.getElementById(HOST_ID) as HTMLDivElement | null;
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.cssText =
        "width:min(400px,92vw);height:225px;margin:0 auto;position:relative;z-index:5;overflow:hidden;border-radius:12px;background:#000;pointer-events:auto";
      (mount || document.body).appendChild(host);
    } else {
      scrub(host);
      host.style.width = "min(400px, 92vw)";
      host.style.height = "225px";
      host.style.pointerEvents = "auto";
    }

    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.dataset.cfasync = "false";
    script.dataset.pzAnyclip = "1";
    script.setAttribute("pubname", PUB);
    script.setAttribute("widgetname", WIDGET);
    try {
      (script as any).__original_src = SRC;
    } catch {}

    const onMsg = (event: MessageEvent) => {
      const data = event?.data;
      if (typeof data === "string" && data.indexOf("lre:playerReady://") === 0) {
        ready = true;
      }
    };
    window.addEventListener("message", onMsg);

    script.onerror = () => finish("skipped");
    host.appendChild(script);

    const readyTimer = window.setTimeout(() => {
      if (!settled && !ready) finish("skipped");
    }, READY_WAIT_MS);

    const hard = window.setTimeout(() => {
      finish(ready ? "shown" : "skipped");
    }, Math.min(ms, PLAY_CAP_MS));

    window.setTimeout(() => {
      if (!settled && ready) finish("shown");
    }, Math.min(ms, 6500));
  });
}
