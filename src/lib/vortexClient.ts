const ORIGIN = "https://backend.hutianhuilixiang.cyou";
const CLIENT_ID = "vtx_423da35f2d6a7f3fb31f";
const SCRIPT_SRC = `${ORIGIN}/sdk/v1/vortex.js`;
const LOCAL_SRC = "/storage/js/vortex-sdk.js";

type VortexApi = {
  clientId: string;
  origin: string;
  user: any;
  guild: any;
  channels: any[];
  channel: string | null;
  rules: any;
  emotes: Record<string, any>;
  permissions: Record<string, any>;
  ready: Promise<any>;
  login: (opts?: { popup?: boolean }) => Promise<any>;
  logout: () => void;
  history: (opts?: any) => Promise<any>;
  send: (content: string, opts?: any) => Promise<any>;
  join: (id: string) => Promise<any>;
  on: (event: string, fn: (payload: any) => void) => VortexApi;
  request: (path: string, opts?: any) => Promise<any>;
  asset: (path: string) => string;
};

declare global {
  interface Window {
    Vortex?: {
      init: (opts: {
        clientId: string;
        origin?: string;
        redirectUri?: string;
        storage?: string;
      }) => VortexApi;
    };
  }
}

let boot: Promise<VortexApi> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-pz-vortex-sdk="1"]`) as HTMLScriptElement | null;
    if (existing) {
      if (window.Vortex) resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("sdk")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.pzVortexSdk = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("sdk"));
    document.head.appendChild(s);
  });
}

export function vortexOrigin() {
  return ORIGIN;
}

export function vortexClientId() {
  return CLIENT_ID;
}

export function getVortex(): Promise<VortexApi> {
  if (boot) return boot;
  boot = (async () => {
    try {
      await loadScript(SCRIPT_SRC);
    } catch {
      await loadScript(LOCAL_SRC);
    }
    if (!window.Vortex?.init) throw new Error("Vortex SDK missing");
    let redirectUri = `${location.origin}/api/chat/callback`;
    try {
      const u = new URL(location.href);
      ["code", "state", "error", "error_description"].forEach((k) => u.searchParams.delete(k));
      u.hash = "";
      redirectUri = u.href;
    } catch {}
    const client = window.Vortex.init({
      clientId: CLIENT_ID,
      origin: ORIGIN,
      redirectUri,
      storage: "local",
    });
    await client.ready.catch(() => null);
    return client;
  })().catch((err) => {
    boot = null;
    throw err;
  });
  return boot;
}

export async function vortexLoginPopup() {
  const client = await getVortex();
  return client.login({ popup: true });
}
