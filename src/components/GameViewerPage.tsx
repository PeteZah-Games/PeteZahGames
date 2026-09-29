import { useCallback, useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  ExternalLink,
  Eye,
  EyeOff,
  GripHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useInterstitialUnlock, InterstitialOverlay } from "./InterstitialAdGate";
import { openNativeWindow, openProxiedTab } from "@/lib/openTabBridge";
import { getSiteOrigin } from "@/lib/siteOrigin";
import { pxCreateFrame, pxEncode, pxReady } from "@/lib/px";
import { armPx } from "@/lib/browserInit";
import { applyMuxForUrl, unwrapPlayUrl } from "@/lib/proxyTarget";
import { hrefs } from "@/lib/uiMarks";
import { mutePollMs } from "@/lib/liteDevice";
import { trackModuleEngage, trackSection } from "@/lib/lessonMetrics";

interface GameViewerPageProps {
  url: string;
  title?: string;
  moduleId?: string;
  onBack?: () => void;
}

function ControlBtn({
  onClick,
  children,
  title,
  active,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  active?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active || hovered ? "rgba(255,255,255,0.09)" : "none",
        border: "none",
        color: active
          ? "rgba(255,255,255,0.95)"
          : hovered
            ? "rgba(255,255,255,0.9)"
            : "rgba(255,255,255,0.4)",
        cursor: "pointer",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function needsRemoteFrame(raw: string): boolean {
  try {
    const u = new URL(raw, window.location.origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.origin === window.location.origin) return false;
    const origin = getSiteOrigin();
    if (origin && u.origin === origin) return false;
    return true;
  } catch {
    return false;
  }
}

function isLocalGamePath(raw: string): boolean {
  try {
    const u = new URL(raw, window.location.origin);
    return u.pathname.startsWith("/storage/") || u.pathname.startsWith("/!!/") || u.pathname.startsWith("/n/m/") || u.pathname.startsWith("/f/g/");
  } catch {
    return raw.startsWith("/storage/") || raw.startsWith("/!!/") || raw.startsWith("/n/m/") || raw.startsWith("/f/g/");
  }
}

function applyMuteToFrame(iframe: HTMLIFrameElement | null, muted: boolean) {
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument;
    if (doc) {
      doc.querySelectorAll("audio, video").forEach((el) => {
        const media = el as HTMLMediaElement;
        media.muted = muted;
        if (muted) media.volume = 0;
      });
    }
    const win = iframe.contentWindow as any;
    if (!win) return;
    try {
      win.__pzMuted = muted;
      if (!win.__pzMutePatched) {
        win.__pzMutePatched = true;
        const proto = win.HTMLMediaElement?.prototype;
        if (proto) {
          const origPlay = proto.play;
          proto.play = function (...args: any[]) {
            try {
              this.muted = !!win.__pzMuted;
              if (win.__pzMuted) this.volume = 0;
            } catch {}
            return origPlay.apply(this, args);
          };
        }
      }
      const Ctx = win.AudioContext || win.webkitAudioContext;
      if (Ctx) {
        if (!win.__pzAudioContexts) win.__pzAudioContexts = [];
        if (!win.__pzAudioPatched) {
          win.__pzAudioPatched = true;
          const Orig = Ctx;
          win.AudioContext = function (...args: any[]) {
            const ctx = new Orig(...args);
            win.__pzAudioContexts.push(ctx);
            if (win.__pzMuted) {
              try {
                ctx.suspend();
              } catch {}
            }
            return ctx;
          };
          win.AudioContext.prototype = Orig.prototype;
          if (win.webkitAudioContext) {
            win.webkitAudioContext = win.AudioContext;
          }
        }
        for (const ctx of win.__pzAudioContexts) {
          try {
            if (muted) ctx.suspend();
            else ctx.resume();
          } catch {}
        }
      }
    } catch {}
  } catch {}
}

export default function GameViewerPage({
  url,
  title,
  moduleId,
  onBack,
}: GameViewerPageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameHostRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const startedAt = useRef(Date.now());
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const { unlocked, phase, finishLoading, hadAd } = useInterstitialUnlock("game");

  useEffect(() => {
    trackSection("lab", {
      page_title: `Lab · ${(title || "Module").slice(0, 48)}`,
      module_id: moduleId || "unknown",
      force: true,
    });
    startedAt.current = Date.now();
    return () => {
      trackModuleEngage(moduleId || "unknown", (Date.now() - startedAt.current) / 1000);
    };
  }, [moduleId, title, url]);
  const canPreload = phase === "ad" || phase === "loading" || phase === "ready";
  const playUrl = unwrapPlayUrl(url);
  const useProxy = !isLocalGamePath(playUrl) && needsRemoteFrame(playUrl);
  const displayTitle = title?.trim() || hrefs.wordG();

  const getActiveFrame = useCallback(
    () => frameHostRef.current || iframeRef.current,
    []
  );

  const applyZoom = useCallback((z: number) => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;
    const newZoom = Math.min(Math.max(Number(z.toFixed(2)), 0.5), 2);
    zoomRef.current = newZoom;
    setZoom(newZoom);
    const w = container.clientWidth || container.offsetWidth;
    const h = container.clientHeight || container.offsetHeight;
    if (!w || !h) return;
    wrapper.style.transformOrigin = "0 0";
    wrapper.style.transform = newZoom === 1 ? "none" : `scale(${newZoom})`;
    wrapper.style.width = `${w / newZoom}px`;
    wrapper.style.height = `${h / newZoom}px`;
    container.style.overflow = newZoom === 1 ? "hidden" : "auto";
  }, []);

  useEffect(() => {
    const handler = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);
      if (!inFs) setControlsVisible(true);
      requestAnimationFrame(() => applyZoom(zoomRef.current));
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [applyZoom]);

  useEffect(() => {
    if (playUrl.includes("/storage/ag/originals/precision/index.html")) {
      openNativeWindow("/storage/ag/originals/Resent-Client-main/index.html");
    }
  }, [playUrl]);

  useEffect(() => {
    if (!useProxy || !canPreload) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    armPx().catch(() => {});

    const tryCreate = () => {
      if (!pxReady()) return false;
      try {
        if (frameHostRef.current?.parentNode) return true;
        const scFrame = pxCreateFrame();
        if (!scFrame) return false;
        const frame = scFrame.frame as HTMLIFrameElement;
        frame.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;border:none;opacity:0;transition:opacity 0.25s ease;";
        frame.onload = () => {
          applyMuteToFrame(frame, muted);
        };
        void applyMuxForUrl(playUrl).then(() => {
          try {
            frame.src = pxEncode(playUrl);
          } catch {}
        });
        frameHostRef.current = frame;
        wrapper.appendChild(frame);
        requestAnimationFrame(() => applyZoom(zoomRef.current));
        return true;
      } catch {
        return false;
      }
    };

    if (!tryCreate()) {
      const interval = setInterval(() => {
        if (tryCreate()) clearInterval(interval);
      }, 100);
      return () => {
        clearInterval(interval);
        if (frameHostRef.current?.parentNode) {
          frameHostRef.current.parentNode.removeChild(frameHostRef.current);
        }
        frameHostRef.current = null;
      };
    }

    return () => {
      if (frameHostRef.current?.parentNode) {
        frameHostRef.current.parentNode.removeChild(frameHostRef.current);
      }
      frameHostRef.current = null;
    };
  }, [playUrl, useProxy, canPreload, applyZoom]);

  useEffect(() => {
    const frame = frameHostRef.current;
    if (!frame) return;
    frame.style.opacity = unlocked ? "1" : "0";
    frame.style.pointerEvents = unlocked ? "auto" : "none";
  }, [unlocked, playUrl, useProxy, canPreload]);

  useEffect(() => {
    const tick = () => applyMuteToFrame(getActiveFrame(), muted);
    tick();
    const id = window.setInterval(tick, mutePollMs());
    return () => window.clearInterval(id);
  }, [muted, getActiveFrame, unlocked, url, useProxy]);

  const handleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch(() => {});
    }
  };

  const openExternal = () => {
    if (playUrl.includes("/storage/ag/originals/precision/index.html")) {
      openNativeWindow("/storage/ag/originals/Resent-Client-main/index.html");
      return;
    }
    if (useProxy) {
      openProxiedTab(playUrl);
      return;
    }
    openNativeWindow(playUrl);
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        data-pz-content-frame="1"
      >
        <div
          ref={wrapperRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            transformOrigin: "0 0",
          }}
        >
          {!useProxy && (
            <iframe
              ref={iframeRef}
              src={canPreload ? playUrl : "about:blank"}
              sandbox="allow-scripts allow-pointer-lock allow-forms allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                display: "block",
                opacity: unlocked ? 1 : 0,
                pointerEvents: unlocked ? "auto" : "none",
              }}
              title={displayTitle}
              onLoad={() => applyMuteToFrame(iframeRef.current, muted)}
            />
          )}
        </div>

        <InterstitialOverlay
          phase={phase}
          title={displayTitle}
          quickSplash={hadAd}
          onLoadingDone={finishLoading}
        />

        <AnimatePresence>
          {controlsVisible && unlocked && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                bottom: 20,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                zIndex: 50,
                pointerEvents: "none",
              }}
              className="game-viewer-controls"
            >
              <motion.div
                drag
                dragMomentum={false}
                dragElastic={0}
                whileDrag={{ scale: 1.02 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  borderRadius: 14,
                  background: "rgba(6, 12, 26, 0.88)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(20px)",
                  boxShadow:
                    "0 4px 32px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
                  pointerEvents: "auto",
                  cursor: "grab",
                  userSelect: "none",
                  maxWidth: "calc(100vw - 24px)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingRight: 4,
                    color: "rgba(255,255,255,0.18)",
                  }}
                >
                  <GripHorizontal size={12} />
                </div>
                {onBack && (
                  <>
                    <button
                      onClick={onBack}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.4)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "rgba(255,255,255,0.85)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                      }}
                    >
                      ← Back
                    </button>
                    <div
                      style={{
                        width: 1,
                        height: 14,
                        background: "rgba(255,255,255,0.07)",
                        flexShrink: 0,
                      }}
                    />
                  </>
                )}
                <span
                  title={displayTitle}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.75)",
                    maxWidth: 140,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    paddingRight: 4,
                  }}
                >
                  {displayTitle}
                </span>
                <div
                  style={{
                    width: 1,
                    height: 14,
                    background: "rgba(255,255,255,0.07)",
                    flexShrink: 0,
                  }}
                />
                <ControlBtn
                  onClick={() => applyZoom(zoom - 0.25)}
                  title="Zoom out"
                >
                  <ZoomOut size={12} />
                </ControlBtn>
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 28,
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {Math.round(zoom * 100)}%
                </span>
                <ControlBtn
                  onClick={() => applyZoom(zoom + 0.25)}
                  title="Zoom in"
                >
                  <ZoomIn size={12} />
                </ControlBtn>
                <div
                  style={{
                    width: 1,
                    height: 14,
                    background: "rgba(255,255,255,0.07)",
                    flexShrink: 0,
                  }}
                />
                <ControlBtn
                  onClick={() => setMuted((m) => !m)}
                  title={muted ? "Unmute" : "Mute"}
                  active={muted}
                >
                  {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </ControlBtn>
                <ControlBtn onClick={openExternal} title="Open in new tab">
                  <ExternalLink size={12} />
                </ControlBtn>
                <ControlBtn
                  onClick={handleFullscreen}
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
                </ControlBtn>
                <div
                  style={{
                    width: 1,
                    height: 14,
                    background: "rgba(255,255,255,0.07)",
                    flexShrink: 0,
                  }}
                />
                <ControlBtn
                  onClick={() => setControlsVisible(false)}
                  title="Hide controls"
                >
                  <EyeOff size={12} />
                </ControlBtn>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!controlsVisible && unlocked && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              exit={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              onClick={() => setControlsVisible(true)}
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 14px",
                borderRadius: 10,
                background: "rgba(6, 12, 26, 0.75)",
                border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(12px)",
                color: "rgba(255,255,255,0.75)",
                fontSize: 11,
                cursor: "pointer",
                zIndex: 50,
                whiteSpace: "nowrap",
              }}
            >
              <Eye size={11} /> Show Controls
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
