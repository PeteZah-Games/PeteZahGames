import { getPx, PX, pxEncode } from "@/lib/px";
import { hrefs } from "@/lib/uiMarks";

export type OpenTabRequest = {
  url: string;
  mode?: "proxy" | "ad" | "direct";
  soft?: boolean;
};

const AD_HOST_RE =
  /(^|\.)(senty\.com\.au|highperformanceformat\.com|effectivecpmnetwork\.com|profitableratecpmnetwork\.com|profitablegatecpm\.com|adsterra\.com|adserving\.|popads\.|propellerads\.|doubleclick\.net|googlesyndication\.com|googletagservices\.com|googleadservices\.com|adnxs\.com|adsrvr\.org|advertising\.com|adform\.net|casalemedia\.com|rubiconproject\.com|pubmatic\.com|openx\.net|lijit\.com|smaato\.net|contextweb\.com|criteo\.com|taboola\.com|outbrain\.com|mgid\.com|revcontent\.com|exoclick\.com|magsrv\.com|juicyads\.com|trafficjunky\.net|popcash\.net|bidvertiser\.com|rfihub\.com|inmobi\.com|smartadserver\.com|a-mo\.net|tapad\.com|lkqd\.net|adotmob\.com|iqm\.com|quantserve\.com|loopme\.me|admanmedia\.com|everesttech\.net|omnitagjs\.com|360yield\.com|ssp\.wp\.pl|adthrive\.com|raptive\.com|amazon-adsystem\.com|googletagmanager\.com)(\/|:|$)/i;

const AD_HINT_RE =
  /senty\.com\.au|highperformanceformat|effectivecpmnetwork|profitableratecpmnetwork|profitablegatecpm|adsterra|doubleclick|googlesyndication|googleadservices|popads|propellerads|exoclick|magsrv|juicyads|adnxs|adsrvr|casalemedia|rubiconproject|taboola|outbrain|adthrive|raptive|amazon-adsystem|safeframe\.googlesyndication/i;

function fromCodes(codes: number[]): string {
  return codes.map((c) => String.fromCharCode(c)).join("");
}

const DECODE = fromCodes([100, 101, 99, 111, 100, 101, 85, 114, 108]);

export function pxDecode(url: string): string {
  const c = getPx();
  if (!c || typeof c[DECODE] !== "function") return url;
  try {
    return c[DECODE](url);
  } catch {
    return url;
  }
}

function isProxyPath(pathname: string): boolean {
  return pathname.startsWith(PX.prefix);
}

