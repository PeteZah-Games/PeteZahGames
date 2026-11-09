import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameLaunchSplash } from "@/components/GameLaunchSplash";
import { refreshAdFreeStatus } from "@/lib/adFree";

type Context = "game" | "app" | "vm";
export type InterstitialPhase = "checking" | "ad" | "loading" | "ready";

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
    setUnlocked(false);
    setHadAd(false);
    setCanSkip(false);
    setPhase("checking");

    const goNext = () => {
      if (cancelRef.current || doneRef.current) return;
      doneRef.current = true;
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
        await refreshAdFreeStatus();
      } catch {}
      if (cancelRef.current || doneRef.current) return;
      // Pre-game AnyClip video removed. refreshAdFreeStatus keeps Premium gating in sync.
      goNext();
    })();

    return () => {
      cancelRef.current = true;
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

  if (phase === "loading" || phase === "checking" || phase === "ad") {
    if (phase === "checking" || phase === "ad") {
      // No pre-game video — fall through to splash once loading starts.
      return null;
    }
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

  return null;
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
