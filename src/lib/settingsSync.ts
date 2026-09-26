import { hrefs } from "./uiMarks";

const SYNC_KEYS = [
  'theme',
  'siteTitle',
  'siteLogo',
  'panicKey',
  'panicUrl',
  'beforeUnload',
  'disableRightClick',
  'autocloak',
  'linkCloaking',
  'focusCloaking',
  'backgroundColor',
  'backgroundImage',
  'bgNetwork',
  'debugHud',
  'searchEdgeGlow',
  'horizontalTabs',
  'trendingHomescreen',
  hrefs.gf(),
  'quickRelaunch',
  hrefs.rp(),
  'lowPowerBg',
  'rainBackdrop',
  'rainScene',
  'bgEffect',
  'searchEngine',
  'browserIdentity',
  'uaPreset',
  'customUserAgent',
  'proxServer',
  'extensionsEnabled',
  'stripTrackers',
  'preferHttps',
  'petezah-history',
  'petezah-bookmarks',
  'petezah-extensions',
  'petezah-presets',
  'petezah-shortcuts-v2',
  hrefs.lsCustom(),
  hrefs.lsFav(),
  hrefs.lsHid(),
  'customApps',
  'favoriteApps',
  'hiddenApps',
  'movies-saved',
  'petezah-music',
  'petezah-music-liked',
  'selectedVpnRegion',
  'selectedModel',
] as const;

const SYNC_AT_KEY = 'petezah-sync-at';
const MAX_BG_SYNC = 80_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function collectSyncPayload(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SYNC_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) out[key] = val;
  }
  const bg = out.backgroundImage;
  if (bg && bg.startsWith('data:') && bg.length > MAX_BG_SYNC) {
    delete out.backgroundImage;
    out._bgOmitted = '1';
  }
  return out;
}

export function applySyncedPayload(data: Record<string, string>) {
  const copy = { ...data };
  delete copy._bgOmitted;
  for (const [k, v] of Object.entries(copy)) {
    if (v === '' || v === null || v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, String(v));
  }
  localStorage.setItem('settingsUpdated', Date.now().toString());
  window.dispatchEvent(new CustomEvent('petezah-settings-updated'));
}

export async function pullSettings(): Promise<boolean> {
  try {
    const r = await fetch('/api/settings', { credentials: 'include' });
    if (r.status === 401) return false;
    if (!r.ok) return false;
    const { settings } = await r.json();
    if (!settings?.localstorage_data) return false;
    const parsed = JSON.parse(settings.localstorage_data) as Record<string, string>;
    applySyncedPayload(parsed);
    if (settings.updated_at) {
      localStorage.setItem(SYNC_AT_KEY, String(settings.updated_at));
    }
    return true;
  } catch {
    return false;
  }
}

export async function pushSettings(): Promise<boolean> {
  try {
    const payload = collectSyncPayload();
    const theme = payload.theme || localStorage.getItem('theme') || 'default';
    const body = {
      theme,
      localstorage_data: JSON.stringify(payload),
    };
    const r = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (r.status === 401) return false;
    if (!r.ok) return false;
    const now = Date.now();
    localStorage.setItem(SYNC_AT_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function hasLocalSyncData(): boolean {
  return SYNC_KEYS.some((k) => localStorage.getItem(k) !== null);
}

// on login: newer copy wins so we dont stomp fresh local edits
export async function reconcileSettings(): Promise<'pulled' | 'pushed' | 'noop'> {
  try {
    const r = await fetch('/api/settings', { credentials: 'include' });
    if (r.status === 401) return 'noop';
    if (!r.ok) return 'noop';

    const { settings } = await r.json();
    const localAt = parseInt(localStorage.getItem(SYNC_AT_KEY) || '0', 10);
    const serverAt = settings?.updated_at || 0;

    if (!settings?.localstorage_data) {
      if (hasLocalSyncData()) {
        await pushSettings();
        return 'pushed';
      }
      return 'noop';
    }

    if (serverAt > localAt) {
      const parsed = JSON.parse(settings.localstorage_data) as Record<string, string>;
      applySyncedPayload(parsed);
      localStorage.setItem(SYNC_AT_KEY, String(serverAt));
      return 'pulled';
    }

    if (localAt > serverAt || hasLocalSyncData()) {
      await pushSettings();
      return 'pushed';
    }

    return 'noop';
  } catch {
    return 'noop';
  }
}

export function schedulePushSettings(delayMs = 4000) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushSettings();
  }, delayMs);
}

export function requestSyncSoon() {
  window.dispatchEvent(new CustomEvent('petezah-sync-request'));
}
