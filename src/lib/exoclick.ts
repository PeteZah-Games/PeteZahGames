import { scrubAdsterraLoadingArtifacts } from "@/components/ads/Adsterra";
import { getSiteOrigin, isSvgShell } from "@/lib/siteOrigin";

const CONTAINER_ID = "pz-video-ad-root";
const VAST_BASE = "https://s.magsrv.com/v1/vast.php";
const VAST_ZONE = "6002278";
const FILL_WAIT_MS = 2500;
const HARD_CAP_MS = 20000;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 1;
const PLAYS_KEY = "pz-video-ad-ok";

declare global {
  interface Window {
    google?: any;
  }
}

let playerAssets: Promise<void> | null = null;
let playGen = 0;
let activeContext: "game" | "app" | "vm" = "game";
let activeAdsManager: any = null;
let activeAdsLoader: any = null;
let audioArmed = false;

function readPlays(): number[] {
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr.map(Number).filter((t) => Number.isFinite(t) && now - t < WINDOW_MS);
  } catch {
    return [];
  }
}

function clientCanPlay() {
  return readPlays().length < MAX_PER_WINDOW;
}

function recordPlay() {
  try {
    const next = [...readPlays(), Date.now()].slice(-8);
    localStorage.setItem(PLAYS_KEY, JSON.stringify(next));
  } catch {}
}

function markShown() {
  recordPlay();
  fetch("/api/ads/shown", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: activeContext }),
  }).catch(() => {});
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

function canUnmute() {
  try {
    const ua = (navigator as any).userActivation;
    if (ua?.isActive || ua?.hasBeenActive) return true;
  } catch {}
  return audioArmed;
}

function buildVastUrl() {
  const u = new URL(VAST_BASE);
  u.searchParams.set("idz", VAST_ZONE);
  u.searchParams.set("cb", String(Date.now()) + Math.floor(Math.random() * 1e6));
  u.searchParams.set("sub", activeContext);
  try {
    u.searchParams.set("sub2", location.hostname.slice(0, 80));
  } catch {}
  return u.toString();
}

function loadScript(src: string, id?: string) {
  const existing = id
    ? (document.getElementById(id) as HTMLScriptElement | null)
    : (document.querySelector(`script[data-pz-ad="${src}"]`) as HTMLScriptElement | null);
  if (existing) {
    if (existing.dataset.pzAdLoaded === "1") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const ok = () => resolve();
      const bad = () => reject(new Error(src));
      existing.addEventListener("load", ok, { once: true });
      existing.addEventListener("error", bad, { once: true });
      window.setTimeout(() => (existing.dataset.pzAdLoaded === "1" ? ok() : bad()), 4000);
    });
  }
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (id) s.id = id;
    s.dataset.pzAd = src;
    s.onload = () => {
      s.dataset.pzAdLoaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(src));
    document.head.appendChild(s);
  });
}

function loadIma(): Promise<void> {
  if (window.google?.ima) return Promise.resolve();
  if (playerAssets) return playerAssets;
  playerAssets = loadScript("https://imasdk.googleapis.com/js/sdkloader/ima3.js", "pz-ima3")
    .then(() => {
      if (!window.google?.ima) throw new Error("ima");
    })
    .catch((e) => {
      playerAssets = null;
      throw e;
    });
  return playerAssets;
}

export function preloadVideoAdAssets() {
  void loadIma().catch(() => {});
}

function isFrameSlot(el: HTMLElement) {
  return el.getAttribute("data-pz-ad-slot") === "1";
}

function slotSize(host: HTMLElement) {
  const rect = host.getBoundingClientRect();
  const vw = Math.max(300, Math.floor(rect.width) || window.innerWidth || 640);
  const vh = Math.max(200, Math.floor(rect.height) || window.innerHeight || 360);
  // Full host rect so IMA skip / controls are not clipped by 16:9 letterboxing.
  return { w: vw, h: vh };
}

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    const frame = document.querySelector("[data-pz-content-frame]") as HTMLElement | null;
    (frame || document.body).appendChild(el);
  }
  if (isFrameSlot(el)) {
    el.style.cssText =
      "position:absolute;inset:0;z-index:2;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:#070b12;";
  } else {
    el.style.cssText =
      "position:absolute;inset:0;z-index:80;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:#070b12;";
  }
  return el;
}

function destroyPlayer() {
  try {
    activeAdsManager?.stop?.();
  } catch {}
  try {
    activeAdsManager?.destroy?.();
  } catch {}
  try {
    activeAdsLoader?.contentComplete?.();
  } catch {}
  try {
    activeAdsLoader?.destroy?.();
  } catch {}
  activeAdsManager = null;
  activeAdsLoader = null;
}

