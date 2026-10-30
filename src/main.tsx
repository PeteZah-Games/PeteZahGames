import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./lib/svgBridge";
import App from "./App";
import "./index.css";
import "./styles/studio-overrides.css";
import { loadFontMaps } from "./lib/fontObfuscation";
import { defaultBrandSrc } from "./lib/uiMarks";
import { themeById, applyBrowserIdentity } from "./lib/siteThemes";
import { isLiteDevice } from "./lib/liteDevice";
import { startCampusPulse } from "./lib/campusPulse";
import { syncBgEffectAttr } from "./lib/bgEffects";
import { ensureBuiltinExtensions } from "./components/ExtensionsPage";
import { installQuietBoot, whenQuietEnds } from "./lib/quietBoot";
import { installTraceSeal } from "./lib/traceSeal";
import { installLessonMetrics, trackSection } from "./lib/lessonMetrics";
import "./styles/rivet.css";

installQuietBoot();
installLessonMetrics();
trackSection("home", { page_title: "Campus Home" });
whenQuietEnds(() => {
  installTraceSeal();
});

const lite = isLiteDevice();
if (lite) {
  document.documentElement.classList.add("lite-device");
}
if (/CrOS/.test(navigator.userAgent)) {
  document.documentElement.classList.add("chromeos");
}

if (!lite) {
  const fontObf = document.createElement("script");
  fontObf.src = "/font-obfuscation.js";
  fontObf.async = true;
  document.head.appendChild(fontObf);
  loadFontMaps();
  if (document.fonts?.load) {
    document.fonts.load("600 16px plusjakartasans-obf").catch(() => {});
  }
}

