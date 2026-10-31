import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { requestAdGate, playVideoAd, stopVideoAd, CONTAINER_ID } from "@/lib/exoclick";
import {
  playLoaderNetworkAdsBehind,
  scrubAdsterraLoadingArtifacts,
} from "@/components/ads/Adsterra";
import { GameLaunchSplash } from "@/components/GameLaunchSplash";

type Context = "game" | "app" | "vm";
export type InterstitialPhase = "checking" | "ad" | "loading" | "ready";

const HARD_BEHIND_MS = 45000;
const BEHIND_HOST_ID = "pz-loader-ad-behind";

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
          setHadAd(true);
          const started = Date.now();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          if (cancelled) return;
          const behind = playLoaderNetworkAdsBehind(BEHIND_HOST_ID, HARD_BEHIND_MS);
          const result = await playVideoAd(context);
          const remain = 3500 - (Date.now() - started);
          if (remain > 0) await new Promise((r) => setTimeout(r, remain));
          if (cancelled) {
            try {
              await behind;
            } catch {}
            return;
          }
          try {
            stopVideoAd();
          } catch {}
          try {
            scrubAdsterraLoadingArtifacts();
          } catch {}
          if (result === "error" || result === "skip") {
            setHadAd(true);
          }
        }
      } catch {
        try {
          stopVideoAd();
        } catch {}
        setHadAd(false);
      }

      try {
        scrubAdsterraLoadingArtifacts();
      } catch {}

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
      try {
        stopVideoAd();
      } catch {}
      try {
        scrubAdsterraLoadingArtifacts();
      } catch {}
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
        minMs={quickSplash ? 900 : 2400}
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
        overflow: "visible",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "visible" }}>
        {/* Network banners sit behind the video layer — no bottom strip stealing height */}
        <div
          id={BEHIND_HOST_ID}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            pointerEvents: "none",
          }}
        >
          <Loader2 size={18} className="animate-spin" style={{ color: "hsla(0,0%,96%,0.85)" }} />
          <p style={{ margin: 0, fontSize: 12, color: "hsla(0,0%,100%,0.72)" }}>
            {phase === "ad" ? "Loading — thanks for your support" : "Preparing…"}
          </p>
        </div>
        <div
          id={CONTAINER_ID}
          data-pz-ad-slot="1"
          style={{ position: "absolute", inset: 0, zIndex: 3, overflow: "visible" }}
        />
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
