import { useMemo, useState, useEffect, useRef, type RefObject, type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Image,
  Server,
  Zap,
} from "lucide-react";
import {
  SITE_THEMES,
  SEARCH_ENGINES,
  UA_PRESETS,
  themeById,
  applyBrowserIdentity,
  resolveUserAgent,
} from "@/lib/siteThemes";
import { applyVpnRegion } from "@/lib/vpn";
import { PX } from "@/lib/px";
import { originWsHost } from "@/lib/siteOrigin";
import { hrefs, marks } from "@/lib/uiMarks";
import ObfuscatedText from "./ObfuscatedText";
import { RAIN_SCENES, normalizeRainScene, rainSceneThumb } from "@/lib/rainScenes";
import { BG_EFFECTS, normalizeBgEffect } from "@/lib/bgEffects";
import { youtubeThumb, SPIRIT_TREE_VIDEO_ID, LIGHTNING_VIDEO_ID } from "@/components/effects/YoutubeWallpaperBackdrop";
import {
  SHORTCUT_META,
  DEFAULT_SHORTCUTS,
  loadShortcuts,
  saveShortcuts,
  formatShortcut,
  type ShortcutId,
} from "@/lib/shortcuts";

type C = {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  borderFocus: string;
  accent: string;
  accentDim: string;
  text: string;
  textSub: string;
  textMuted: string;
  danger: string;
  success: string;
};

type Props = {
  C: C;
  s: Record<string, string>;
  setS: (next: Record<string, string>) => void;
  setVal: (k: string, v: string) => void;
  toggle: (k: string) => void;
  applySettings: () => void;
  settingsSaved: boolean;
  applySettingsNow: (s: Record<string, string>) => void;
  bgImgRef: RefObject<HTMLInputElement | null>;
  openAboutBlank: () => void;
};

function ApplyBtn({ C, saved, onClick }: { C: C; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "7px",
        padding: "8px 16px",
        borderRadius: 999,
        marginTop: "18px",
        background: saved ? "transparent" : "hsla(210, 40%, 70%, 0.12)",
        border: `1px solid ${saved ? C.success : C.borderFocus}`,
        color: saved ? C.success : C.text,
        fontSize: "12px",
        fontWeight: 560,
        cursor: "pointer",
        transition: "all 0.2s",
        fontFamily: "inherit",
        letterSpacing: "-0.01em",
      }}
    >
      {saved ? <Check size={13} /> : <Zap size={13} />}
      {saved ? "Applied!" : "Apply Settings"}
    </button>
  );
}

function ToggleRow({
  C,
  label,
  desc,
  checked,
  onChange,
  badge,
}: {
  C: C;
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        width: "100%",
        padding: "12px 14px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 7 }}>
          {label}
          {badge ? (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 999,
                color: "hsla(45, 90%, 72%, 0.95)",
                background: "hsla(45, 80%, 45%, 0.16)",
                border: "1px solid hsla(45, 80%, 50%, 0.3)",
              }}
            >
              {badge}
            </span>
          ) : null}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 10, color: C.textSub, lineHeight: 1.4 }}>{desc}</p>
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 99,
          padding: 2,
          flexShrink: 0,
          background: checked ? "hsla(210, 40%, 55%, 0.55)" : C.elevated,
          border: `1px solid ${C.border}`,
          transition: "background 0.15s",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#fff",
            transform: checked ? "translateX(16px)" : "translateX(0)",
            transition: "transform 0.15s",
          }}
        />
      </div>
    </button>
  );
}

