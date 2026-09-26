import { lazy, Suspense, useEffect, useState } from "react";
import { themeById } from "@/lib/siteThemes";
import { normalizeBgEffect, syncBgEffectAttr, type BgEffectId } from "@/lib/bgEffects";

const VantaBackground = lazy(() => import("./VantaBackground"));
const SafeRainBackdrop = lazy(() => import("./SafeRainBackdrop"));
const SakuraBackdrop = lazy(() => import("./effects/SakuraBackdrop"));
const LightningBackdrop = lazy(() => import("./effects/LightningBackdrop"));
const StarfieldBackdrop = lazy(() => import("./effects/StarfieldBackdrop"));
const SnowBackdrop = lazy(() => import("./effects/SnowBackdrop"));

function readEffect(): BgEffectId {
  try {
    return normalizeBgEffect(localStorage.getItem("bgEffect"));
  } catch {
    return "rain";
  }
}

function StaticBackdrop() {
  let bg = "#020810";
  try {
    bg = localStorage.getItem("backgroundColor") || themeById(localStorage.getItem("theme")).bg || bg;
  } catch {}
  const img = (() => {
    try {
      return localStorage.getItem("backgroundImage") || "";
    } catch {
      return "";
    }
  })();
  if (img) {
    return (
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100dvh",
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: `url(${img})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: bg,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 0,
        pointerEvents: "none",
        background: bg,
      }}
    />
  );
}

function RainReadabilityWash() {
  return (
    <div
      aria-hidden
      className="bg-effect-wash"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse 90% 75% at 50% 42%, hsla(220, 38%, 4%, 0.22) 0%, hsla(220, 35%, 3%, 0.42) 55%, hsla(220, 30%, 2%, 0.55) 100%)",
      }}
    />
  );
}

/** Site-wide backdrop. Rain uses Canvas 2D glass (no WebGL / no /fx/rain iframe). */
export default function VantaBackdrop() {
  const [effect, setEffect] = useState(readEffect);

  useEffect(() => {
    const sync = () => {
      const next = readEffect();
      setEffect(next);
      syncBgEffectAttr(next);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("petezah-settings-updated", sync);
    const id = window.setInterval(sync, 1200);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("petezah-settings-updated", sync);
      window.clearInterval(id);
    };
  }, []);

  let node = <VantaBackground />;
  if (effect === "rain") node = <SafeRainBackdrop />;
  else if (effect === "sakura") node = <SakuraBackdrop />;
  else if (effect === "lightning") node = <LightningBackdrop />;
  else if (effect === "stars") node = <StarfieldBackdrop />;
  else if (effect === "snow") node = <SnowBackdrop />;
  else if (effect === "solid") node = <StaticBackdrop />;
  else node = <VantaBackground />;

  const washBusy = effect === "rain" || effect === "sakura" || effect === "lightning";

  return (
    <Suspense fallback={<StaticBackdrop />}>
      {node}
      {washBusy ? <RainReadabilityWash /> : null}
    </Suspense>
  );
}
