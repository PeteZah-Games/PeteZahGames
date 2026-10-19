import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { requestAdGate, playDisplayBreak, DISPLAY_MS } from "@/lib/adGate";
import { LoaderSlots } from "@/components/ads/Units";
import { GameLaunchSplash } from "@/components/GameLaunchSplash";

type Context = "game" | "app" | "vm";
export type InterstitialPhase = "checking" | "ad" | "loading" | "ready";

export function useInterstitialUnlock(context: Context, enabled = true) {
  const [unlocked, setUnlocked] = useState(!enabled);
  const [phase, setPhase] = useState<InterstitialPhase>(enabled ? "checking" : "ready");
  const [hadAd, setHadAd] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setUnlocked(true);
      setPhase("ready");
      setHadAd(false);
      return;
    }

    let cancelled = false;
    setUnlocked(false);
    setHadAd(false);
    setPhase("checking");

    (async () => {
      try {
        const gate = await requestAdGate(context);
        if (cancelled) return;

        if (gate.show) {
          setPhase("ad");
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          if (cancelled) return;
          const result = await playDisplayBreak(context);
          if (cancelled) return;
          setHadAd(result === "done");
        }
      } catch {
        setHadAd(false);
      }

      if (cancelled) return;

      if (context === "game") {
        setPhase("loading");
        return;
      }

      setUnlocked(true);
      setPhase("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [context, enabled]);

  const finishLoading = () => {
    setUnlocked(true);
    setPhase("ready");
  };

  return { unlocked, phase, finishLoading, hadAd };
}

export function InterstitialOverlay({
  phase,
  title,
  onLoadingDone,
  quickSplash = false,
}: {
  phase: InterstitialPhase;
  showBanner?: boolean;
  title?: string;
  onLoadingDone?: () => void;
  quickSplash?: boolean;
}) {
  if (phase === "ready") return null;

  if (phase === "loading") {
    return (
      <GameLaunchSplash
        title={title}
        minMs={quickSplash ? 2800 : 3800}
        onDone={() => {
          onLoadingDone?.();
        }}
      />
    );
  }

  return (
    <div
      data-pz-content-frame="1"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        background: "#070b12",
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        {phase === "ad" ? <LoaderSlots /> : null}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 16,
            zIndex: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            pointerEvents: "none",
          }}
        >
          <Loader2 size={15} className="animate-spin" style={{ color: "hsla(0,0%,96%,0.85)" }} />
          <p style={{ margin: 0, fontSize: 11, color: "hsla(0,0%,100%,0.55)" }}>
            {phase === "ad" ? `About ${Math.round(DISPLAY_MS / 1000)} seconds` : "Preparing…"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function InterstitialGate({
  context,
  children,
  title,
}: {
  context: Context;
  children: ReactNode;
  title?: string;
}) {
  const { unlocked, phase, finishLoading } = useInterstitialUnlock(context);
  return (
    <div className="absolute inset-0" data-pz-content-frame="1">
      {unlocked ? children : null}
      <InterstitialOverlay
        phase={phase}
        title={title}
        onLoadingDone={finishLoading}
      />
    </div>
  );
}
