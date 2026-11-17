import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Puzzle,
  Plus,
  Trash2,
  X,
  Edit2,
  AlertTriangle,
  Power,
  Shield,
  Info,
} from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";

export interface Extension {
  id: string;
  name: string;
  urlPattern: string;
  code: string;
  enabled: boolean;
  createdAt: number;
  builtin?: boolean;
  blurb?: string;
}

export function ensureBuiltinExtensions(): Extension[] {
  const prev = getExtensionsRaw();
  const list = prev.filter(
    (e) =>
      e.id !== "pz-shield-ublock-lite" &&
      !(e.builtin && /ublock\s*lite/i.test(e.name || "")),
  );
  if (list.length !== prev.length) saveExtensions(list);
  try {
    sessionStorage.removeItem("pz-shield-hits");
  } catch {}
  return list;
}

function getExtensionsRaw(): Extension[] {
  try {
    return JSON.parse(localStorage.getItem("petezah-extensions") || "[]");
  } catch {
    return [];
  }
}

export function getExtensions(): Extension[] {
  return ensureBuiltinExtensions();
}

export function saveExtensions(exts: Extension[]) {
  try {
    localStorage.setItem("petezah-extensions", JSON.stringify(exts));
    requestSyncSoon();
    window.dispatchEvent(new Event("petezah-extensions-updated"));
  } catch {}
}

export function setExtensionEnabled(id: string, enabled: boolean) {
  const list = getExtensions().map((e) => (e.id === id ? { ...e, enabled } : e));
  saveExtensions(list);
  return list;
}

export function urlMatchesPattern(url: string, pattern: string): boolean {
  if (!pattern || !url) return false;
  try {
    let raw = url.trim();
    if (raw.startsWith("petezah://")) return false;
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const fullPath = parsed.pathname + parsed.search;

    let pat = pattern.trim();
    if (pat === "*" || pat === "*://*/*") return true;
    pat = pat.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "");

    let hostPat = pat;
    let pathPat = "/*";
    const slashIdx = pat.indexOf("/");
    if (slashIdx >= 0) {
      hostPat = pat.slice(0, slashIdx) || "*";
      pathPat = pat.slice(slashIdx) || "/*";
    }

    hostPat = hostPat.toLowerCase();
    if (hostPat.startsWith("*.")) {
      const domain = hostPat.slice(2);
      if (!(host === domain || host.endsWith("." + domain))) return false;
    } else if (hostPat.includes("*")) {
      const re = new RegExp(
        "^" + hostPat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$",
        "i"
      );
      if (!re.test(host)) return false;
    } else if (host !== hostPat) {
      return false;
    }

    if (!pathPat || pathPat === "/*" || pathPat === "*" || pathPat === "/") return true;
    const pathRe = new RegExp(
      "^" + pathPat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*"),
      "i"
    );
    return pathRe.test(fullPath);
  } catch {
    return false;
  }
}

export function runExtensionsOnFrame(iframe: HTMLIFrameElement | null | undefined, pageUrl: string) {
  if (!iframe || !pageUrl || pageUrl.startsWith("petezah://")) return;
  if (localStorage.getItem("extensionsEnabled") === "false") return;
  const matches = getExtensions().filter(
    (e) => e.enabled && e.code && !e.builtin && urlMatchesPattern(pageUrl, e.urlPattern)
  );
  if (!matches.length) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) return;
    const ran = (iframe as any).__pzExtRan as Set<string> | undefined;
    const set: Set<string> = ran || new Set();
    (iframe as any).__pzExtRan = set;
    const urlKey = pageUrl.split("#")[0];
    for (const ext of matches) {
      const stamp = `${ext.id}::${urlKey}`;
      if (set.has(stamp)) continue;
      if (!isSafeCode(ext.code).safe) continue;
      const script = doc.createElement("script");
      script.setAttribute("data-pz-ext", ext.id);
      script.textContent = `(function(){try{\n${ext.code}\n}catch(err){console.error("[PeteZah extension]",err);}})();`;
      (doc.head || doc.documentElement).appendChild(script);
      set.add(stamp);
    }
  } catch {}
}