whenQuietEnds(() => {
  // ExoClick provider for video interstitials only — display ads are RevIQ.
  const src = "https://a.magsrv.com/ad-provider.js";
  if ([...document.scripts].some((el) => el.src === src)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
});

function applyStoredSettings() {
  const get = (k: string) => localStorage.getItem(k);

  const theme = get("theme");
  if (theme) {
    document.body.className = document.body.className.replace(/theme-[\w-]+/g, "").trim();
    document.body.classList.add(`theme-${theme}`);
  }

  const siteTitle = get("siteTitle");
  if (siteTitle) {
    document.title = siteTitle;
  }

  const siteLogo = get("siteLogo");
  {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = siteLogo || defaultBrandSrc();
  }

  const bgImg = get("backgroundImage");
  const bgColor = get("backgroundColor") || themeById(get("theme")).bg;
  // Apply to both body AND YES AND html so nothing overrides it
  const applyBg = (prop: string, val: string) => {
    document.body.style.setProperty(prop, val, "important");
    document.documentElement.style.setProperty(prop, val, "important");
  };
  if (bgImg) {
    applyBg("background-image", `url(${bgImg})`);
    applyBg("background-size", "cover");
    applyBg("background-repeat", "no-repeat");
    applyBg("background-position", "center");
    applyBg("background-color", "");
  } else if (bgColor) {
    applyBg("background-image", "none");
    applyBg("background-color", bgColor);
  }

  if (get("disableRightClick") === "true") {
    const h = (e: MouseEvent) => e.preventDefault();
    (window as any).__rightClickHandler = h;
    document.addEventListener("contextmenu", h);
  }

  if (get("beforeUnload") === "true") {
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    (window as any).__beforeUnloadHandler = h;
    window.addEventListener("beforeunload", h);
  }

  const panicKey = get("panicKey");
  const panicUrl = get("panicUrl");
  if (panicKey && panicUrl) {
    const h = (e: KeyboardEvent) => { if (e.key === panicKey) window.location.href = panicUrl; };
    (window as any).__panicKeyHandler = h;
    window.addEventListener("keydown", h);
  }

  applyBrowserIdentity();

  window.addEventListener("storage", (e) => {
    if (e.key === "settingsUpdated") applyStoredSettings();
  });
  window.addEventListener("petezah-settings-updated", () => applyStoredSettings());
}

if (!localStorage.getItem("theme")) {
  localStorage.setItem("theme", "default");
}
if (!localStorage.getItem("backgroundColor")) {
  localStorage.setItem("backgroundColor", themeById("default").bg);
}
if (localStorage.getItem("bgNetwork") === null) {
  localStorage.setItem("bgNetwork", "false");
}
if (localStorage.getItem("searchEdgeGlow") === null) {
  localStorage.setItem("searchEdgeGlow", lite ? "false" : "true");
}
if (localStorage.getItem("lowPowerBg") === null) {
  localStorage.setItem("lowPowerBg", lite ? "true" : "false");
}
if (localStorage.getItem("bgEffect") === null && localStorage.getItem("rainBackdrop") === null) {
  localStorage.setItem("bgEffect", "rain");
  localStorage.setItem("rainBackdrop", "true");
  localStorage.setItem("rainScene", "harbor");
} else if (localStorage.getItem("bgEffect") === null && localStorage.getItem("rainBackdrop") === "true") {
  localStorage.setItem("bgEffect", "rain");
} else if (localStorage.getItem("bgEffect") === null) {
  localStorage.setItem("bgEffect", "fog");
}
if (!localStorage.getItem("rainScene")) {
  localStorage.setItem("rainScene", "harbor");
}
try {
  const t = themeById(localStorage.getItem("theme"));
  document.documentElement.style.setProperty("--pz-accent", t.accent);
} catch {}
syncBgEffectAttr();
applyStoredSettings();
try {
  ensureBuiltinExtensions();
} catch {}
try {
  localStorage.setItem("focusCloaking", "false");
} catch {}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cloakShellHtml(title: string, icon: string, iframeSrc: string): string {
  return `<!doctype html><html><head><title>${escapeHtml(title)}</title><link rel="icon" href="${escapeHtml(icon)}"></head><body style="margin:0;overflow:hidden"><iframe title="app" style="height:100%;width:100%;border:0;position:fixed;inset:0" src="${escapeHtml(iframeSrc)}" allow="fullscreen; clipboard-read; clipboard-write; display-capture"></iframe></body></html>`;
}

function cloakInPopup(iframeSrc: string, mode: string): boolean {
  if (window !== window.top) return false;
  if (/Firefox/.test(navigator.userAgent)) return false;
  const title = localStorage.getItem("siteTitle") || "Home - Classroom";
  let icon = localStorage.getItem("siteLogo") || defaultBrandSrc();
  if (icon.startsWith("/")) icon = window.location.origin + icon;
  const html = cloakShellHtml(title, icon, iframeSrc);
  let w: Window | null = null;
  let blobUrl: string | null = null;
  if (mode === "blob:") {
    blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    w = window.open(blobUrl, "_blank");
    if (!w || w.closed) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      return false;
    }
    w.addEventListener("load", () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }, { once: true });
  } else {
    w = window.open("about:blank", "_blank");
    if (!w || w.closed) return false;
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch {
      try {
        w.document.title = title;
        const link = w.document.createElement("link");
        link.rel = "icon";
        link.href = icon;
        w.document.head.appendChild(link);
        const iframe = w.document.createElement("iframe");
        iframe.src = iframeSrc;
        iframe.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write; display-capture");
        iframe.style.cssText = "width:100vw;height:100vh;border:none;";
        w.document.body.style.margin = "0";
        w.document.body.style.overflow = "hidden";
        w.document.body.appendChild(iframe);
      } catch {
        return false;
      }
    }
  }
  return true;
}

{
  const blankHash = (window.location.hash || "").toLowerCase() === "#blank";
  const autocloak = localStorage.getItem("autocloak") === "true";
  const linkMode = localStorage.getItem("linkCloaking") || "none";
  const shouldCloak = blankHash || autocloak || (linkMode !== "none");
  if (shouldCloak) {
    const cleanUrl =
      window.location.origin + window.location.pathname + window.location.search;
    const iframeSrc = blankHash ? cleanUrl : window.location.origin + "/";
    const mode = linkMode === "about:blank" ? "about:blank" : "blob:";
    if (cloakInPopup(iframeSrc, mode)) {
      window.location.href =
        localStorage.getItem("panicUrl") || "https://classroom.google.com";
    } else if (blankHash && window.location.hash) {
      try {
        window.history.replaceState(null, "", cleanUrl);
      } catch {}
    }
  }
}

whenQuietEnds(() => {
  startCampusPulse();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);