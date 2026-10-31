import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Lock,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Share,
  Bookmark,
  Gamepad2,
  Bot,
  User,
  FileText,
  MessageSquare,
  MoreVertical,
  X,
  Music,
  Film,
  AppWindow,
  Monitor,
  MessageCircle,
  Plus,
  ZoomIn,
  ZoomOut,
  History,
  Maximize,
  Puzzle,
  ChevronDown,
  ChevronUp,
  Wrench,
  Code2,
  Star,
} from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";
import {
  displayUrlForBar,
  loadFontMaps,
  shouldObfuscateDisplay,
} from "@/lib/fontObfuscation";
import { formatShortcut, loadShortcuts } from "@/lib/shortcuts";
import { hrefs, marks } from "@/lib/uiMarks";
import ObfuscatedText from "@/components/ObfuscatedText";
import { isBookmarked, toggleBookmark } from "@/components/BookmarksPage";
import ExtensionPopup from "@/components/ExtensionPopup";
import { ensureBuiltinExtensions } from "@/components/ExtensionsPage";
import { findUblockExtensionId, getRivet } from "@/lib/rivet/host";

interface ToolbarProps {
  activeTab: Tab | undefined;
  urlInput: string;
  isUrlFocused: boolean;
  onUrlChange: (val: string) => void;
  onUrlFocus: (focused: boolean) => void;
  onNavigate: (url: string) => void;
  onNotificationClick: () => void;
  onCloseTab?: () => void;
  onCloseAllTabs?: () => void;
  onNewTab?: () => void;
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onFullscreen?: () => void;
  onShowHistory?: () => void;
  onShowBookmarks?: () => void;
  onShowDownloads?: () => void;
  onInspect?: () => void;
}

