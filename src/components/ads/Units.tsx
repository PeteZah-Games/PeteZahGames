import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

declare global {
  interface Window {
    reviq?: Array<(api: any) => void> | any;
  }
}

const HOST = ["js", "rev", "iq"].join(".");
const SITE = "petezahgames.com";

function ensureNet() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[data-pz-slot-net="1"]`)) return;
  const s = document.createElement("script");
  s.src = `//${HOST}/${SITE}`;
  s.async = true;
  s.defer = true;
  s.dataset.pzSlotNet = "1";
  document.head.appendChild(s);
  window.reviq = window.reviq || [];
}

export function bootSlotNet() {
  ensureNet();
}

function Label() {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "hsla(0,0%,100%,0.32)",
      }}
    >
      Ad
    </span>
  );
}

export function Slot({
  name,
  size,
  kv,
  style,
  className = "",
}: {
  name: string;
  size?: string;
  kv?: Record<string, string>;
  style?: CSSProperties;
  className?: string;
}) {
  useEffect(() => {
    ensureNet();
  }, []);
  const extra: Record<string, string> = {};
  if (size) extra["data-ad-size"] = size;
  if (kv) {
    for (const [k, v] of Object.entries(kv)) {
      if (k && v) extra[`data-kv-${k}`] = v;
    }
  }
  return <div className={className} style={style} data-ad={name} {...extra} />;
}

const shell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  gap: 6,
  padding: "8px 0 10px",
};

function DesktopOnly({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 900px)").matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const on = () => setShow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  if (!show) return null;
  return <>{children}</>;
}

function MobileOnly({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 899px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const on = () => setShow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  if (!show) return null;
  return <>{children}</>;
}

export function StickyAnchor() {
  useEffect(() => {
    ensureNet();
  }, []);
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ pointerEvents: "auto", maxWidth: "100%" }}>
        <Slot name="anchor" kv={{ surface: "shell" }} />
      </div>
    </div>
  );
}

export function AdResponsiveBanner({
  className = "",
  dense = false,
}: {
  className?: string;
  exo?: boolean;
  dense?: boolean;
}) {
  return (
    <div className={className} style={shell} data-pz-ad-slot="1">
      <Label />
      <DesktopOnly>
        <Slot name="billboard-1" style={{ width: "100%", minHeight: 90 }} kv={{ surface: "page" }} />
        <Slot name="leaderboard-1" style={{ width: "100%", minHeight: 70, marginTop: 6 }} kv={{ surface: "page" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            width: "100%",
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <Slot name="left-rail-1" style={{ minWidth: 160, minHeight: 250, flex: "1 1 160px", maxWidth: 320 }} />
          <Slot name="right-rail-1" style={{ minWidth: 160, minHeight: 250, flex: "1 1 160px", maxWidth: 320 }} />
          {dense ? (
            <>
              <Slot name="left-rail-2" style={{ minWidth: 160, minHeight: 250, flex: "1 1 160px", maxWidth: 320 }} />
              <Slot name="right-rail-2" style={{ minWidth: 160, minHeight: 250, flex: "1 1 160px", maxWidth: 320 }} />
            </>
          ) : null}
        </div>
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 100 }} kv={{ surface: "page" }} />
      </MobileOnly>
    </div>
  );
}

export function AdNativeBar() {
  return (
    <div style={{ ...shell, padding: "4px 0 8px" }} data-pz-ad-slot="1">
      <DesktopOnly>
        <Slot name="right-rail-2" style={{ width: "100%", minHeight: 200 }} kv={{ surface: "rail" }} />
      </DesktopOnly>
    </div>
  );
}

export function AdNativeBarAlt() {
  return (
    <div style={{ ...shell, padding: "2px 0 8px" }} data-pz-ad-slot="1">
      <DesktopOnly>
        <Slot name="left-rail-2" style={{ width: "100%", minHeight: 180 }} kv={{ surface: "rail" }} />
      </DesktopOnly>
      <MobileOnly>
        <Slot name="mobile-unit-1" style={{ width: "100%", minHeight: 80 }} kv={{ surface: "rail" }} />
      </MobileOnly>
    </div>
  );
}

export function LoaderSlots() {
  useEffect(() => {
    ensureNet();
  }, []);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "16px 12px 28px",
        overflow: "auto",
        pointerEvents: "auto",
      }}
      data-pz-ad-slot="1"
    >
      <Slot name="billboard-1" style={{ width: "min(970px, 100%)", minHeight: 90 }} kv={{ surface: "loader" }} />
      <Slot name="leaderboard-1" style={{ width: "min(728px, 100%)", minHeight: 70 }} kv={{ surface: "loader" }} />
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
          width: "100%",
          maxWidth: 980,
        }}
      >
        <Slot name="left-rail-1" style={{ minWidth: 150, minHeight: 220, flex: "1 1 150px", maxWidth: 300 }} kv={{ surface: "loader" }} />
        <Slot name="right-rail-1" style={{ minWidth: 150, minHeight: 220, flex: "1 1 150px", maxWidth: 300 }} kv={{ surface: "loader" }} />
        <Slot name="left-rail-2" style={{ minWidth: 150, minHeight: 220, flex: "1 1 150px", maxWidth: 300 }} kv={{ surface: "loader" }} />
        <Slot name="right-rail-2" style={{ minWidth: 150, minHeight: 220, flex: "1 1 150px", maxWidth: 300 }} kv={{ surface: "loader" }} />
      </div>
      <Slot name="mobile-unit-1" style={{ width: "min(360px, 100%)", minHeight: 100 }} kv={{ surface: "loader" }} />
    </div>
  );
}

