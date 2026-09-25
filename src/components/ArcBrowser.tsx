import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBrowserState } from "@/hooks/useBrowserState";
import { useAuth } from "@/hooks/useAuth";
import { schedulePushSettings } from "@/lib/settingsSync";
import Sidebar from "@/components/BrowserSidebar";
import Toolbar from "@/components/BrowserToolbar";
import ContentArea from "@/components/ContentArea";
import StatusBar from "@/components/StatusBar";
import DiscordPopup from "@/components/DiscordPopup";
import VantaBackdrop from "@/components/VantaBackdrop";
import { presenceIntervalMs } from "@/lib/liteDevice";
import DebugHud from "@/components/DebugHud";
import HorizontalTabBar from "@/components/HorizontalTabBar";
import GlobalAnnouncement from "@/components/GlobalAnnouncement";
import InspectOverlay from "@/components/InspectOverlay";
const TrendingDashboard = lazy(() => import("@/components/TrendingDashboard"));
import { findMatchingShortcut, armTabChord, clearTabChord } from "@/lib/shortcuts";
import { getHomeUrl } from "@/lib/homeUrl";
import {
  classifyOpenUrl,
  installParentOpenTrap,
  toAdTabUrl,
  unwrapProxyUrl,
  type OpenTabRequest,
} from "@/lib/openTabBridge";
import { hrefs, marks } from "@/lib/uiMarks";
import { whenQuietEnds } from "@/lib/quietBoot";
import { setRivetNavigateHandler } from "@/lib/rivet/host";

