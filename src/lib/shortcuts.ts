import { hrefs, marks } from "./uiMarks";

export type ShortcutId =
  | "newTab"
  | "closeTab"
  | "focusUrl"
  | "history"
  | "extensions"
  | "bookmarks"
  | "games"
  | "ai"
  | "tools"
  | "inspect"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset";

export type ShortcutBinding = {
  key: string;
  tab: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
};

export const SHORTCUT_META: {
  id: ShortcutId;
  label: string;
  desc: string;
}[] = [
  { id: "newTab", label: "New tab", desc: "Open a blank tab" },
  { id: "closeTab", label: "Close tab", desc: "Close the active tab" },
  { id: "focusUrl", label: "Focus location field", desc: "Jump to the location field" },
  { id: "history", label: "History", desc: "Open browsing history" },
  { id: "extensions", label: "Extensions", desc: "Open extensions" },
  { id: "bookmarks", label: "Bookmarks", desc: "Open bookmarks" },
  { id: hrefs.kindG() as ShortcutId, label: marks.a(), desc: "Open the library" },
  { id: "ai", label: "AI", desc: "Open AI chat" },
  { id: "tools", label: "Tools", desc: "Open developer tools" },
  { id: "inspect", label: "Inspect", desc: "Inspect the current page" },
  { id: "zoomIn", label: "Zoom in", desc: "Increase page zoom" },
  { id: "zoomOut", label: "Zoom out", desc: "Decrease page zoom" },
  { id: "zoomReset", label: "Reset zoom", desc: "Reset zoom to 100%" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutId, ShortcutBinding> = {
  newTab: { key: "t", tab: true, ctrl: false, shift: false, alt: false },
  closeTab: { key: "w", tab: true, ctrl: false, shift: false, alt: false },
  focusUrl: { key: "l", tab: true, ctrl: false, shift: false, alt: false },
  history: { key: "h", tab: true, ctrl: false, shift: false, alt: false },
  extensions: { key: "e", tab: true, ctrl: false, shift: false, alt: false },
  bookmarks: { key: "d", tab: true, ctrl: false, shift: false, alt: false },
  [hrefs.kindG()]: { key: "g", tab: true, ctrl: false, shift: false, alt: false },
  ai: { key: "j", tab: true, ctrl: false, shift: false, alt: false },
  tools: { key: "u", tab: true, ctrl: false, shift: false, alt: false },
  inspect: { key: "i", tab: true, ctrl: false, shift: false, alt: false },
  zoomIn: { key: "=", tab: true, ctrl: false, shift: false, alt: false },
  zoomOut: { key: "-", tab: true, ctrl: false, shift: false, alt: false },
  zoomReset: { key: "0", tab: true, ctrl: false, shift: false, alt: false },
};

const STORAGE_KEY = "petezah-shortcuts-v2";

let tabChordUntil = 0;

export function armTabChord(ms = 1000) {
  tabChordUntil = Date.now() + ms;
}

export function clearTabChord() {
  tabChordUntil = 0;
}

export function isTabChordActive() {
  return Date.now() < tabChordUntil;
}

export function loadShortcuts(): Record<ShortcutId, ShortcutBinding> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SHORTCUTS };
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutId, ShortcutBinding>>;
    const out = { ...DEFAULT_SHORTCUTS };
    for (const id of Object.keys(DEFAULT_SHORTCUTS) as ShortcutId[]) {
      const b = parsed[id];
      if (b && typeof b.key === "string" && b.key.length > 0) {
        out[id] = {
          key: String(b.key).toLowerCase().slice(0, 1) || String(b.key).toLowerCase(),
          tab: !!b.tab,
          ctrl: !!b.ctrl,
          shift: !!b.shift,
          alt: !!b.alt,
        };
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(map: Record<ShortcutId, ShortcutBinding>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  localStorage.setItem("settingsUpdated", Date.now().toString());
  window.dispatchEvent(new CustomEvent("petezah-settings-updated"));
}

export function formatShortcut(b: ShortcutBinding): string {
  const parts: string[] = [];
  if (b.tab) parts.push("Tab");
  if (b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.shift) parts.push("Shift");
  parts.push(b.key === "=" ? "+" : b.key.toUpperCase());
  return parts.join("+");
}

export function eventMatchesShortcut(e: KeyboardEvent, b: ShortcutBinding, tabArmed: boolean): boolean {
  if (e.key === "Tab") return false;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  const want = b.key.toLowerCase();
  const keyOk =
    key === want ||
    (want === "=" && (key === "=" || key === "+")) ||
    (want === "+" && (key === "=" || key === "+"));
  if (!keyOk) return false;
  if (!!b.tab !== tabArmed) return false;
  const mod = e.metaKey || e.ctrlKey;
  if (!!b.ctrl !== mod) return false;
  if (!!b.shift !== e.shiftKey) return false;
  if (!!b.alt !== e.altKey) return false;
  return true;
}

export function findMatchingShortcut(e: KeyboardEvent): ShortcutId | null {
  const tabArmed = isTabChordActive();
  const map = loadShortcuts();
  for (const id of Object.keys(map) as ShortcutId[]) {
    if (eventMatchesShortcut(e, map[id], tabArmed)) return id;
  }
  return null;
}
