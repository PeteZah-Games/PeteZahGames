import { hrefs, isGHref, isGvHref } from "@/lib/uiMarks";

/** Public paths that mount the browser shell (must match App routes). */
export const SURFACE_INDEX_PATHS = [
  "/games",
  "/apps",
  "/music",
  "/movies",
  "/ai",
  "/chat",
  "/vm",
  "/changelog",
  "/account",
  "/browse",
  "/play",
] as const;

/**
 * Map an in-app tab URL to a real pathname so ad partners (RevIQ/GPT land_uri /
 * request_uri) are not stuck on "/" for every SPA surface.
 */
export function petezahToPath(url: string): string {
  const u = String(url || "");
  const lower = u.toLowerCase();
  if (!u || u === "about:blank" || lower.startsWith("petezah://newtab") || lower.startsWith("petezah://trending")) {
    return "/";
  }
  if (isGHref(u)) return "/games";
  if (isGvHref(u) || lower.startsWith("petezah://appviewer")) return "/play";
  if (lower.startsWith("petezah://apps")) return "/apps";
  if (u.startsWith(hrefs.mu()) || lower.startsWith("petezah://music")) return "/music";
  if (u.startsWith(hrefs.mo()) || lower.startsWith("petezah://movies")) return "/movies";
  if (lower.startsWith("petezah://ai")) return "/ai";
  if (lower.startsWith("petezah://chat")) return "/chat";
  if (lower.startsWith("petezah://vm")) return "/vm";
  if (lower.startsWith("petezah://changelog")) return "/changelog";
  if (lower.startsWith("petezah://account")) return "/account";
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "/browse";
  if (lower.startsWith("petezah://")) return "/";
  return "/";
}

/** Reverse map for cold loads / bookmarks of public surface paths. */
export function pathToPetezah(pathname: string): string | null {
  const raw = String(pathname || "/");
  const p = raw.replace(/\/+$/, "") || "/";
  switch (p) {
    case "/games":
      return hrefs.g();
    case "/apps":
      return "petezah://apps";
    case "/music":
      return hrefs.mu();
    case "/movies":
      return hrefs.mo();
    case "/ai":
      return "petezah://ai";
    case "/chat":
      return "petezah://chat";
    case "/vm":
      return "petezah://vm";
    case "/changelog":
      return "petezah://changelog";
    case "/account":
      return "petezah://account";
    default:
      return null;
  }
}

const PRESERVED_PREFIXES = ["/user/", "/share/", "/api/"];

export function shouldSyncSurfacePath(pathname: string): boolean {
  const p = String(pathname || "/");
  if (PRESERVED_PREFIXES.some((x) => p === x.slice(0, -1) || p.startsWith(x))) return false;
  return true;
}

/** Keep location.pathname aligned with the focused tab for ad targeting. */
export function syncBrowserSurfacePath(tabUrl: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = window.location.pathname || "/";
    if (!shouldSyncSurfacePath(cur)) return;
    const next = petezahToPath(tabUrl);
    if (cur === next) return;
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    window.history.replaceState(window.history.state, "", next + search + hash);
  } catch {}
}