export default function Toolbar({
  activeTab,
  urlInput,
  isUrlFocused,
  onUrlChange,
  onUrlFocus,
  onNavigate,
  onNotificationClick,
  onCloseTab,
  onCloseAllTabs,
  onNewTab,
  zoomLevel = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFullscreen,
  onShowHistory,
  onShowBookmarks,
  onShowDownloads,
  onInspect,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const sc = loadShortcuts();
  const suggestWrapRef = useRef<HTMLDivElement>(null);

  const syncMenuScroll = () => {
    const el = menuScrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const t = requestAnimationFrame(syncMenuScroll);
    return () => cancelAnimationFrame(t);
  }, [menuOpen]);
  const [suggestions, setSuggestions] = useState<
    { type: string; label: string; url: string; tag?: string; action?: string; imageUrl?: string }[]
  >([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [shieldOn, setShieldOn] = useState(true);
  const shieldBtnRef = useRef<HTMLButtonElement>(null);
  const shieldScopeRef = useRef(`${activeTab?.id || ""}:${activeTab?.url || ""}`);

  useEffect(() => {
    const scope = `${activeTab?.id || ""}:${activeTab?.url || ""}`;
    if (shieldScopeRef.current === scope) return;
    shieldScopeRef.current = scope;
    setShieldOpen(false);
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    loadFontMaps().then(() => setMapsReady(true));
  }, []);

  useEffect(() => {
    ensureBuiltinExtensions();
    let unsub: (() => void) | undefined;
    const sync = () => {
      try {
        const rivet = getRivet();
        const id = findUblockExtensionId();
        const ext = id ? rivet?.getInstalledExtensions().find((e) => e.id === id) : null;
        setShieldOn(ext ? ext.enabled !== false : true);
      } catch {
        setShieldOn(true);
      }
      try {
        const url = activeTab?.url || "";
        setBookmarked(!!url && !url.startsWith("petezah://") && isBookmarked(url));
      } catch {
        setBookmarked(false);
      }
    };
    sync();
    const onReady = () => {
      const rivet = getRivet();
      if (!rivet) return;
      unsub?.();
      unsub = rivet.onChange(sync);
      sync();
    };
    window.addEventListener("petezah-extensions-updated", sync);
    window.addEventListener("rivet-ready", onReady);
    window.addEventListener("storage", sync);
    onReady();
    return () => {
      unsub?.();
      window.removeEventListener("petezah-extensions-updated", sync);
      window.removeEventListener("rivet-ready", onReady);
      window.removeEventListener("storage", sync);
    };
  }, [activeTab?.url]);

  useEffect(() => {
    if (isUrlFocused && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isUrlFocused]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!isUrlFocused) {
      setSuggestOpen(false);
      setSuggestions([]);
      setActiveIdx(-1);
      return;
    }
    const q = String(urlInput || "").trim();
    if (q.length < 1 || q.startsWith("http") || q.startsWith("petezah://") || q.includes(".")) {
      setSuggestions([]);
      setSuggestOpen(false);
      setActiveIdx(-1);
      return;
    }
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        suggestAbort.current?.abort();
        const ac = new AbortController();
        suggestAbort.current = ac;
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q.slice(0, 80))}`, {
          signal: ac.signal,
          credentials: "same-origin",
        });
        if (!r.ok) return;
        const d = await r.json();
        const list = Array.isArray(d?.suggestions) ? d.suggestions : [];
        setSuggestions(list.slice(0, 18));
        setSuggestOpen(list.length > 0);
        setActiveIdx(-1);
      } catch {}
    }, 180);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [urlInput, isUrlFocused]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDown = (e: MouseEvent) => {
      if (suggestWrapRef.current && !suggestWrapRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [suggestOpen]);

  const pickSuggestion = (item: { url: string; label: string; type: string }) => {
    setSuggestOpen(false);
    setActiveIdx(-1);
    if (item.type === "web") {
      onUrlChange(item.label);
      try {
        const eng = localStorage.getItem("searchEngine") || "ddg";
        const map: Record<string, string> = {
          ddg: "https://duckduckgo.com/?q=",
          bing: "https://www.bing.com/search?q=",
          google: "https://www.google.com/search?q=",
          startpage: "https://www.startpage.com/sp/search?query=",
          brave: "https://search.brave.com/search?q=",
        };
        onNavigate(`${map[eng] || map.ddg}${encodeURIComponent(item.label)}`);
      } catch {
        onNavigate(`https://duckduckgo.com/?q=${encodeURIComponent(item.label)}`);
      }
    } else {
      onNavigate(item.url);
    }
    onUrlFocus(false);
  };

  const rawDisplay = isUrlFocused
    ? urlInput
    : activeTab?.url?.startsWith(hrefs.gv())
    ? hrefs.gv()
    : activeTab?.url?.startsWith("petezah://appviewer")
    ? "petezah://appviewer"
    : activeTab?.url?.startsWith("petezah://ad")
    ? "petezah://ad"
    : activeTab?.url || "";

  const displayUrl =
    !isUrlFocused && mapsReady
      ? displayUrlForBar(rawDisplay, false)
      : rawDisplay;

  const urlObfuscated =
    !isUrlFocused && mapsReady && shouldObfuscateDisplay(rawDisplay);

  const isNewTab =
    !activeTab?.url ||
    activeTab.url === "petezah://newtab" ||
    activeTab.url === "about:blank" ||
    activeTab.url === "https://";

  const barTitle = (() => {
    if (!activeTab || isNewTab) return "";
    const url = activeTab.url || "";
    if (
      url.startsWith(hrefs.gv()) ||
      url.startsWith("petezah://appviewer")
    ) {
      try {
        const fromQuery = new URLSearchParams(url.split("?")[1] || "").get(
          "title",
        );
        if (fromQuery?.trim()) return fromQuery.trim();
      } catch {}
    }
    const title = activeTab.title?.trim() || "";
    if (!title || title === "New Tab") return "";
    const scheme = url.startsWith("petezah://")
      ? url.replace("petezah://", "").split("?")[0]
      : "";
    if (scheme && title.toLowerCase() === scheme.toLowerCase()) return "";
    if (/^(game|app|gameviewer|appviewer)$/i.test(title)) return "";
    return title;
  })();

  const handleBack = () => {
    try {
      activeTab?.frame?.back?.();
    } catch {}
  };

  const handleForward = () => {
    try {
      activeTab?.frame?.forward?.();
    } catch {}
  };

  const handleReload = () => {
    try {
      activeTab?.frame?.reload?.();
    } catch {}
  };

  const handleShare = () => {
    try {
      if (activeTab?.url && navigator.clipboard) {
        navigator.clipboard.writeText(activeTab.url);
      }
    } catch {}
  };

  return (
    <div
      className="relative z-20 flex items-center gap-2 px-4 h-11 flex-shrink-0 chrome-bar"
      style={{ borderBottom: "1px solid hsla(210, 40%, 80%, 0.08)" }}
    >
      <div className="flex items-center gap-0.5">
        <button
          onClick={handleBack}
          disabled={isNewTab}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ color: "hsla(0,0%,100%,0.78)" }}
          title="Back"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          onClick={handleForward}
          disabled={isNewTab}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ color: "hsla(0,0%,100%,0.78)" }}
          title="Forward"
        >
          <ArrowRight size={13} />
        </button>
        <button
          onClick={handleReload}
          disabled={isNewTab}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ color: "hsla(0,0%,100%,0.78)" }}
          title="Reload"
        >
          <RotateCw size={12} />
        </button>
      </div>

      <div
        ref={suggestWrapRef}
        className={`relative flex-1 flex items-center gap-2 rounded-xl px-3 py-1.5 mx-2 transition-all duration-200 cursor-text ${
          isUrlFocused ? "ring-1 ring-white/20" : "border border-white/10"
        }`}
        style={{ background: isUrlFocused ? "hsla(210, 40%, 90%, 0.08)" : "hsla(210, 40%, 90%, 0.05)" }}
        onClick={() => {
          onUrlChange(activeTab?.url || "");
          onUrlFocus(true);
        }}
      >
        <AnimatePresence mode="wait">
          {isUrlFocused ? (
            <motion.div
              key="search"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Search size={12} style={{ color: "hsla(0,0%,100%,0.45)" }} />
            </motion.div>
          ) : (
            <motion.div
              key="lock"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Lock size={11} style={{ color: "hsla(0,0%,100%,0.4)" }} />
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={inputRef}
          value={displayUrl}
          data-no-obfuscate="true"
          onChange={(e) => onUrlChange(e.target.value)}
          onFocus={() => {
            onUrlChange(activeTab?.url || "");
            onUrlFocus(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!suggestWrapRef.current?.contains(document.activeElement)) {
                onUrlFocus(false);
              }
            }, 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSuggestOpen(false);
              onUrlFocus(false);
              return;
            }
            if (suggestOpen && suggestions.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setActiveIdx((prev) => {
                if (e.key === "ArrowDown") return prev < suggestions.length - 1 ? prev + 1 : 0;
                return prev > 0 ? prev - 1 : suggestions.length - 1;
              });
              return;
            }
            if (e.key === "Enter") {
              if (suggestOpen && activeIdx >= 0 && suggestions[activeIdx]) {
                e.preventDefault();
                pickSuggestion(suggestions[activeIdx]);
                return;
              }
              onNavigate(urlInput);
              setSuggestOpen(false);
            }
          }}
          placeholder="Enter a website or search query"
          className="pz-url-input flex-1 bg-transparent text-[12px] outline-none placeholder:text-white/35"
          style={{
            color: "hsla(0,0%,100%,0.9)",
            fontFamily: urlObfuscated
              ? "plusjakartasans-obf, sans-serif"
              : "inherit",
            fontWeight: urlObfuscated ? 600 : undefined,
            fontSynthesis: urlObfuscated ? "none" : undefined,
            fontVariantLigatures: urlObfuscated ? "none" : undefined,
          }}
          spellCheck={false}
          role="combobox"
          aria-expanded={suggestOpen}
          aria-autocomplete="list"
        />

        {!isUrlFocused && barTitle && (
          <span
            className="text-[10px] max-w-[40%] truncate"
            style={{ color: "hsla(0,0%,100%,0.4)" }}
            title={barTitle}
          >
            {barTitle}
          </span>
        )}

        {!isNewTab && activeTab?.url && !activeTab.url.startsWith("petezah://") ? (
          <button
            type="button"
            title={bookmarked ? "Remove bookmark" : "Bookmark this tab"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              const url = activeTab.url;
              const title = activeTab.title || url;
              const next = toggleBookmark(url, title);
              setBookmarked(next);
            }}
            className="p-1 rounded-md hover:bg-white/5 transition-colors flex-shrink-0"
            style={{ color: bookmarked ? "hsla(45, 90%, 62%, 0.95)" : "hsla(0,0%,100%,0.42)" }}
          >
            <Star size={12} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        ) : null}

        <AnimatePresence>
          {isUrlFocused && suggestOpen && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 right-0 top-full mt-1.5 z-[80] rounded-xl overflow-hidden"
              style={{
                background: "hsla(220, 32%, 8%, 0.96)",
                border: "1px solid hsla(210, 40%, 80%, 0.12)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
                backdropFilter: "blur(16px)",
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {suggestions.map((s, i) => {
                const active = i === activeIdx;
                const tag =
                  s.tag ||
                  (s.type === "web" ? "Web" : s.type === hrefs.kindG() ? hrefs.wordG() : s.type === "apps" ? "Apps" : "");
                const thumb = s.imageUrl && (s.type === hrefs.kindG() || s.type === "apps") ? s.imageUrl : "";
                return (
                  <button
                    key={`${s.type}-${s.label}-${i}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(s)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                    style={{
                      background: active ? "hsla(0,0%,100%,0.07)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        width={28}
                        height={28}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          objectFit: "cover",
                          flexShrink: 0,
                          background: "hsla(0,0%,100%,0.06)",
                        }}
                      />
                    ) : (
                      <Search size={11} style={{ color: "hsla(0,0%,100%,0.35)", flexShrink: 0 }} />
                    )}
                    <span className="flex-1 min-w-0 truncate text-[12px]" style={{ color: "hsla(0,0%,100%,0.88)" }}>
                      {s.type === "shortcut" ? (
                        <>
                          <span style={{ color: "hsla(0,0%,100%,0.45)" }}>{s.tag}: </span>
                          {s.label}
                        </>
                      ) : (
                        s.label
                      )}
                    </span>
                    {s.type !== "shortcut" && tag ? (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{
                          background: s.type === hrefs.kindG() ? "hsla(45, 80%, 50%, 0.16)" : "hsla(0,0%,100%,0.06)",
                          color: s.type === hrefs.kindG() ? "hsla(45, 90%, 70%, 0.95)" : "hsla(0,0%,100%,0.4)",
                        }}
                      >
                        {tag}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0" style={{ color: "hsla(0,0%,100%,0.78)" }}>
        <button
          ref={shieldBtnRef}
          type="button"
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm relative"
          title="Privacy filter"
          aria-expanded={shieldOpen}
          onClick={() => setShieldOpen((v) => !v)}
          style={{ color: shieldOn ? "hsla(145, 55%, 62%, 0.92)" : "hsla(0,0%,100%,0.55)" }}
        >
          <img
            src="/b/rivet/ublock.png"
            alt=""
            width={14}
            height={14}
            style={{
              display: "block",
              width: 14,
              height: 14,
              borderRadius: 3,
              objectFit: "contain",
              opacity: shieldOn ? 1 : 0.45,
            }}
          />
        </button>
        <button
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title={marks.a()}
          onClick={() => onNavigate(hrefs.g())}
        >
          <Gamepad2 size={13} />
        </button>
        <button
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title="AI"
          onClick={() => onNavigate("petezah://ai")}
        >
          <Bot size={13} />
        </button>

        <div className="w-px h-3.5 mx-0.5 toolbar-hide-sm" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />

        <button
          onClick={onNotificationClick}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          title="Account"
        >
          <User size={13} />
        </button>
        <button
          onClick={() => onNavigate("petezah://changelog")}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title="Changelog"
        >
          <FileText size={13} />
        </button>
        <button
          onClick={() => onNavigate("petezah://feedback")}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title="Feedback"
        >
          <MessageSquare size={13} />
        </button>

        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="More"
          >
            <MoreVertical size={13} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full right-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-2xl z-[120] overflow-hidden flex flex-col"
                style={{ maxHeight: "min(72vh, 460px)" }}
              >
                {canScrollUp && (
                  <button
                    type="button"
                    onClick={() => menuScrollRef.current?.scrollBy({ top: -80, behavior: "smooth" })}
                    className="flex-shrink-0 w-full flex items-center justify-center py-1 border-0 cursor-pointer"
                    style={{ background: "hsla(220, 28%, 12%, 0.9)", color: "hsla(0,0%,100%,0.55)" }}
                  >
                    <ChevronUp size={14} />
                  </button>
                )}
                <div
                  ref={menuScrollRef}
                  onScroll={syncMenuScroll}
                  className="overflow-y-auto py-1 flex-1 min-h-0"
                  style={{ scrollbarWidth: "none" }}
                >
                  {([
                    { label: "New Tab", icon: Plus, kbd: sc.newTab, run: () => onNewTab?.() },
                    { label: "Close Tab", icon: X, kbd: sc.closeTab, run: () => onCloseTab?.() },
                    { label: "Close All Tabs", icon: X, run: () => onCloseAllTabs?.() },
                  ] as const).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => { item.run(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <item.icon size={13} className="text-foreground/40" />
                      <span className="flex-1 text-left">
                        <ObfuscatedText as="span">{item.label}</ObfuscatedText>
                      </span>
                      {"kbd" in item && item.kbd ? (
                        <kbd className="text-[10px] text-muted-foreground font-mono">{formatShortcut(item.kbd)}</kbd>
                      ) : null}
                    </button>
                  ))}

                  <div className="h-px bg-border my-1 mx-3" />

                  <div className="flex items-center gap-1 px-4 py-1.5">
                    <span className="text-[12px] text-foreground/60 mr-auto">Zoom</span>
                    <button type="button" onClick={() => onZoomOut?.()} className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors">
                      <ZoomOut size={13} />
                    </button>
                    <button type="button" onClick={() => onResetZoom?.()} className="px-2 py-0.5 rounded hover:bg-accent text-[11px] font-mono text-foreground/70 min-w-[40px] text-center">
                      {zoomLevel}%
                    </button>
                    <button type="button" onClick={() => onZoomIn?.()} className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors">
                      <ZoomIn size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { onFullscreen?.(); setMenuOpen(false); }}
                      className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors ml-1"
                      title="Fullscreen"
                    >
                      <Maximize size={13} />
                    </button>
                  </div>

                  <div className="h-px bg-border my-1 mx-3" />

                  {([
                    { label: "History", icon: History, url: "petezah://history", kbd: sc.history },
                    { label: "Extensions", icon: Puzzle, url: "petezah://extensions", kbd: sc.extensions },
                    { label: "Bookmarks", icon: Bookmark, url: "petezah://bookmarks", kbd: sc.bookmarks },
                    { label: "Inspect", icon: Code2, kbd: sc.inspect, inspect: true },
                  ] as const).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        if ("inspect" in item && item.inspect) {
                          onInspect?.();
                          window.dispatchEvent(new CustomEvent("petezah-inspect"));
                        } else if ("url" in item && item.url) {
                          onNavigate(item.url);
                        }
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <item.icon size={13} className="text-foreground/40" />
                      <span className="flex-1 text-left">
                        <ObfuscatedText as="span">{item.label}</ObfuscatedText>
                      </span>
                      <kbd className="text-[10px] text-muted-foreground font-mono">{formatShortcut(item.kbd)}</kbd>
                    </button>
                  ))}

                  <div className="h-px bg-border my-1 mx-3" />

                  {([
                    { label: marks.a(), icon: Gamepad2, url: hrefs.g(), kbd: sc[hrefs.kindG() as keyof typeof sc] },
                    { label: marks.apps(), icon: AppWindow, url: "petezah://apps" },
                    { label: "AI", icon: Bot, url: "petezah://ai", kbd: sc.ai },
                    { label: marks.music(), icon: Music, url: hrefs.mu() },
                    { label: marks.movies(), icon: Film, url: hrefs.mo() },
                    { label: "VM", icon: Monitor, url: "petezah://vm" },
                    { label: "Chat", icon: MessageCircle, url: "petezah://chat" },
                    { label: "Tools", icon: Wrench, url: "petezah://tools", kbd: sc.tools },
                  ] as const).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => { onNavigate(item.url); setMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <item.icon size={13} className="text-foreground/40" />
                      <span className="flex-1 text-left">
                        <ObfuscatedText as="span">{item.label}</ObfuscatedText>
                      </span>
                      {"kbd" in item && item.kbd ? (
                        <kbd className="text-[10px] text-muted-foreground font-mono">{formatShortcut(item.kbd)}</kbd>
                      ) : null}
                    </button>
                  ))}

                  <div className="h-px bg-border my-1 mx-3" />

                  <button
                    type="button"
                    onClick={() => { handleShare(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Share size={13} className="text-foreground/40" />
                    <span className="flex-1 text-left">Copy URL</span>
                  </button>
                </div>
                {canScrollDown && (
                  <button
                    type="button"
                    onClick={() => menuScrollRef.current?.scrollBy({ top: 80, behavior: "smooth" })}
                    className="flex-shrink-0 w-full flex items-center justify-center py-1 border-0 cursor-pointer"
                    style={{ background: "hsla(220, 28%, 12%, 0.9)", color: "hsla(0,0%,100%,0.55)" }}
                  >
                    <ChevronDown size={14} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <ExtensionPopup
        open={shieldOpen}
        anchorEl={shieldBtnRef.current}
        onClose={() => setShieldOpen(false)}
        onManage={() => onNavigate("petezah://extensions")}
        tabId={activeTab?.id}
        tabUrl={activeTab?.url}
      />
    </div>
  );
}
