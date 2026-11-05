import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  anyClipDue,
  armAdAudio,
  playAnyClipAd,
  preloadAnyClip,
} from "@/components/ads/AnyClipPlayer";
import { GameLaunchSplash } from "@/components/GameLaunchSplash";
import { isAdFreeClient } from "@/lib/adFree";

type Context = "game" | "app" | "vm";
export type InterstitialPhase = "checking" | "ad" | "loading" | "ready";

const AD_HARD_MS = 20000;
const SKIP_AFTER_MS = 3500;

export function useInterstitialUnlock(context: Context, enabled = true) {
  const [unlocked, setUnlocked] = useState(!enabled);
  const [phase, setPhase] = useState<InterstitialPhase>(enabled ? "checking" : "ready");
  const [hadAd, setHadAd] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const cancelRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setUnlocked(true);
      setPhase("ready");
      setHadAd(false);
      setCanSkip(false);
      return;
    }

    cancelRef.current = false;
    doneRef.current = false;
    let skipTimer = 0;
    let hardTimer = 0;
    setUnlocked(false);
    setHadAd(false);
    setCanSkip(false);
    setPhase("checking");
    void preloadAnyClip();

    const goNext = () => {
      if (cancelRef.current || doneRef.current) return;
      doneRef.current = true;
      window.clearTimeout(skipTimer);
      window.clearTimeout(hardTimer);
      setCanSkip(false);
      if (context === "game") {
        setPhase("loading");
        return;
      }
      setUnlocked(true);
      setPhase("ready");
    };

    (async () => {
      try {
        skipTimer = window.setTimeout(() => {
          if (!cancelRef.current && !doneRef.current) setCanSkip(true);
        }, SKIP_AFTER_MS);
        hardTimer = window.setTimeout(() => {
          goNext();
        }, AD_HARD_MS);

        if (isAdFreeClient() || !anyClipDue()) {
          goNext();
          return;
        }

        setPhase("ad");
        setHadAd(true);
        armAdAudio();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (cancelRef.current || doneRef.current) return;
        await playAnyClipAd();
        if (cancelRef.current || doneRef.current) return;
        setHadAd(true);
      } catch {
        if (!doneRef.current) setHadAd(false);
      }

      goNext();
    })();

    return () => {
      cancelRef.current = true;
      window.clearTimeout(skipTimer);
      window.clearTimeout(hardTimer);
    };
  }, [context, enabled]);

  const finishLoading = () => {
    setUnlocked(true);
    setPhase("ready");
  };

  const skipAd = () => {
    cancelRef.current = true;
    doneRef.current = true;
    setCanSkip(false);
    if (context === "game") {
      setPhase("loading");
      return;
    }
    setUnlocked(true);
    setPhase("ready");
  };

  return { unlocked, phase, finishLoading, hadAd, canSkip, skipAd };
}

export function InterstitialOverlay({
  phase,
  title,
  onLoadingDone,
  quickSplash = false,
  canSkip = false,
  onSkip,
}: {
  phase: InterstitialPhase;
  showBanner?: boolean;
  title?: string;
  onLoadingDone?: () => void;
  quickSplash?: boolean;
  canSkip?: boolean;
  onSkip?: () => void;
}) {
  if (phase === "ready") return null;

  if (phase === "loading") {
    return (
      <GameLaunchSplash
        title={title}
        minMs={quickSplash ? 700 : 1400}
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            pointerEvents: "none",
          }}
        >
          <Loader2 size={18} className="animate-spin" style={{ color: "hsla(0,0%,96%,0.85)" }} />
          <p style={{ margin: 0, fontSize: 12, color: "hsla(0,0%,100%,0.72)" }}>
            {phase === "ad" ? "Loading — thanks for your support" : "Preparing…"}
          </p>
          {canSkip && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              style={{
                pointerEvents: "auto",
                marginTop: 4,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid hsla(210,40%,80%,0.18)",
                background: "hsla(220,28%,10%,0.88)",
                color: "hsla(0,0%,100%,0.88)",
                fontSize: 12,
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              Continue to game
            </button>
          ) : null}
        </div>
        <div
          id="pz-anyclip-mount"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
            visibility: "visible",
          }}
        >
          <div
            id="reviq-anyclip-aio-widget"
            pubname="2731"
            widgetname="001Te000004ZYO7IAO_M13894"
            data-pubname="2731"
            data-widgetname="001Te000004ZYO7IAO_M13894"
            style={{
              width: "min(640px, 94vw)",
              height: "min(360px, 56vw)",
              maxHeight: 360,
              minHeight: 200,
              pointerEvents: "auto",
              background: "#000",
              borderRadius: 12,
              overflow: "hidden",
            }}
          />
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
  const { unlocked, phase, finishLoading, canSkip, skipAd } = useInterstitialUnlock(context);
  return (
    <div className="absolute inset-0" data-pz-content-frame="1">
      {unlocked ? children : null}
      <InterstitialOverlay
        phase={phase}
        title={title}
        onLoadingDone={finishLoading}
        canSkip={canSkip}
        onSkip={skipAd}
      />
    </div>
  );
}