function tryDecodeAbsolute(href: string): string | null {
  try {
    const abs = new URL(href, location.origin).href;
    if (!abs.includes(PX.prefix)) return null;
    const decoded = pxDecode(abs);
    if (decoded && decoded !== abs && /^https?:\/\//i.test(decoded)) return decoded;
    const u = new URL(abs);
    if (u.origin === location.origin && isProxyPath(u.pathname)) {
      const again = pxDecode(location.origin + u.pathname + u.search + u.hash);
      if (again && again !== abs && /^https?:\/\//i.test(again)) return again;
    }
  } catch {}
  return null;
}

export function unwrapProxyUrl(raw: string, baseHref?: string): string {
  let url = String(raw || "").trim();
  if (!url || url === "about:blank") return url;
  try {
    if (baseHref) url = new URL(url, baseHref).href;
  } catch {}

  for (let i = 0; i < 3; i++) {
    const decoded = tryDecodeAbsolute(url);
    if (!decoded || decoded === url) break;
    url = decoded;
  }

  try {
    const u = new URL(url, location.origin);
    if (u.origin === location.origin && isProxyPath(u.pathname)) {
      const decoded = pxDecode(u.href);
      if (decoded && /^https?:\/\//i.test(decoded) && !decoded.includes(PX.prefix)) {
        return decoded;
      }
    }
  } catch {}

  return url;
}

export function isAdUrl(url: string): boolean {
  const raw = String(url || "");
  if (!raw) return false;
  if (AD_HINT_RE.test(raw)) return true;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (AD_HOST_RE.test(host)) return true;
    if (AD_HINT_RE.test(host)) return true;
  } catch {
    return AD_HOST_RE.test(raw) || AD_HINT_RE.test(raw);
  }
  return false;
}

function looksLikePopup(features?: string | null): boolean {
  if (!features) return false;
  return /(?:^|,)\s*(?:width|height|left|top|popup)\s*=/i.test(features);
}

export function classifyOpenUrl(url: string): "ad" | "proxy" | "skip" {
  const u = unwrapProxyUrl(String(url || "").trim());
  if (!u || u === "about:blank") return "skip";
  if (u.startsWith("javascript:") || u.startsWith("data:") || u.startsWith("blob:")) return "skip";
  if (u.startsWith("petezah://")) return "skip";

  try {
    const parsed = new URL(u, location.href);
    if (parsed.origin === location.origin) {
      if (isProxyPath(parsed.pathname)) {
        const decoded = unwrapProxyUrl(parsed.href);
        if (decoded !== parsed.href && /^https?:\/\//i.test(decoded)) {
          if (isAdUrl(decoded)) return "ad";
          return hrefs.modeP() as "proxy";
        }
        return "skip";
      }
      if (
        parsed.pathname === "/" ||
        parsed.pathname.startsWith("/api/") ||
        parsed.pathname.startsWith("/fonts/") ||
        parsed.pathname.startsWith("/assets/")
      ) {
        return "skip";
      }
    }
  } catch {}

  if (isAdUrl(u)) return "ad";
  if (/^https?:\/\//i.test(u)) return hrefs.modeP() as "proxy";
  return "skip";
}

export function toAdTabUrl(url: string): string {
  return `petezah://ad?url=${encodeURIComponent(url)}`;
}

export function parseAdTabUrl(tabUrl: string): string | null {
  if (!tabUrl.startsWith("petezah://ad")) return null;
  try {
    const q = tabUrl.includes("?") ? tabUrl.slice(tabUrl.indexOf("?") + 1) : "";
    return new URLSearchParams(q).get("url");
  } catch {
    return null;
  }
}

export function emitOpenTab(req: OpenTabRequest) {
  window.dispatchEvent(new CustomEvent("petezah-open-tab", { detail: req }));
}

function resolveOpen(
  raw: string,
  baseHref?: string,
  opts?: { forceAd?: boolean; features?: string | null }
): { url: string; mode: "ad" | "proxy" | "skip" } {
  const resolved = unwrapProxyUrl(raw, baseHref);
  let mode = classifyOpenUrl(resolved);
  if (mode === "skip") return { url: resolved, mode };
  if (opts?.forceAd || looksLikePopup(opts?.features) || isAdUrl(resolved)) {
    mode = "ad";
  }
  return { url: resolved, mode };
}

export function installParentOpenTrap() {
  const w = window as any;
  if (w.__pzParentOpenTrap) return;
  w.__pzParentOpenTrap = true;
  const orig = window.open.bind(window);
  w.__pzNativeOpen = orig;
  window.open = function (url?: string | URL, target?: string, features?: string) {
    const raw = url == null ? "" : String(url);
    if (!raw || raw === "about:blank") {
      return orig(url as any, target, features);
    }
    const { url: resolved, mode: initial } = resolveOpen(raw, location.href, {
      features: features || null,
      forceAd: looksLikePopup(features),
    });
    let kind = initial;
    if (kind !== "skip") {
      try {
        const u = new URL(resolved, location.href);
        if (/^https?:$/i.test(u.protocol) && u.origin !== location.origin) {
          kind = "ad";
        }
      } catch {}
    }
    if (kind === "skip") {
      return orig(url as any, target, features);
    }
    emitOpenTab({
      url: resolved,
      mode: kind === "ad" ? "ad" : hrefs.modeP(),
      soft: kind === "ad",
    });
    return {
      closed: false,
      close() {},
      focus() {},
      blur() {},
      postMessage() {},
      location: { href: resolved },
    } as any;
  } as typeof window.open;
}

export function openProxiedTab(url: string) {
  const href = String(url || "").trim();
  if (!href) return null;
  let dest = href;
  try {
    const u = new URL(href, location.origin);
    if (u.origin === location.origin) {
      dest = u.href;
    } else if (/^https?:$/i.test(u.protocol)) {
      const encoded = pxEncode(u.href);
      if (!encoded || encoded === "about:blank") return null;
      dest = new URL(encoded, location.origin).href;
    }
  } catch {
    return null;
  }
  return openNativeWindow(dest);
}

export function openNativeWindow(url: string, target = "_blank") {
  const href = String(url || "").trim();
  if (!href) return null;
  const w = window as any;
  const native =
    typeof w.__pzNativeOpen === "function"
      ? (w.__pzNativeOpen as typeof window.open)
      : window.open.bind(window);
  try {
    return native(href, target, "noopener,noreferrer");
  } catch {
    return null;
  }
}

function postOpen(resolved: string, mode: "ad" | "proxy") {
  window.postMessage(
    {
      source: "pz-open-trap",
      url: resolved,
      mode,
      soft: mode === "ad",
    },
    "*"
  );
}

export function installFrameOpenTrap(iframe: HTMLIFrameElement) {
  try {
    const win = iframe.contentWindow as any;
    const doc = iframe.contentDocument;
    if (!win || !doc?.documentElement) return;
    if (win.__pzOpenTrap && typeof win.open === "function" && win.open.__pzMarked) {
      trapNestedFrames(doc);
      return;
    }
    win.__pzOpenTrap = true;

    const handle = (raw: string, forceAd: boolean, features?: string | null) => {
      try {
        const { url: resolved, mode: kind } = resolveOpen(raw, win.location?.href || undefined, {
          forceAd,
          features,
        });
        if (kind === "skip") return false;
        postOpen(resolved, kind === "ad" || forceAd ? "ad" : hrefs.modeP());
        return true;
      } catch {
        return false;
      }
    };

    const origOpen = win.open?.bind(win);
    win.open = function (url?: string, target?: string, features?: string) {
      const raw = url == null ? "" : String(url);
      if (!raw || raw === "about:blank") {
        return origOpen ? origOpen(url, target, features) : null;
      }
      const base = win.location?.href || undefined;
      const unwrapped = unwrapProxyUrl(raw, base);
      const popup = looksLikePopup(features);
      if (popup || isAdUrl(unwrapped)) {
        if (handle(raw, true, features || null)) {
          return {
            closed: false,
            close() {},
            focus() {},
            blur() {},
            postMessage() {},
            location: { href: raw },
          };
        }
      }
      openProxiedTab(/^https?:\/\//i.test(unwrapped) ? unwrapped : raw);
      return {
        closed: false,
        close() {},
        focus() {},
        blur() {},
        postMessage() {},
        location: { href: raw },
      };
    };
    win.open.__pzMarked = true;

    doc.addEventListener(
      "click",
      (e: MouseEvent) => {
        const t = e.target as Element | null;
        const a = t?.closest?.("a") as HTMLAnchorElement | null;
        if (!a) return;
        const target = (a.getAttribute("target") || "").toLowerCase();
        if (target !== "_blank" && target !== "_new") return;
        const href = a.href || a.getAttribute("href") || "";
        if (!href || href.startsWith("javascript:")) return;
        const unwrapped = unwrapProxyUrl(href, win.location?.href || undefined);
        if (isAdUrl(unwrapped)) {
          if (handle(href, true)) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        openProxiedTab(/^https?:\/\//i.test(unwrapped) ? unwrapped : href);
      },
      true
    );

    trapNestedFrames(doc);
  } catch {}
}

function trapNestedFrames(doc: Document) {
  const scan = () => {
    doc.querySelectorAll("iframe").forEach((frame) => {
      try {
        installFrameOpenTrap(frame as HTMLIFrameElement);
      } catch {}
    });
  };
  scan();
  if ((doc as any).__pzNestedTrapMo) return;
  try {
    const mo = new MutationObserver(() => scan());
    mo.observe(doc.documentElement, { childList: true, subtree: true });
    (doc as any).__pzNestedTrapMo = mo;
  } catch {}
}