function clearContainer() {
  destroyPlayer();
  const el = document.getElementById(CONTAINER_ID);
  if (el) {
    el.querySelectorAll("video").forEach((v) => {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {}
    });
    el.innerHTML = "";
    if (!isFrameSlot(el)) {
      el.style.pointerEvents = "none";
      el.style.display = "none";
      try {
        el.remove();
      } catch {}
    } else {
      el.style.pointerEvents = "none";
    }
  }
  try {
    scrubAdsterraLoadingArtifacts();
  } catch {}
}

export type AdGateResult =
  | { show: false; reason?: string }
  | { show: true; context: string; reason?: string };

export async function requestAdGate(
  context: "game" | "app" | "vm"
): Promise<AdGateResult> {
  activeContext = context;
  if (!clientCanPlay()) {
    return { show: false, reason: "cooldown" };
  }
    try {
      const r = await fetch("/api/ads/gate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
        signal: AbortSignal.timeout(4000),
      });
    const d = await r.json();
    if (!r.ok || !d?.show) {
      return { show: false, reason: d?.reason || "skip" };
    }
    return { show: true, context };
  } catch {
    if (isSvgShell()) return { show: true, context, reason: "offline" };
    return { show: false, reason: "network" };
  }
}

function mountStage(videoId: string) {
  const root = ensureContainer();
  const { w, h } = slotSize(root);
  root.innerHTML = "";
  root.style.pointerEvents = "auto";

  const stage = document.createElement("div");
  // overflow:visible so ExoClick/IMA skip control is not clipped at the edges
  stage.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;background:#000;overflow:visible;";

  const video = document.createElement("video");
  video.id = videoId;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.playsInline = true;
  video.preload = "auto";
  video.width = w;
  video.height = h;
  video.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block";

  const adLayer = document.createElement("div");
  adLayer.id = `${videoId}-ad`;
  adLayer.style.cssText = "position:absolute;inset:0;z-index:2;overflow:visible";

  const timerLabel = document.createElement("div");
  // Keep off the usual IMA skip corner (top-right)
  timerLabel.style.cssText =
    "position:absolute;left:8px;bottom:8px;z-index:8;padding:4px 8px;border-radius:6px;background:hsla(220,28%,8%,0.55);color:hsla(0,0%,96%,0.7);font:650 11px/1 ui-sans-serif,system-ui,sans-serif;pointer-events:none";
  timerLabel.textContent = "Ad";

  stage.appendChild(video);
  stage.appendChild(adLayer);
  stage.appendChild(timerLabel);
  root.appendChild(stage);

  return { root, video, adLayer, timerLabel, w, h };
}