const BLOCKED_PATTERNS = [
  /document\.cookie/i,
  /localStorage\.(setItem|removeItem|clear)/i,
  /fetch\s*\(/i,
  /XMLHttpRequest/i,
  /eval\s*\(/i,
  /window\.location\s*=/i,
  /document\.write\s*\(/i,
  /\.innerHTML\s*=/i,
  /\.outerHTML\s*=/i,
  /import\s*\(/i,
  /require\s*\(/i,
  /new\s+Function/i,
  /setTimeout.*Function/i,
];

function isSafeCode(code: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

const S = {
  surface: "hsla(216, 26%, 9%, 0.84)",
  elevated: "hsla(216, 22%, 12%, 0.9)",
  border: "hsl(216 20% 16%)",
  borderFocus: "hsl(213 60% 40%)",
  accent: "hsl(213 70% 58%)",
  accentDim: "hsl(213 50% 40% / 0.3)",
  text: "hsl(0 0% 96%)",
  textSub: "hsl(216 15% 55%)",
  textMuted: "hsl(216 12% 40%)",
  danger: "hsl(0 60% 56%)",
  warn: "hsl(38 90% 58%)",
  success: "hsl(145 45% 52%)",
};

function ExtModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Partial<Extension> | "new";
  onSave: (ext: Extension) => void;
  onClose: () => void;
}) {
  const base = initial === "new" ? {} : initial;
  const [name, setName] = useState(base.name || "");
  const [urlPattern, setUrlPattern] = useState(base.urlPattern || "*://*/*");
  const [code, setCode] = useState(base.code || "");
  const [safetyErr, setSafetyErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCode(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const check = isSafeCode(code);
    if (!check.safe) {
      setSafetyErr(check.reason || "Unsafe code");
      return;
    }
    onSave({
      id: base.id || `ext-${Date.now()}`,
      name: name.trim(),
      urlPattern: urlPattern.trim() || "*://*/*",
      code,
      enabled: base.enabled !== false,
      createdAt: base.createdAt || Date.now(),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "hsla(220, 40%, 4%, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 16,
          background: S.surface,
          border: `1px solid ${S.border}`,
          backdropFilter: "blur(16px)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: S.text }}>
            {base.id ? "Edit extension" : "New extension"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: S.textMuted, cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
        <label style={{ fontSize: 10, fontWeight: 600, color: S.textMuted, letterSpacing: "0.06em" }}>
          NAME
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: "9px 11px",
              borderRadius: 8,
              border: `1px solid ${S.border}`,
              background: S.elevated,
              color: S.text,
              fontSize: 12,
            }}
          />
        </label>
        <label style={{ fontSize: 10, fontWeight: 600, color: S.textMuted, letterSpacing: "0.06em" }}>
          MATCH PATTERN
          <input
            value={urlPattern}
            onChange={(e) => setUrlPattern(e.target.value)}
            placeholder="*://*.example.com/*"
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: "9px 11px",
              borderRadius: 8,
              border: `1px solid ${S.border}`,
              background: S.elevated,
              color: S.text,
              fontSize: 12,
              fontFamily: "monospace",
            }}
          />
        </label>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: S.textMuted, letterSpacing: "0.06em" }}>
              JAVASCRIPT
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{ background: "none", border: "none", color: S.accent, fontSize: 10, cursor: "pointer" }}
            >
              Upload .js
            </button>
            <input ref={fileRef} type="file" accept=".js,.txt" style={{ display: "none" }} onChange={handleFile} />
          </div>
          <textarea
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setSafetyErr("");
            }}
            rows={8}
            style={{
              width: "100%",
              padding: "9px 11px",
              borderRadius: 8,
              border: `1px solid ${safetyErr ? S.danger : S.border}`,
              background: S.elevated,
              color: S.text,
              fontSize: 11,
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
          {safetyErr ? (
            <div
              style={{
                marginTop: 6,
                display: "flex",
                gap: 6,
                alignItems: "center",
                color: S.danger,
                fontSize: 11,
              }}
            >
              <AlertTriangle size={11} /> {safetyErr}
            </div>
          ) : null}
        </div>
        <p style={{ margin: 0, fontSize: 10, color: S.textMuted, lineHeight: 1.45 }}>
          User scripts run in the webpage's context. Network APIs, cookies, storage writes, and eval are blocked.
        </p>
        <button
          type="button"
          onClick={handleSave}
          style={{
            padding: "10px 14px",
            borderRadius: 9,
            border: `1px solid ${S.borderFocus}`,
            background: S.accentDim,
            color: S.accent,
            fontWeight: 650,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Save
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function ExtensionsPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [extensions, setExtensions] = useState<Extension[]>(() => ensureBuiltinExtensions());
  const [rivetExts, setRivetExts] = useState<
    { id: string; name: string; version: string; enabled: boolean; iconUrl?: string | null }[]
  >([]);
  const [editing, setEditing] = useState<Partial<Extension> | null | "new">(null);
  const [installBusy, setInstallBusy] = useState(false);
  const crxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setExtensions(getExtensions());
    window.addEventListener("petezah-extensions-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("petezah-extensions-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const refresh = async () => {
      try {
        const { ensureRivet } = await import("@/lib/rivet/host");
        const rivet = await ensureRivet();
        setRivetExts(
          rivet.getInstalledExtensions().map((e) => ({
            id: e.id,
            name: e.name,
            version: e.version || "",
            enabled: e.enabled,
            iconUrl: e.iconUrl,
          })),
        );
        unsub ??= rivet.onChange(() => {
          void refresh();
        });
      } catch {}
    };
    void refresh();
    window.addEventListener("rivet-ready", refresh);
    return () => {
      window.removeEventListener("rivet-ready", refresh);
      unsub?.();
    };
  }, []);

  function save(ext: Extension) {
    const updated = extensions.some((e) => e.id === ext.id)
      ? extensions.map((e) => (e.id === ext.id ? ext : e))
      : [...extensions, ext];
    setExtensions(updated);
    saveExtensions(updated);
    setEditing(null);
  }

  function remove(id: string) {
    const updated = extensions.filter((e) => e.id !== id);
    setExtensions(updated);
    saveExtensions(updated);
  }

  function toggle(id: string) {
    const updated = extensions.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
    setExtensions(updated);
    saveExtensions(updated);
  }

  async function toggleRivet(id: string, enabled: boolean) {
    try {
      const { ensureRivet } = await import("@/lib/rivet/host");
      const rivet = await ensureRivet();
      await rivet.setExtensionEnabled(id, !enabled);
    } catch {}
  }

  async function uninstallRivet(id: string) {
    try {
      const { ensureRivet } = await import("@/lib/rivet/host");
      const rivet = await ensureRivet();
      await rivet.uninstallExtension(id);
    } catch {}
  }

  async function onCrxPicked(file: File | null) {
    if (!file) return;
    setInstallBusy(true);
    try {
      const { ensureRivet } = await import("@/lib/rivet/host");
      const rivet = await ensureRivet();
      await rivet.installExtension(await file.arrayBuffer(), file.name || "extension.crx");
    } catch (e) {
      console.warn("[rivet] install failed", e);
    } finally {
      setInstallBusy(false);
      if (crxRef.current) crxRef.current.value = "";
    }
  }

  const active = rivetExts.filter((e) => e.enabled).length + extensions.filter((e) => e.enabled).length;

  return (
    <div className="extensions-page" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "transparent" }}>
      <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", flexDirection: "column" }}>
        <div
          className="page-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 28px 14px",
            flexShrink: 0,
            borderBottom: `1px solid ${S.border}`,
            background: "hsla(216, 30%, 8%, 0.62)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "hsl(213 50% 40% / 0.25)",
                border: "1px solid hsl(213 60% 40% / 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Puzzle size={16} style={{ color: S.accent }} />
            </div>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>Extensions</h1>
              <p style={{ fontSize: 11, color: S.textSub, margin: 0 }}>
                {active} active · Chrome CRX + user scripts
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={installBusy}
              onClick={() => crxRef.current?.click()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 14px",
                background: S.accentDim,
                border: `1px solid ${S.borderFocus}`,
                borderRadius: 8,
                color: S.accent,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                opacity: installBusy ? 0.6 : 1,
              }}
            >
              <Plus size={13} /> {installBusy ? "Installing…" : "Install CRX"}
            </button>
            <input
              ref={crxRef}
              type="file"
              accept=".crx,.zip"
              style={{ display: "none" }}
              onChange={(e) => void onCrxPicked(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => setEditing("new")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 14px",
                background: "transparent",
                border: `1px solid ${S.border}`,
                borderRadius: 8,
                color: S.textSub,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={13} /> Add script
            </button>
          </div>
        </div>

        <div
          className="page-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 28px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${S.border}`,
              background: "hsla(216, 26%, 9%, 0.55)",
              color: S.textSub,
              fontSize: 11,
              lineHeight: 1.45,
            }}
          >
            <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: S.accent }} />
            <span>
              Browser extensions (including a real privacy filter) run inside the tab runtime on web
              pages only. They are not installed on your Chromebook. Optional. Does not override district or employer
              policies.
            </span>
          </div>

          {rivetExts.map((ext) => (
            <div
              key={`rivet-${ext.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 14,
                border: `1px solid ${S.border}`,
                background: "hsla(216, 26%, 9%, 0.72)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: ext.enabled ? "hsla(145, 45%, 40%, 0.18)" : S.elevated,
                  border: `1px solid ${ext.enabled ? "hsla(145, 45%, 45%, 0.35)" : S.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {ext.iconUrl ? (
                  <img src={ext.iconUrl} alt="" width={20} height={20} style={{ borderRadius: 4 }} />
                ) : (
                  <Shield size={16} style={{ color: ext.enabled ? S.success : S.textMuted }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 650, color: S.text }}>{ext.name}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: 99,
                      background: "hsla(145, 40%, 40%, 0.18)",
                      color: S.success,
                    }}
                  >
                    CRX
                  </span>
                  {ext.version ? (
                    <span style={{ fontSize: 10, color: S.textMuted }}>v{ext.version}</span>
                  ) : null}
                </div>
                <p style={{ margin: "3px 0 0", fontSize: 11, color: S.textSub, lineHeight: 1.4 }}>
                  Browser extension · runs on open tabs
                </p>
              </div>
              <button
                type="button"
                title={ext.enabled ? "Disable" : "Enable"}
                onClick={() => void toggleRivet(ext.id, ext.enabled)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: `1px solid ${ext.enabled ? S.borderFocus : S.border}`,
                  background: ext.enabled ? S.accentDim : "transparent",
                  color: ext.enabled ? S.accent : S.textMuted,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Power size={13} />
              </button>
              <button
                type="button"
                onClick={() => void uninstallRivet(ext.id)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: `1px solid ${S.border}`,
                  background: "transparent",
                  color: S.danger,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {extensions.map((ext) => (
            <div
              key={ext.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 14,
                border: `1px solid ${S.border}`,
                background: "hsla(216, 26%, 9%, 0.72)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: ext.enabled ? "hsla(213, 55%, 40%, 0.22)" : S.elevated,
                  border: `1px solid ${ext.enabled ? "hsla(213, 60%, 45%, 0.35)" : S.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Puzzle size={16} style={{ color: ext.enabled ? S.accent : S.textMuted }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 650, color: S.text }}>{ext.name}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: 99,
                      background: "hsla(213, 40%, 40%, 0.18)",
                      color: S.accent,
                    }}
                  >
                    Script
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: 11, color: S.textSub, lineHeight: 1.4 }}>
                  {ext.blurb || ext.urlPattern}
                </p>
              </div>
              <button
                type="button"
                title={ext.enabled ? "Disable" : "Enable"}
                onClick={() => toggle(ext.id)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: `1px solid ${ext.enabled ? S.borderFocus : S.border}`,
                  background: ext.enabled ? S.accentDim : "transparent",
                  color: ext.enabled ? S.accent : S.textMuted,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Power size={13} />
              </button>
              <button
                type="button"
                onClick={() => setEditing(ext)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: `1px solid ${S.border}`,
                  background: "transparent",
                  color: S.textSub,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Edit2 size={12} />
              </button>
              <button
                type="button"
                onClick={() => remove(ext.id)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: `1px solid ${S.border}`,
                  background: "transparent",
                  color: S.danger,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {editing ? (
          <ExtModal initial={editing} onSave={save} onClose={() => setEditing(null)} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