function FancySelect({
  C,
  value,
  onChange,
  options,
}: {
  C: C;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; swatch?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.id === value) || options[0];
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 999,
          background: "hsla(220, 28%, 11%, 0.62)",
          border: `1px solid ${open ? C.borderFocus : C.border}`,
          color: C.text,
          cursor: "pointer",
          backdropFilter: "blur(10px)",
          boxShadow: open ? "0 0 0 3px hsla(210, 40%, 60%, 0.08)" : "inset 0 1px 0 hsla(0,0%,100%,0.04)",
          fontFamily: "inherit",
        }}
      >
        {active?.swatch && (
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 99,
              background: active.swatch,
              border: `1px solid ${C.border}`,
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 560, letterSpacing: "-0.01em" }}>{active?.label}</span>
        <ChevronDown size={14} style={{ color: C.textMuted, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 40,
            borderRadius: 16,
            overflow: "hidden",
            background: "hsla(220, 30%, 8%, 0.82)",
            border: `1px solid ${C.border}`,
            boxShadow: "0 18px 40px rgba(0,0,0,0.4)",
            backdropFilter: "blur(16px)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {options.map((o) => {
            const on = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: on ? "hsla(210, 40%, 70%, 0.1)" : "transparent",
                  border: "none",
                  color: on ? C.text : C.textSub,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: on ? 600 : 450,
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                {o.swatch && (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 99,
                      background: o.swatch,
                      border: `1px solid ${C.border}`,
                    }}
                  />
                )}
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppearanceSettings(props: Props) {
  const { C, s, setS, applySettings, settingsSaved, applySettingsNow, bgImgRef } = props;
  const themeOpts = SITE_THEMES.map((t) => ({ id: t.id, label: t.label, swatch: t.bg }));
  const effect = normalizeBgEffect(s.bgEffect || (s.rainBackdrop === "true" ? "rain" : "fog"));
  const theme = themeById(s.theme);

  const patch = (partial: Record<string, string>) => {
    const next = { ...s, ...partial };
    if (partial.bgEffect) {
      next.rainBackdrop = partial.bgEffect === "rain" ? "true" : "false";
    }
    setS(next);
    applySettingsNow(next);
  };

  const previewBg =
    effect === "stars"
      ? "radial-gradient(ellipse at 50% 80%, #1a2240 0%, #02040a 70%)"
      : effect === "sakura"
        ? `linear-gradient(180deg, hsla(220,30%,4%,0.4), hsla(220,25%,2%,0.55)), url(${youtubeThumb(SPIRIT_TREE_VIDEO_ID) || "/fx/sakura/tree.jpg"}) center/cover`
        : effect === "lightning"
          ? `linear-gradient(180deg, hsla(48,60%,12%,0.25), hsla(220,25%,2%,0.6)), url(${youtubeThumb(LIGHTNING_VIDEO_ID)}) center/cover`
          : effect === "rain"
            ? `url(${rainSceneThumb(normalizeRainScene(s.rainScene))}) center/cover`
            : s.backgroundImage
              ? `url(${s.backgroundImage}) center/cover`
              : `radial-gradient(ellipse 70% 60% at 50% 40%, ${theme.accent}33, transparent 70%), ${s.backgroundColor || theme.bg}`;

  const sectionLabel: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: C.textMuted,
    margin: "0 0 10px",
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Appearance</h2>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 18px", lineHeight: 1.45 }}>
        Choose an effect, then tune its base color, scene, or your own image.
      </p>

      <div
        style={{
          height: 132,
          borderRadius: 16,
          marginBottom: 20,
          overflow: "hidden",
          position: "relative",
          border: `1px solid ${C.border}`,
          background: previewBg,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              effect === "fog"
                ? "linear-gradient(180deg, transparent 40%, hsla(210,40%,6%,0.55))"
                : "linear-gradient(180deg, transparent 50%, hsla(220,30%,4%,0.5))",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "hsla(0,0%,100%,0.78)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {BG_EFFECTS.find((e) => e.id === effect)?.label || "Backdrop"}
          </span>
          <span style={{ fontSize: 10, color: "hsla(0,0%,100%,0.45)" }}>
            {BG_EFFECTS.find((e) => e.id === effect)?.pair}
          </span>
        </div>
      </div>

      <p style={sectionLabel}>1 · Effect</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {BG_EFFECTS.map((item) => {
          const active = effect === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                patch({
                  bgEffect: item.id,
                  ...(item.id === "rain" ? { rainScene: normalizeRainScene(s.rainScene || "harbor") } : {}),
                  ...(item.id === "stars" ? { backgroundColor: "#02040a" } : {}),
                  ...(item.id === "sakura" ? { backgroundColor: "#0a1210" } : {}),
                  ...(item.id === "lightning" ? { backgroundColor: "#0a0c08" } : {}),
                })
              }
              style={{
                textAlign: "left",
                padding: "12px 12px 11px",
                borderRadius: 12,
                cursor: "pointer",
                border: `1px solid ${active ? C.borderFocus : C.border}`,
                background: active ? "hsla(210, 40%, 70%, 0.08)" : "hsla(220, 28%, 11%, 0.62)",
                boxShadow: active ? `inset 0 0 0 1px ${item.accent}33` : "none",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: item.accent,
                    boxShadow: `0 0 10px ${item.accent}66`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 650, color: C.text }}>{item.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 10, lineHeight: 1.4, color: C.textMuted }}>{item.blurb}</p>
            </button>
          );
        })}
      </div>

      {effect === "rain" && (
        <>
          <p style={sectionLabel}>2 · Rain scene</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {RAIN_SCENES.map((scene) => {
              const active = normalizeRainScene(s.rainScene) === scene.id;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => patch({ rainScene: scene.id, bgEffect: "rain", rainBackdrop: "true" })}
                  style={{
                    padding: 0,
                    borderRadius: 11,
                    overflow: "hidden",
                    cursor: "pointer",
                    border: `1.5px solid ${active ? C.borderFocus : C.border}`,
                    background: C.surface,
                    boxShadow: active ? `0 0 0 1px ${C.accent}44` : "none",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <img
                    src={rainSceneThumb(scene.id)}
                    alt=""
                    width={320}
                    height={180}
                    style={{ display: "block", width: "100%", height: 68, objectFit: "cover" }}
                  />
                  <span
                    style={{
                      display: "block",
                      padding: "7px 8px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: active ? C.text : C.textSub,
                    }}
                  >
                    {scene.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {effect === "fog" && (
        <>
          <p style={sectionLabel}>2 · Fog options</p>
          <div
            style={{
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              overflow: "hidden",
              background: "hsla(220, 28%, 11%, 0.68)",
              marginBottom: 20,
            }}
          >
            <div style={{ borderBottom: `1px solid ${C.border}` }}>
              <ToggleRow
                C={C}
                label="Network mesh"
                desc="Soft line overlay on the fog"
                checked={s.bgNetwork === "true"}
                onChange={() =>
                  patch({ bgNetwork: s.bgNetwork === "true" ? "false" : "true" })
                }
              />
            </div>
            <ToggleRow
              C={C}
              label="Low-power motion"
              desc="Slower Vanta for weaker devices"
              checked={s.lowPowerBg === "true"}
              onChange={() => patch({ lowPowerBg: s.lowPowerBg === "true" ? "false" : "true" })}
            />
          </div>
        </>
      )}

      {effect !== "rain" && effect !== "stars" && (
        <>
          <p style={sectionLabel}>
            {effect === "fog" ? "3" : "2"} · Base color & image
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 20,
              padding: 14,
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              background: "hsla(220, 28%, 11%, 0.68)",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  color: C.textMuted,
                }}
              >
                Color
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    position: "relative",
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: `1px solid ${C.border}`,
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(s.backgroundColor || "") ? s.backgroundColor : "#041018"}
                    onChange={(e) => patch({ backgroundColor: e.target.value, backgroundImage: "" })}
                    style={{
                      position: "absolute",
                      inset: -4,
                      width: "calc(100% + 8px)",
                      height: "calc(100% + 8px)",
                      cursor: "pointer",
                      border: "none",
                      padding: 0,
                    }}
                  />
                </div>
                <input
                  type="text"
                  value={s.backgroundColor || ""}
                  onChange={(e) => props.setVal("backgroundColor", e.target.value)}
                  onBlur={() => applySettingsNow({ ...s, backgroundImage: "" })}
                  style={{
                    flex: 1,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    color: C.text,
                    fontSize: 12,
                    padding: "8px 10px",
                    outline: "none",
                    fontFamily: "monospace",
                  }}
                />
              </div>
            </div>

            {(effect === "solid" || effect === "sakura" || effect === "snow" || effect === "fog") && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 6,
                    color: C.textMuted,
                  }}
                >
                  Your image
                </label>
                <input
                  ref={bgImgRef as any}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2_500_000) {
                      alert("Please use an image under 2.5MB.");
                      e.target.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const data = String(ev.target?.result || "");
                      if (!data.startsWith("data:image/")) return;
                      patch({
                        backgroundImage: data,
                        backgroundColor: s.backgroundColor || theme.bg,
                        bgEffect: effect === "fog" ? "solid" : effect,
                      });
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => bgImgRef.current?.click()}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 12px",
                      borderRadius: 8,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      color: C.textSub,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <Image size={12} />
                    {s.backgroundImage ? "Change image" : "Upload image"}
                  </button>
                  {s.backgroundImage && (
                    <button
                      onClick={() => patch({ backgroundImage: "" })}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: "transparent",
                        border: `1px solid hsl(0 60% 50% / 0.2)`,
                        color: C.danger,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <p style={sectionLabel}>Chrome palette</p>
      <FancySelect
        C={C}
        value={s.theme || "default"}
        options={themeOpts}
        onChange={(id) => {
          const t = themeById(id);
          patch({
            theme: id,
            backgroundColor:
              effect === "stars"
                ? "#02040a"
                : effect === "sakura"
                  ? "#0a1210"
                  : effect === "lightning"
                    ? "#0a0c08"
                    : t.bg,
          });
        }}
      />

      <ApplyBtn C={C} saved={settingsSaved} onClick={applySettings} />
    </div>
  );
}

export function BehaviorSettings(props: Props) {
  const { C, s, setS, toggle, applySettings, settingsSaved, openAboutBlank, setVal, applySettingsNow } = props;
  return (
    <div style={{ maxWidth: 460 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Behavior</h2>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 18px" }}>Session habits and gamer-facing extras</p>

      <div style={{ borderRadius: 18, border: `1px solid ${C.border}`, background: "hsla(220, 28%, 11%, 0.68)", overflow: "hidden", backdropFilter: "blur(12px)" }}>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow C={C} label="Exit warning" desc="Ask before closing the tab" checked={s.beforeUnload === "true"} onChange={() => toggle("beforeUnload")} />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Autocloak"
            desc="Open in a cloaked blob:/about:blank window and leave Classroom in the original tab"
            checked={s.autocloak === "true"}
            onChange={() => {
              const next = s.autocloak !== "true";
              setVal("autocloak", next ? "true" : "false");
              localStorage.setItem("autocloak", next ? "true" : "false");
              if (next) {
                if (!localStorage.getItem("linkCloaking") || localStorage.getItem("linkCloaking") === "none") {
                  localStorage.setItem("linkCloaking", "blob:");
                  setVal("linkCloaking", "blob:");
                }
                openAboutBlank();
              }
            }}
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: C.text, marginBottom: 4 }}>Link cloak mode</div>
          <div style={{ fontSize: 10, color: C.textSub, marginBottom: 8 }}>How autocloak / #blank wraps the session</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "blob:", label: "blob: (stronger)" },
              { id: "about:blank", label: "about:blank" },
              { id: "none", label: "Off" },
            ].map((opt) => {
              const active = (s.linkCloaking || "none") === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setVal("linkCloaking", opt.id);
                    localStorage.setItem("linkCloaking", opt.id);
                    if (opt.id === "none") {
                      setVal("autocloak", "false");
                      localStorage.setItem("autocloak", "false");
                    }
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1px solid ${active ? C.borderFocus : C.border}`,
                    background: active ? C.accentDim : "transparent",
                    color: active ? C.accent : C.textSub,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow C={C} label="Block right-click" desc="Disable the page context menu" checked={s.disableRightClick === "true"} onChange={() => toggle("disableRightClick")} />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Horizontal tabs"
            desc="Chrome-style tabs above the toolbar"
            checked={s.horizontalTabs === "true"}
            onChange={() => {
              const next = s.horizontalTabs === "true" ? "false" : "true";
              const ns = { ...s, horizontalTabs: next };
              setS(ns);
              applySettingsNow(ns);
            }}
            badge="Beta"
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Trending homescreen"
            desc="Open the Trending dashboard instead of petezah://newtab"
            checked={s.trendingHomescreen === "true"}
            onChange={() => {
              const next = s.trendingHomescreen === "true" ? "false" : "true";
              const ns = { ...s, trendingHomescreen: next };
              setS(ns);
              applySettingsNow(ns);
            }}
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Search edge glow"
            desc="Trace animation around the homepage search bar every few seconds"
            checked={s.searchEdgeGlow !== "false"}
            onChange={() => {
              const next = s.searchEdgeGlow === "false" ? "true" : "false";
              const ns = { ...s, searchEdgeGlow: next };
              setS(ns);
              applySettingsNow(ns);
            }}
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Perf overlay"
            desc="Pin FPS, nav timing, and heap above the status bar"
            checked={s.debugHud === "true"}
            onChange={() => toggle("debugHud")}
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Game focus mode"
            desc="Dim chrome chrome while a game tab is active"
            checked={s[hrefs.gf()] === "true"}
            onChange={() => toggle(hrefs.gf())}
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Quick-relaunch"
            desc="Remember last game and offer relaunch on new tab"
            checked={s.quickRelaunch === "true"}
            onChange={() => toggle("quickRelaunch")}
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Recent plays"
            desc="Show recently played games on the games page"
            checked={s.recentPlays === "true"}
            onChange={() => {
              const next = s.recentPlays === "true" ? "false" : "true";
              const ns = { ...s, recentPlays: next };
              setS(ns);
              applySettingsNow(ns);
            }}
          />
        </div>
      </div>

      <div style={{ height: 1, background: C.border, margin: "18px 0 14px" }} />
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
        About:Blank
      </p>
      <button
        onClick={openAboutBlank}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 16px",
          borderRadius: 8,
          background: C.accentDim,
          border: `1px solid ${C.borderFocus}`,
          color: C.text,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <ExternalLink size={12} />
        Open in about:blank
      </button>
      <ApplyBtn C={C} saved={settingsSaved} onClick={applySettings} />
    </div>
  );
}

export function ShortcutsSettings({ C }: { C: C }) {
  const [map, setMap] = useState(() => loadShortcuts());
  const [listening, setListening] = useState<ShortcutId | null>(null);
  const tabArmedRef = useRef(false);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Tab") {
        tabArmedRef.current = true;
        return;
      }
      if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      const next = {
        ...map,
        [listening]: {
          key: key === "+" ? "=" : key.slice(0, 1) || key,
          tab: tabArmedRef.current || !(e.metaKey || e.ctrlKey),
          ctrl: e.metaKey || e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
        },
      };
      tabArmedRef.current = false;
      setMap(next);
      saveShortcuts(next);
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, map]);

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Shortcuts</h2>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 16px" }}>
        Defaults use Tab chords (press Tab, then a key) so they do not fight the browser. Click a row, press Tab, then the key.
      </p>
      <div style={{ borderRadius: 18, border: `1px solid ${C.border}`, background: "hsla(220, 28%, 11%, 0.68)", overflow: "hidden", backdropFilter: "blur(12px)" }}>
        {SHORTCUT_META.map((row, i) => (
          <button
            key={row.id}
            type="button"
            onClick={() => { tabArmedRef.current = false; setListening(row.id); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "12px 14px",
              background: listening === row.id ? "hsla(210, 50%, 50%, 0.1)" : "transparent",
              border: "none",
              borderBottom: i < SHORTCUT_META.length - 1 ? `1px solid ${C.border}` : "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.text }}>{row.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>{row.desc}</p>
            </div>
            <kbd
              style={{
                fontSize: 10,
                fontFamily: "ui-monospace, monospace",
                padding: "4px 8px",
                borderRadius: 7,
                border: `1px solid ${listening === row.id ? C.borderFocus : C.border}`,
                background: C.elevated,
                color: listening === row.id ? C.accent : C.textSub,
                whiteSpace: "nowrap",
              }}
            >
              {listening === row.id ? "Tab then key…" : formatShortcut(map[row.id])}
            </kbd>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const next = { ...DEFAULT_SHORTCUTS };
          setMap(next);
          saveShortcuts(next);
          setListening(null);
        }}
        style={{
          marginTop: 14,
          padding: "8px 14px",
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          background: "transparent",
          color: C.textSub,
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        Reset to defaults
      </button>
    </div>
  );
}

export function ProxySettings(props: Props) {
  const { C, s, setS, setVal, applySettings, settingsSaved, applySettingsNow, toggle } = props;
  const defaultRelay = useMemo(() => `${originWsHost()}${PX.stream}`, []);

  const uaPreview = resolveUserAgent();
  const eng = SEARCH_ENGINES.find((e) => e.id === (s.searchEngine || "ddg")) || SEARCH_ENGINES[0];
  const groups = Array.from(new Set(UA_PRESETS.map((p) => p.group)));

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
        <ObfuscatedText as="span">{marks.d()}</ObfuscatedText>
      </h2>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 18px", lineHeight: 1.45 }}>
        Tunnel endpoint, search, identity, and small quality-of-life switches for the browser shell.
      </p>

      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
        Custom relay
      </p>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 8px", lineHeight: 1.45 }}>
        Default endpoint is shown below. Setting a custom server adds it as your preferred VPN option.
      </p>
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: C.surface,
          border: `1px solid ${C.border}`,
          marginBottom: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          color: C.textSub,
          wordBreak: "break-all",
        }}
      >
        Default · {defaultRelay}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Server size={12} style={{ position: "absolute", left: 10, top: 11, color: C.textMuted }} />
          <input
            value={s.proxServer || ""}
            onChange={(e) => setVal("proxServer", e.target.value)}
            placeholder={defaultRelay}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "9px 10px 9px 30px",
              borderRadius: 8,
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.text,
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const raw = (s.proxServer || "").trim();
            if (!raw) {
              localStorage.removeItem("proxServer");
              const next = { ...s, proxServer: "" };
              setS(next);
              applySettingsNow(next);
              applyVpnRegion("default");
              return;
            }
            if (!/^wss?:\/\//i.test(raw) || !raw.endsWith("/")) {
              alert("Use a full wss://…/ or ws://…/ URL ending with /");
              return;
            }
            try {
              const u = new URL(raw);
              if (u.protocol !== "wss:" && u.protocol !== "ws:") throw new Error("bad");
            } catch {
              alert("Invalid websocket URL");
              return;
            }
            localStorage.setItem("proxServer", raw);
            const next = { ...s, proxServer: raw };
            setS(next);
            applySettingsNow(next);
            applyVpnRegion("custom");
          }}
          style={{
            padding: "9px 12px",
            borderRadius: 8,
            background: C.accentDim,
            border: `1px solid ${C.borderFocus}`,
            color: C.text,
            fontSize: 11,
            fontWeight: 650,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Save
        </button>
      </div>

      <div style={{ height: 1, background: C.border, margin: "18px 0" }} />

      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
        Search engine
      </p>
      <FancySelect
        C={C}
        value={s.searchEngine || "ddg"}
        options={SEARCH_ENGINES.map((e) => ({ id: e.id, label: e.label }))}
        onChange={(id) => {
          const next = { ...s, searchEngine: id };
          setS(next);
          applySettingsNow(next);
        }}
      />
      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          borderRadius: 10,
          background: C.surface,
          border: `1px solid ${C.border}`,
          fontSize: 11,
          color: C.textSub,
          wordBreak: "break-all",
        }}
      >
        Preview · {eng.template.replace("%s", "arcade+racing")}
      </div>

      <div style={{ height: 1, background: C.border, margin: "18px 0" }} />

      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 6px" }}>
        Browser identity
      </p>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 10px", lineHeight: 1.45 }}>
        Anchor keeps your real, consistent fingerprint. Veil presents a synthetic one kept aligned across JS and request headers.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { id: "mirror", title: "Anchor", sub: "real · coherent" },
          { id: "disguise", title: "Veil", sub: "synthetic · coherent" },
        ].map((opt) => {
          const on = (s.browserIdentity || "mirror") === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                const next = { ...s, browserIdentity: opt.id };
                setS(next);
                applySettingsNow(next);
                applyBrowserIdentity();
              }}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                textAlign: "left",
                cursor: "pointer",
                background: on ? "hsla(210, 28%, 40%, 0.16)" : C.surface,
                border: `1px solid ${on ? C.borderFocus : C.border}`,
                color: C.text,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>{opt.title}</div>
              <div style={{ fontSize: 10, color: C.textSub, marginTop: 3 }}>{opt.sub}</div>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 6px" }}>
        User agent
      </p>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 10px", lineHeight: 1.45 }}>
        Sent on proxied navigations and exposed via navigator.userAgent. Presets keep client hints in sync; a hand-typed string is sent literally. Some sites ship lighter layouts to TVs and consoles.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, maxHeight: 220, overflowY: "auto", paddingRight: 2 }}>
        {groups.map((g) => (
          <div key={g}>
            <p style={{ margin: "8px 0 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>
              {g}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {UA_PRESETS.filter((p) => p.group === g).map((p) => {
                const on = (s.uaPreset || "auto") === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const next = { ...s, uaPreset: p.id, customUserAgent: "" };
                      setS(next);
                      applySettingsNow(next);
                      applyBrowserIdentity();
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      textAlign: "left",
                      cursor: "pointer",
                      background: on ? "hsla(210, 28%, 40%, 0.16)" : C.surface,
                      border: `1px solid ${on ? C.borderFocus : C.border}`,
                      color: on ? C.text : C.textSub,
                      fontSize: 11,
                      fontWeight: on ? 650 : 500,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <input
        value={s.customUserAgent || ""}
        onChange={(e) => setVal("customUserAgent", e.target.value)}
        onBlur={() => {
          applySettingsNow(s);
          applyBrowserIdentity();
        }}
        placeholder="Optional custom UA string"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "9px 10px",
          borderRadius: 8,
          background: C.surface,
          border: `1px solid ${C.border}`,
          color: C.text,
          fontSize: 11,
          outline: "none",
          marginBottom: 8,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      />
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: C.surface,
          border: `1px solid ${C.border}`,
          fontSize: 10,
          color: C.textMuted,
          wordBreak: "break-all",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: 1.4,
          marginBottom: 14,
        }}
      >
        Preview · {uaPreview}
      </div>

      <div style={{ borderRadius: 18, border: `1px solid ${C.border}`, background: "hsla(220, 28%, 11%, 0.68)", overflow: "hidden", backdropFilter: "blur(12px)" }}>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Run extensions"
            desc="Allow userscripts from the Extensions page"
            checked={s.extensionsEnabled !== "false"}
            onChange={() => {
              const next = s.extensionsEnabled === "false" ? "true" : "false";
              const ns = { ...s, extensionsEnabled: next };
              setS(ns);
              applySettingsNow(ns);
            }}
          />
        </div>
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <ToggleRow
            C={C}
            label="Strip tracking params"
            desc="Drop common utm_ and click-id junk from pasted URLs"
            checked={s.stripTrackers === "true"}
            onChange={() => toggle("stripTrackers")}
          />
        </div>
        <ToggleRow
          C={C}
          label="Prefer HTTPS upgrades"
          desc="Rewrite plain http:// destinations to https when possible"
          checked={s.preferHttps === "true"}
          onChange={() => toggle("preferHttps")}
        />
      </div>

      <ApplyBtn C={C} saved={settingsSaved} onClick={applySettings} />
    </div>
  );
}