function playViaImaSdk(
  myGen: number,
  video: HTMLVideoElement,
  adLayer: HTMLElement,
  w: number,
  h: number,
  vastUrl: string,
  muted: boolean,
  timerLabel: HTMLElement
): Promise<"done" | "skip" | "error"> {
  return new Promise((resolve) => {
    const ima = window.google?.ima;
    if (!ima) {
      resolve("error");
      return;
    }

    let settled = false;
    let started = false;
    let tick: number | null = null;
    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(fillWait);
      if (tick != null) window.clearInterval(tick);
      if (playGen === myGen) {
        try {
          activeAdsManager?.stop?.();
        } catch {}
        try {
          activeAdsManager?.destroy?.();
        } catch {}
        activeAdsManager = null;
        activeAdsLoader = null;
      }
      resolve(result);
    };

    const fillWait = window.setTimeout(() => {
      if (!started) finish("error");
    }, isSvgShell() ? 3500 : FILL_WAIT_MS);

    try {
      ima.settings.setDisableCustomPlaybackForIOS10Plus(true);
      try {
        ima.settings.setVpaidMode(ima.ImaSdkSettings.VpaidMode.INSECURE);
      } catch {
        try {
          ima.settings.setVpaidMode(ima.ImaSdkSettings.VpaidMode.ENABLED);
        } catch {}
      }
      ima.settings.setNumRedirects(8);
      ima.settings.setLocale("en");
      const adDisplayContainer = new ima.AdDisplayContainer(adLayer, video);
      adDisplayContainer.initialize();
      const adsLoader = new ima.AdsLoader(adDisplayContainer);
      activeAdsLoader = adsLoader;

      adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (ev: any) => {
        if (playGen !== myGen || settled) return;
        try {
          const mgr = ev.getAdsManager(video, {
            enablePreloading: true,
            bitrate: 1800,
            loadVideoTimeout: 5000,
          });
          activeAdsManager = mgr;
          mgr.addEventListener(ima.AdEvent.Type.STARTED, () => {
            if (started) return;
            started = true;
            markShown();
            if (!muted) {
              try {
                video.muted = false;
                video.volume = 1;
                mgr.setVolume?.(1);
              } catch {}
            }
            tick = window.setInterval(() => {
              try {
                const left = mgr.getRemainingTime?.();
                if (typeof left === "number" && left >= 0) {
                  timerLabel.textContent = `Ad · ${Math.max(0, Math.ceil(left))}s`;
                }
              } catch {}
            }, 250);
          });
          mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish("done"));
          mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish("done"));
          mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish(started ? "done" : "skip"));
          mgr.addEventListener(ima.AdEvent.Type.USER_CLOSE, () => finish(started ? "done" : "skip"));
          mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(started ? "done" : "error"));
          video.muted = muted;
          video.volume = muted ? 0 : 1;
          mgr.init(w, h, ima.ViewMode.NORMAL);
          mgr.start();
        } catch {
          finish("error");
        }
      });
      adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(started ? "done" : "error"));

      const req = new ima.AdsRequest();
      req.adTagUrl = vastUrl;
      req.linearAdSlotWidth = w;
      req.linearAdSlotHeight = h;
      req.nonLinearAdSlotWidth = w;
      req.nonLinearAdSlotHeight = Math.min(150, h);
      req.vastLoadTimeout = 5000;
      req.setAdWillAutoPlay(true);
      req.setAdWillPlayMuted(muted);
      try {
        req.contentDuration = -1;
        req.pageUrl = getSiteOrigin() || location.origin;
      } catch {}
      try {
        if (ima.OmidAccessMode && ima.OmidVerificationVendor) {
          req.omidAccessModeRules = {
            [ima.OmidVerificationVendor.GOOGLE]: ima.OmidAccessMode.FULL,
            [ima.OmidVerificationVendor.OTHER]: ima.OmidAccessMode.FULL,
          };
        }
      } catch {}
      adsLoader.requestAds(req);
    } catch {
      finish("error");
    }
  });
}

async function playWithRetries(
  myGen: number,
  video: HTMLVideoElement,
  adLayer: HTMLElement,
  w: number,
  h: number,
  timerLabel: HTMLElement
): Promise<"done" | "skip" | "error"> {
  const unmuted = canUnmute();
  const mutedPlay = isSvgShell() ? true : !unmuted;
  if (playGen !== myGen) return "skip";
  return playViaImaSdk(myGen, video, adLayer, w, h, buildVastUrl(), mutedPlay, timerLabel);
}

function playSession(myGen: number): Promise<"done" | "skip" | "error"> {
  return new Promise(async (resolve) => {
    let settled = false;
    const videoId = `pz-exo-video-${myGen}`;
    const { video, adLayer, timerLabel, w, h } = mountStage(videoId);

    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      if (playGen === myGen) {
        try {
          video.pause();
        } catch {}
        destroyPlayer();
        try {
          clearContainer();
        } catch {}
      }
      resolve(result);
    };

    const hard = window.setTimeout(() => finish("skip"), isSvgShell() ? 5000 : HARD_CAP_MS);

    try {
      await loadIma();
      if (playGen !== myGen) {
        finish("skip");
        return;
      }
      if (!window.google?.ima) {
        finish("error");
        return;
      }
      const result = await playWithRetries(myGen, video, adLayer, w, h, timerLabel);
      finish(result);
    } catch {
      finish("error");
    }
  });
}

export function playVideoAd(context?: "game" | "app" | "vm"): Promise<"done" | "skip" | "error"> {
  if (context) activeContext = context;
  const myGen = ++playGen;
  destroyPlayer();
  return new Promise(async (resolve) => {
    let settled = false;
    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      if (playGen === myGen) {
        try {
          clearContainer();
        } catch {}
        try {
          scrubAdsterraLoadingArtifacts();
        } catch {}
      }
      resolve(result);
    };

    const hard = window.setTimeout(() => finish("skip"), isSvgShell() ? 6000 : HARD_CAP_MS + 500);

    try {
      const result = await playSession(myGen);
      finish(result);
    } catch {
      finish("error");
    }
  });
}

export async function runInterstitial(
  context: "game" | "app" | "vm"
): Promise<"shown" | "skipped" | "fallback"> {
  const gate = await requestAdGate(context);
  if (gate.show) {
    const result = await playVideoAd(context);
    if (result === "error" || result === "skip") return "skipped";
    return "shown";
  }
  return "skipped";
}

export function stopVideoAd() {
  playGen += 1;
  clearContainer();
}

export { CONTAINER_ID };