function getPresenceClientId() {
  try {
    let id = sessionStorage.getItem("pz-presence-id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("pz-presence-id", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest("[contenteditable='true']");
}

export default function ArcBrowser() {
  const state = useBrowserState();
  const { user, mustSetup2fa, requires2fa } = useAuth();
  const splitTab = state.splitTabId
    ? state.tabs.find((t) => t.id === state.splitTabId)
    : undefined;
  const [zoomLevel, setZoomLevel] = useState(100);
  const [gameFocus, setGameFocus] = useState(() => localStorage.getItem(hrefs.gf()) === "true");
  const [horizontalTabs, setHorizontalTabs] = useState(
    () => localStorage.getItem("horizontalTabs") === "true"
  );
  const [rainOnHomepage, setRainOnHomepage] = useState(
    () => localStorage.getItem("rainOnHomepage") === "true"
  );
  useEffect(() => {
    const sync = () => {
      setGameFocus(localStorage.getItem(hrefs.gf()) === "true");
      setHorizontalTabs(localStorage.getItem("horizontalTabs") === "true");
      setRainOnHomepage(localStorage.getItem("rainOnHomepage") === "true");
    };
    window.addEventListener("petezah-settings-updated", sync);
    return () => window.removeEventListener("petezah-settings-updated", sync);
  }, []);
  const onCampusHome = (() => {
    const u = state.focusedTab?.url || state.activeTab?.url || "";
    return !u || u === "petezah://newtab" || u === "about:blank" || u === "https://";
  })();
  const suppressRain = onCampusHome && !rainOnHomepage;  const dimChrome =
    gameFocus && !!state.focusedTab?.url?.startsWith(hrefs.gv());
  const contentRef = useRef<HTMLDivElement>(null);
  const [openToast, setOpenToast] = useState<string | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [trendingOpen, setTrendingOpen] = useState(false);
  const openToastTimer = useRef<number | null>(null);

  const zoomIn = useCallback(() => setZoomLevel((z) => Math.min(z + 10, 200)), []);
  const zoomOut = useCallback(() => setZoomLevel((z) => Math.max(z - 10, 50)), []);
  const resetZoom = useCallback(() => setZoomLevel(100), []);

  useEffect(() => {
    setRivetNavigateHandler((url) => {
      state.navigateToUrl(url);
    });
  }, [state.navigateToUrl]);

  useEffect(() => {
    const open = () => setTrendingOpen(true);
    window.addEventListener("petezah-open-trending", open);
    return () => window.removeEventListener("petezah-open-trending", open);
  }, []);

  useEffect(() => {
    if (!mustSetup2fa && !requires2fa) return;
    const url = state.focusedTab?.url || "";
    if (url.startsWith("petezah://account")) return;
    state.navigateToUrl("petezah://account");
  }, [mustSetup2fa, requires2fa, state.focusedTab?.url, state.navigateToUrl]);

  const toggleContentFullscreen = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        el.requestFullscreen();
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    const onSync = () => schedulePushSettings();
    window.addEventListener("petezah-settings-updated", onSync);
    window.addEventListener("petezah-sync-request", onSync);
    return () => {
      window.removeEventListener("petezah-settings-updated", onSync);
      window.removeEventListener("petezah-sync-request", onSync);
    };
  }, [user]);

  useEffect(() => {
    let iv: number | null = null;
    let armed = false;
    const report = () => {
      if (!armed || document.hidden) return;
      const urls = state.tabs
        .map((t) => t.url)
        .filter((u) => typeof u === "string" && (/^https?:\/\//i.test(u) || /^petezah:\/\//i.test(u)))
        .slice(0, 4);
      const active = state.focusedTab || state.activeTab;
      let game: any = null;
      if (active?.url?.startsWith(hrefs.g())) {
        game = { surface: "list", label: marks.a(), gameId: null };
      } else if (active?.url?.startsWith(hrefs.gv())) {
        try {
          const q = active.url.includes("?") ? active.url.slice(active.url.indexOf("?") + 1) : "";
          const params = new URLSearchParams(q);
          game = {
            surface: "viewer",
            label: params.get("title") || active.title || hrefs.wordG(),
            gameId: params.get("gid") || null,
          };
        } catch {
          game = { surface: "viewer", label: active.title || hrefs.wordG(), gameId: null };
        }
      }
      fetch("/api/presence", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getPresenceClientId(), urls, game }),
      }).catch(() => {});
      fetch("/api/achievements/heartbeat", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    };
    const start = () => {
      if (iv !== null) return;
      iv = window.setInterval(report, presenceIntervalMs());
    };
    const stop = () => {
      if (iv !== null) {
        window.clearInterval(iv);
        iv = null;
      }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        report();
        start();
      }
    };
    const offQuiet = whenQuietEnds(() => {
      armed = true;
      report();
      start();
      document.addEventListener("visibilitychange", onVis);
    });
    return () => {
      offQuiet();
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [state.tabs, state.focusedTab, state.activeTab]);

  useEffect(() => {
    setOpenToast(null);
    if (openToastTimer.current) {
      window.clearTimeout(openToastTimer.current);
      openToastTimer.current = null;
    }
  }, [state.activeTabId]);

  useEffect(() => {
    installParentOpenTrap();

    const openFromDetail = (detail: OpenTabRequest) => {
      if (document.documentElement.getAttribute("data-pz-lock-popups") === "1") return;
      const raw = detail?.url;
      if (!raw) return;
      const url = unwrapProxyUrl(raw);
      const classified = classifyOpenUrl(url);
      const kind =
        detail.mode === "ad" || detail.soft || classified === "ad" ? "ad" : classified;
      if (kind === "skip") return;
      if (kind === "ad") {
        state.addTab(toAdTabUrl(url));
        if (openToastTimer.current) window.clearTimeout(openToastTimer.current);
        setOpenToast("Sponsored");
        openToastTimer.current = window.setTimeout(() => setOpenToast(null), 1400);
        return;
      }
      state.addTab(url);
    };

    const onCustom = (e: Event) => {
      openFromDetail((e as CustomEvent).detail as OpenTabRequest);
    };
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d && d.source === "pz-session-bridge" && d.action === "navigate" && typeof d.url === "string") {
        let url = d.url.trim();
        if (/^petezah:\/\/[a-z0-9][a-z0-9+.-]*(?:[/?#][^\s]*)?$/i.test(url)) {
          if (url === "petezah://newtab") url = getHomeUrl();
          state.navigateToUrl(url);
        }
        return;
      }
      if (!d || d.source !== "pz-open-trap" || typeof d.url !== "string") return;
      openFromDetail({
        url: d.url,
        mode: d.mode === "ad" ? "ad" : hrefs.modeP(),
        soft: !!d.soft,
      });
    };

    window.addEventListener("petezah-open-tab", onCustom);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("petezah-open-tab", onCustom);
      window.removeEventListener("message", onMessage);
      if (openToastTimer.current) window.clearTimeout(openToastTimer.current);
    };
  }, [state.addTab, state.navigateToUrl]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { tabId, url } = (e as CustomEvent).detail;
      state.updateTabUrl(tabId, url);
      try {
        const entries = JSON.parse(localStorage.getItem("petezah-history") || "[]");
        const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=32`;
        const newEntry = {
          id: String(Date.now()) + Math.random(),
          url,
          title: url,
          favicon,
          visitedAt: Date.now(),
          isProxied: true,
        };
        const filtered = entries.filter((entry: any) => entry.url !== url);
        localStorage.setItem("petezah-history", JSON.stringify([newEntry, ...filtered].slice(0, 500)));
        window.dispatchEvent(new CustomEvent("petezah-sync-request"));
      } catch {}
    };
    window.addEventListener("petezah-url-change", handler);
    return () => window.removeEventListener("petezah-url-change", handler);
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const deep = params.get("m") || params.get("music");
      if (deep && deep.startsWith("petezah://")) {
        state.navigateToUrl(deep);
        const clean = window.location.pathname || "/";
        window.history.replaceState({}, "", clean);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleContentFullscreen();
        return;
      }

      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        armTabChord(1100);
        return;
      }

      const action = findMatchingShortcut(e);
      if (!action) return;

      if (isTypingTarget(e.target)) return;

      e.preventDefault();
      clearTabChord();
      if (action === "newTab") state.addTab();
      else if (action === "closeTab") {
        if (state.focusedTab) state.closeTab(state.focusedTab.id);
      } else if (action === "focusUrl") state.setIsUrlFocused(true);
      else if (action === "history") state.navigateToUrl("petezah://history");
      else if (action === "extensions") state.navigateToUrl("petezah://extensions");
      else if (action === "bookmarks") state.navigateToUrl("petezah://bookmarks");
      else if (action === hrefs.kindG()) state.navigateToUrl(hrefs.g());
      else if (action === "ai") state.navigateToUrl("petezah://ai");
      else if (action === "tools") state.navigateToUrl("petezah://tools");
      else if (action === "inspect") setInspectOpen(true);
      else if (action === "zoomIn") zoomIn();
      else if (action === "zoomOut") zoomOut();
      else if (action === "zoomReset") resetZoom();
    };
    const onInspect = () => setInspectOpen(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("petezah-inspect", onInspect);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("petezah-inspect", onInspect);
    };
  }, [
    state.addTab,
    state.closeTab,
    state.focusedTab,
    state.setIsUrlFocused,
    state.navigateToUrl,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleContentFullscreen,
  ]);

  return (
    <div
      style={{
        height: "100dvh",
        width: "100%",
        display: "flex",
        overflow: "hidden",
        backgroundColor: "transparent",
        position: "relative",
      }}
    >
      <VantaBackdrop suppressRain={suppressRain} />
      <DebugHud />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Sidebar
          spaces={state.spaces}
          activeSpaceId={state.activeSpaceId}
          pinnedTabs={state.pinnedTabs}
          unpinnedTabs={state.unpinnedTabs}
          activeTabId={state.focusedTabId}
          splitTabId={state.splitTabId}
          collapsed={state.sidebarCollapsed}
          onSpaceSwitch={() => {}}
          onTabSelect={state.selectTab}
          onTabClose={state.closeTab}
          onTabPin={state.togglePin}
          onTabSplit={(id) => state.openSplit(id)}
          onTabReorder={state.reorderTabs}
          onAddTab={() => state.addTab()}
          onToggleCollapse={() => state.setSidebarCollapsed(!state.sidebarCollapsed)}
          onAccountClick={() => state.navigateToUrl("petezah://account")}
          onNavigate={state.navigateToUrl}
          user={user}
          hideTabs={horizontalTabs}
        />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative bg-transparent">
          {horizontalTabs && (
            <HorizontalTabBar
              pinnedTabs={state.pinnedTabs}
              unpinnedTabs={state.unpinnedTabs}
              activeTabId={state.focusedTabId}
              onSelect={state.selectTab}
              onClose={state.closeTab}
              onReorder={state.reorderTabs}
              onAddTab={() => state.addTab()}
            />
          )}
          <div style={{ opacity: dimChrome ? 0.4 : 1, transition: "opacity 0.25s ease", position: "relative", zIndex: 80 }}>
            <Toolbar
              activeTab={state.focusedTab}
              urlInput={state.urlInput}
              isUrlFocused={state.isUrlFocused}
              onUrlChange={state.setUrlInput}
              onUrlFocus={state.setIsUrlFocused}
              onNavigate={state.navigateToUrl}
              onNotificationClick={() => state.navigateToUrl("petezah://account")}
              onCloseTab={() => state.focusedTab && state.closeTab(state.focusedTab.id)}
              onCloseAllTabs={state.closeAllTabs}
              onNewTab={() => state.addTab()}
              zoomLevel={zoomLevel}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onResetZoom={resetZoom}
              onFullscreen={toggleContentFullscreen}
              onInspect={() => setInspectOpen(true)}
            />
          </div>
          <ContentArea
            tabs={state.tabs}
            activeTab={state.activeTab}
            splitTab={splitTab}
            focusedPane={state.focusedPane}
            onFocusPane={state.setFocusedPane}
            onNavigate={state.navigateToUrl}
            onNewTab={() => state.addTab()}
            onCloseSplit={state.closeSplit}
            zoomLevel={zoomLevel}
            contentRef={contentRef}
          />
          <div style={{ opacity: dimChrome ? 0.45 : 1, transition: "opacity 0.25s ease" }}>
            <StatusBar
              tabCount={state.tabs.length}
              onOpenTrending={() => setTrendingOpen(true)}
            />
          </div>
        </main>
      </div>
      <DiscordPopup />
      <GlobalAnnouncement onNavigate={state.navigateToUrl} />
      <InspectOverlay
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        url={state.focusedTab?.url || state.activeTab?.url}
        title={state.focusedTab?.title || state.activeTab?.title}
      />
      <AnimatePresence>
        {trendingOpen && (
          <Suspense fallback={null}>
            <TrendingDashboard
              variant="overlay"
              onClose={() => setTrendingOpen(false)}
              onNavigate={state.navigateToUrl}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {openToast && (
          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 4, filter: "blur(3px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-8 left-1/2 z-[1000] -translate-x-1/2 px-3.5 py-2 rounded-full text-[11px] font-medium tracking-wide"
            style={{
              background: "hsla(216, 28%, 9%, 0.88)",
              border: "1px solid hsla(210, 40%, 80%, 0.12)",
              color: "hsla(210, 30%, 88%, 0.82)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
              backdropFilter: "blur(14px)",
            }}
          >
            {openToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
