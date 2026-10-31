import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
  type ReactNode,
  type CSSProperties,
  type RefObject,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Bot,
  Music,
  Film,
  Gamepad2,
  AppWindow,
  ShieldCheck,
  Pencil,
  Trash2,
  Plus,
  Upload,
  X,
  MessageCircle,
  Info,
  Monitor,
  Link2,
  Folder,
  Flame,
  Code2,
  type LucideIcon,
} from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";
import { applyVpnRegion, isSignedIn, getVpnRegions } from "@/lib/vpn";
import { setPendingAuth } from "@/lib/authPending";
import { buildSearchUrl } from "@/lib/siteThemes";
import SearchEdgeGlow from "@/components/EdgeTraceGlow";
import {
  getBookmarks,
  ensureDefaultBookmarks,
} from "@/components/BookmarksPage";
import { isBookmarklet } from "@/lib/bookmarklets";
import { extensionPollMs } from "@/lib/liteDevice";
import ObfuscatedText from "./ObfuscatedText";
import { installFrameOpenTrap, parseAdTabUrl } from "@/lib/openTabBridge";
import { recordHistory } from "./HistoryPage";
import { runExtensionsOnFrame } from "./ExtensionsPage";
import { injectRivetIntoFrame, syncRivetTab } from "@/lib/rivet/host";
import { requestSyncSoon } from "@/lib/settingsSync";
import { openTrendingOverlay } from "@/lib/homeUrl";
import { hrefs, isGHref, marks } from "@/lib/uiMarks";
import { pathForTabUrl, trackSection } from "@/lib/lessonMetrics";
import { GameLaunchSplash } from "@/components/GameLaunchSplash";
import { introPending, markIntroSeen } from "@/lib/sessionIntro";

const GamesPage = lazy(() => import("./GamesPage"));
const GameViewerPage = lazy(() => import("./GameViewerPage"));
const AIPage = lazy(() => import("./AIPage"));
const AppsPage = lazy(() => import("./AppsPage"));
const MusicPage = lazy(() => import("./MusicPage"));
const ChatPage = lazy(() => import("./ChatPage"));
const MoviesPage = lazy(() => import("./MoviesPage"));
const FirefoxVmPage = lazy(() => import("./FirefoxVmPage"));
const AdViewerPage = lazy(() => import("./AdViewerPage"));
const AppViewerPage = lazy(() => import("./AppViewerPage"));
const ChangelogPage = lazy(() => import("./ChangelogPage"));
const FeedbackPage = lazy(() => import("./FeedbackPage"));
const AccountPage = lazy(() => import("./AccountPage"));
const HistoryPage = lazy(() => import("./HistoryPage"));
const ToolsPage = lazy(() => import("./ToolsPage"));
const ExtensionsPage = lazy(() => import("./ExtensionsPage"));
const BookmarksPage = lazy(() => import("./BookmarksPage"));
const ProfilePage = lazy(() => import("./ProfilePage"));
const TrendingDashboard = lazy(() => import("./TrendingDashboard"));

function TabPaneShell({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0"
      style={{ display: visible ? "block" : "none" }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}

function useSectionInsight(url: string, visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    const section = pathForTabUrl(url);
    trackSection(section, { force: section === "lab" });
  }, [url, visible]);
}

interface ContentAreaProps {
  tabs: Tab[];
  activeTab: Tab | undefined;
  splitTab: Tab | undefined;
  focusedPane?: "main" | "split";
  onFocusPane?: (pane: "main" | "split") => void;
  onNavigate: (url: string) => void;
  onNewTab: () => void;
  onCloseSplit: () => void;
  zoomLevel?: number;
  contentRef?: RefObject<HTMLDivElement | null>;
}

interface Preset {
  id: string;
  label: string;
  url: string;
  icon: string;
  builtIn?: boolean;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: hrefs.kindG(),
    label: marks.a(),
    url: hrefs.g(),
    icon: "gamepad",
    builtIn: true,
  },
  {
    id: "ai",
    label: "AI",
    url: "petezah://ai",
    icon: "bot",
    builtIn: true,
  },
  {
    id: "music",
    label: marks.music(),
    url: hrefs.mu(),
    icon: "music",
    builtIn: true,
  },
  {
    id: "movies",
    label: marks.movies(),
    url: hrefs.mo(),
    icon: "film",
    builtIn: true,
  },
  {
    id: "vm",
    label: "VM",
    url: "petezah://vm",
    icon: "monitor",
    builtIn: true,
  },
  {
    id: "apps",
    label: "Apps",
    url: "petezah://apps",
    icon: "appwindow",
    builtIn: true,
  },
  {
    id: "chat",
    label: "Chat",
    url: "petezah://chat",
    icon: "chat",
    builtIn: true,
  },
];

const ICON_MAP: Record<string, LucideIcon> = {
  bot: Bot,
  music: Music,
  film: Film,
  gamepad: Gamepad2,
  appwindow: AppWindow,
  chat: MessageCircle,
  monitor: Monitor,
};

const VPN_FLAGS: Record<string, ReactNode> = {
  default: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="w-4 h-4"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  ),
  "1": (
    <svg viewBox="0 0 900 600" className="w-4 h-4 rounded-[2px]">
      <rect width="900" height="600" fill="#fff" />
      <rect width="225" height="600" fill="#d80621" />
      <rect x="675" width="225" height="600" fill="#d80621" />
      <g fill="#d80621" transform="translate(450,300) scale(0.55)">
        <path d="M0-80 C-10-40-40-30-40 0 C-40 25-20 30 0 20 C20 30 40 25 40 0 C40-30 10-40 0-80Z" />
        <rect x="-8" y="20" width="16" height="50" />
        <path d="M-40-10 C-60-20-70 0-50 10 C-40 14-30 10-30 10Z" />
        <path d="M40-10 C60-20 70 0 50 10 C40 14 30 10 30 10Z" />
        <rect x="-30" y="5" width="60" height="10" rx="5" />
      </g>
    </svg>
  ),
  "2": (
    <svg viewBox="0 0 19 10" className="w-4 h-4 rounded-[2px]">
      <rect width="19" height="10" fill="#B22234" />
      {[0, 2, 4, 6, 8].map((y) => (
        <rect
          key={y}
          y={y}
          width="19"
          height="1"
          fill={y === 0 ? "#B22234" : "#fff"}
        />
      ))}
      {[1, 3, 5, 7].map((y) => (
        <rect key={y} y={y} width="19" height="1" fill="#fff" />
      ))}
      <rect width="8" height="5.4" fill="#3C3B6E" />
    </svg>
  ),
  "3": (
    <svg viewBox="0 0 19 10" className="w-4 h-4 rounded-[2px]">
      <rect width="19" height="10" fill="#B22234" />
      {[1, 3, 5, 7].map((y) => (
        <rect key={y} y={y} width="19" height="1" fill="#fff" />
      ))}
      <rect width="8" height="5.4" fill="#3C3B6E" />
    </svg>
  ),
  "4": (
    <svg viewBox="0 0 19 10" className="w-4 h-4 rounded-[2px]">
      <rect width="19" height="10" fill="#B22234" />
      {[1, 3, 5, 7].map((y) => (
        <rect key={y} y={y} width="19" height="1" fill="#fff" />
      ))}
      <rect width="8" height="5.4" fill="#3C3B6E" />
    </svg>
  ),
  "5": (
    <svg viewBox="0 0 60 40" className="w-4 h-4 rounded-[2px]">
      <clipPath id="uk-clip">
        <rect width="60" height="40" />
      </clipPath>
      <g clipPath="url(#uk-clip)">
        <rect width="60" height="40" fill="#00247d" />
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
        <path
          d="M0,0 L60,40 M60,0 L0,40"
          stroke="#cf142b"
          strokeWidth="4"
          clipPath="url(#uk-diag-clip)"
        />
        <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="14" />
        <path d="M30,0 V40 M0,20 H60" stroke="#cf142b" strokeWidth="8" />
      </g>
    </svg>
  ),
  tor: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="w-4 h-4"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      <circle cx="12" cy="12" r="7" strokeDasharray="2 2" />
    </svg>
  ),
};

function listVpnRegions() {
  return getVpnRegions().map((r) => ({
    ...r,
    flag: VPN_FLAGS[r.id] ?? (r.id === "custom" ? "✦" : VPN_FLAGS.default),
  }));
}

function VpnSelector({
  onNavigate,
  compact = false,
}: {
  onNavigate: (url: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [regions, setRegions] = useState(listVpnRegions);
  const [selected, setSelected] = useState<string>(
    () => localStorage.getItem("selectedVpnRegion") ?? "default",
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setInfoOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "selectedVpnRegion" && e.newValue) setSelected(e.newValue);
      if (e.key === "proxServer") setRegions(listVpnRegions());
    };
    const sync = () => {
      setRegions(listVpnRegions());
      const sel = localStorage.getItem("selectedVpnRegion");
      if (sel) setSelected(sel);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("petezah-settings-updated", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("petezah-settings-updated", sync);
    };
  }, []);

  const current = regions.find((r) => r.id === selected) ?? regions[0];

  const handleSelect = async (id: string) => {
    const region = regions.find((r) => r.id === id);
    if (!region) return;
    if (region.requiresAuth) {
      const ok = await isSignedIn();
      if (!ok) {
        setPendingAuth({ type: "tor" });
        setOpen(false);
        onNavigate("petezah://account");
        return;
      }
    }
    setSelected(id);
    setOpen(false);
    setInfoOpen(false);
    await applyVpnRegion(id);
  };

  return (
    <div ref={ref} className={`relative ${compact ? "flex-shrink-0 z-[3]" : "mt-2"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={current?.label || "VPN"}
        className={
          compact
            ? "w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105"
            : "flex items-center gap-2 px-3 py-1.5 rounded-full glass-subtle border border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        }
        style={
          compact
            ? {
                background: open ? "hsla(210, 40%, 70%, 0.14)" : "hsla(220, 35%, 8%, 0.55)",
                border: `1px solid ${open ? "hsla(210, 40%, 80%, 0.28)" : "hsla(210, 40%, 80%, 0.14)"}`,
                color: "hsla(0,0%,100%,0.9)",
              }
            : undefined
        }
      >
        {compact ? (
          <span className="text-[13px] leading-none">{current?.flag || "🌐"}</span>
        ) : (
          <>
            <ShieldCheck size={11} className="flex-shrink-0" />
            <span className="flex items-center gap-1.5">
              {current.flag}
              {current.label}
            </span>
            <span className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: compact ? 6 : -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: compact ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 w-56 rounded-2xl border shadow-2xl p-2 flex flex-col gap-1 ${
              compact ? "right-0 top-full mt-2" : "bottom-full mb-2 left-1/2 -translate-x-1/2"
            }`}
            style={{
              background: "hsla(220, 32%, 8%, 0.96)",
              borderColor: "hsla(210, 40%, 80%, 0.12)",
              backdropFilter: "blur(16px)",
            }}
          >
            <p className="text-[9px] uppercase tracking-widest px-2 pb-1" style={{ color: "hsla(0,0%,100%,0.4)" }}>
              VPN Region
            </p>
            {regions.map((region) => (
              <div key={region.id} className="relative flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSelect(region.id)}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors flex-1 min-w-0"
                  style={{
                    background: selected === region.id ? "hsla(210, 40%, 70%, 0.12)" : "transparent",
                    border: `1px solid ${selected === region.id ? "hsla(210, 40%, 70%, 0.22)" : "transparent"}`,
                    color: selected === region.id ? "hsla(0,0%,100%,0.95)" : "hsla(0,0%,100%,0.62)",
                  }}
                >
                  <span className="flex-shrink-0 text-[13px]">{region.flag}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-[11px] font-medium leading-tight">{region.label}</span>
                    <span className="text-[9px] opacity-60 leading-tight">{region.sublabel}</span>
                  </span>
                  {selected === region.id && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  )}
                </button>
                {region.id === "tor" && (
                  <button
                    type="button"
                    aria-label="About Tor"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoOpen((v) => !v);
                    }}
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                    style={{ color: "hsla(0,0%,100%,0.45)" }}
                  >
                    <Info size={12} />
                  </button>
                )}
              </div>
            ))}
            <AnimatePresence>
              {infoOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="mt-1 mx-1 p-2.5 rounded-xl text-[10px] leading-relaxed space-y-1.5"
                    style={{
                      color: "hsla(0,0%,100%,0.55)",
                      border: "1px solid hsla(210, 40%, 80%, 0.1)",
                      background: "hsla(220, 30%, 6%, 0.8)",
                    }}
                  >
                    <p className="font-semibold text-[11px]" style={{ color: "hsla(0,0%,100%,0.88)" }}>
                      About Tor
                    </p>
                    <p>
                      Tor routes your traffic through volunteer onion relays so the destination site sees a Tor exit IP instead of yours. It is slower and some sites block Tor exits.
                    </p>
                    <p>
                      By selecting Tor you agree to use it only for lawful browsing on this site, accept reduced speed and reliability, and understand exit nodes can see unencrypted traffic to destinations. You must be signed in. Misuse may result in loss of access.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getStoredPresets(): Preset[] {
  try {
    const stored = localStorage.getItem("petezah-presets");
    if (stored) {
      const parsed = JSON.parse(stored) as Preset[];
      if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
      const ids = new Set(parsed.map((p) => p.id));
      const missing = DEFAULT_PRESETS.filter(
        (p) => p.builtIn && !ids.has(p.id),
      );
      if (missing.length === 0) return parsed;
      const moviesIdx = parsed.findIndex(
        (p) => p.id === "movies" || p.url === hrefs.mo(),
      );
      const next = [...parsed];
      if (moviesIdx >= 0) next.splice(moviesIdx + 1, 0, ...missing);
      else next.push(...missing);
      return next;
    }
  } catch {}
  return DEFAULT_PRESETS;
}

function savePresetsToStorage(presets: Preset[]) {
  try {
    localStorage.setItem("petezah-presets", JSON.stringify(presets));
    requestSyncSoon();
  } catch {}
}

function NewTabSearchBar({
  onNavigate,
}: {
  onNavigate: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [edgeGlow, setEdgeGlow] = useState(
    () => localStorage.getItem("searchEdgeGlow") !== "false"
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setEdgeGlow(localStorage.getItem("searchEdgeGlow") !== "false");
    window.addEventListener("petezah-settings-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("petezah-settings-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = () => {
    if (!query.trim()) return;
    let url = query.trim();
    if (url.startsWith("http") || url.includes(".")) {
      if (!url.startsWith("http")) url = "https://" + url;
    } else {
      url = buildSearchUrl(url);
    }
    onNavigate(url);
    setQuery("");
  };

  return (
    <div className="w-full max-w-lg">
      <div className="relative flex items-center gap-3 rounded-2xl nt-search px-5 py-3 transition-all duration-200 focus-within:border-white/15">
        <SearchEdgeGlow enabled={edgeGlow} />
        <Search size={15} className="text-muted-foreground flex-shrink-0 relative z-[1]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Enter a website or search query"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none relative z-[1]"
          spellCheck={false}
        />
        <kbd className="hidden sm:flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-muted-foreground relative z-[1]">
          {typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) ? "⌘" : "Ctrl"}+K
        </kbd>
      </div>
    </div>
  );
}

function PresetEditModal({
  preset,
  onSave,
  onDelete,
  onClose,
}: {
  preset: Preset | null;
  onSave: (p: Preset) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(preset?.label || "");
  const [url, setUrl] = useState(preset?.url || "");
  const [iconData, setIconData] = useState(preset?.icon || "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setIconData(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({
      id: preset?.id || String(Date.now()),
      label: label.trim(),
      url: url.trim() || "about:blank",
      icon: iconData || "bot",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 5 }}
        className="relative z-10 w-full max-w-xs bg-card border border-border rounded-2xl p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            {preset ? "Edit Preset" : "Add Preset"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Title
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Icon
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors"
            >
              <Upload size={12} />
              <span>
                {iconData?.startsWith("data:")
                  ? "Image selected"
                  : "Upload image"}
              </span>
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PresetCard({
  preset,
  onClick,
  onEdit,
  index = 0,
}: {
  preset: Preset;
  onClick: () => void;
  onEdit: () => void;
  index?: number;
}) {
  const IconComp = ICON_MAP[preset.icon];
  const isCustomImage = preset.icon?.startsWith("data:");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: 0.32 + index * 0.04,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="relative group"
    >
      <button
        type="button"
        title={preset.label}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          onEdit();
        }}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 newtab-preset-btn"
        style={{
          background: "hsla(220, 35%, 5%, 0.92)",
          border: "1px solid hsla(210, 40%, 80%, 0.12)",
          color: "hsla(0,0%,100%,0.82)",
        }}
      >
        {isCustomImage ? (
          <img
            src={preset.icon}
            alt=""
            className="w-3.5 h-3.5 object-cover rounded-full"
          />
        ) : IconComp ? (
          <IconComp size={13} />
        ) : (
          <span className="text-[9px] font-semibold">{preset.label[0]}</span>
        )}
      </button>
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 rounded-md text-[9px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20"
        style={{
          background: "hsla(220, 35%, 5%, 0.95)",
          border: "1px solid hsla(210, 40%, 80%, 0.14)",
          color: "hsla(0,0%,100%,0.88)",
        }}
      >
        <ObfuscatedText as="span">{preset.label}</ObfuscatedText>
      </span>
    </motion.div>
  );
}

function NewTabBookmarks({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [data, setData] = useState(() => ensureDefaultBookmarks());
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const folderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setData(getBookmarks());
    window.addEventListener("petezah-settings-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("petezah-settings-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!openFolder) return;
    const onDown = (e: MouseEvent) => {
      if (folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setOpenFolder(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openFolder]);

  const ungrouped = data.items.filter((b) => !b.groupId);
  const groups = data.groups;

  const chip = (
    key: string,
    title: string,
    onClick: () => void,
    opts?: { icon?: string; folder?: boolean; bookmarklet?: boolean }
  ) => (
    <div key={key} className="relative group">
      <button
        type="button"
        title={title}
        onClick={onClick}
        className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center transition-all duration-200 hover:scale-110 p-0 border-0 bg-transparent"
      >
        {opts?.folder ? (
          <Folder size={10} style={{ color: "hsla(210, 40%, 85%, 0.78)" }} />
        ) : opts?.bookmarklet ? (
          <Code2 size={10} style={{ color: "hsla(205, 80%, 70%, 0.9)" }} />
        ) : (
          <img
            src={opts?.icon || ""}
            alt=""
            className="w-full h-full object-contain"
            draggable={false}
          />
        )}
      </button>
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 rounded-md text-[9px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-[80]"
        style={{
          background: "hsla(220, 35%, 5%, 0.95)",
          border: "1px solid hsla(210, 40%, 80%, 0.14)",
          color: "hsla(0,0%,100%,0.88)",
        }}
      >
        {title}
      </span>
    </div>
  );

  return (
    <motion.div
      className="absolute top-3 left-3 z-[20] flex flex-col gap-1.5 items-start max-w-[46vw]"
      ref={folderRef}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="relative z-30 flex items-center gap-3 flex-wrap w-full px-3 py-1.5 rounded-xl overflow-visible"
        style={{
          background: "hsla(220, 35%, 6%, 0.92)",
          border: "1px solid hsla(210, 40%, 80%, 0.14)",
          backdropFilter: "blur(10px)",
        }}
      >
      {ungrouped.map((b) =>
        chip(b.id, b.title, () => onNavigate(b.url), {
          icon: b.favicon || "/icons/bookmarks/instagram.svg",
          bookmarklet: isBookmarklet(b.url),
        })
      )}
      {groups.map((g) => {
        const kids = data.items.filter((b) => b.groupId === g.id);
        return (
          <div key={g.id} className="relative">
            {chip(
              g.id,
              g.name,
              () => setOpenFolder((cur) => (cur === g.id ? null : g.id)),
              { folder: true }
            )}
            <AnimatePresence>
              {openFolder === g.id && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -3, scale: 0.97 }}
                  className="absolute left-0 top-full mt-2 z-40 min-w-[150px] rounded-xl p-1.5 flex flex-col gap-0.5"
                  style={{
                    background: "hsla(220, 32%, 8%, 0.96)",
                    border: "1px solid hsla(210, 40%, 80%, 0.12)",
                    backdropFilter: "blur(14px)",
                    boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
                  }}
                >
                  {kids.length === 0 ? (
                    <p className="text-[10px] px-2 py-1.5" style={{ color: "hsla(0,0%,100%,0.4)" }}>
                      Empty folder
                    </p>
                  ) : (
                    kids.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setOpenFolder(null);
                          onNavigate(b.url);
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] transition-colors"
                        style={{ color: "hsla(0,0%,100%,0.85)" }}
                      >
                        {isBookmarklet(b.url) ? (
                          <Code2 size={12} style={{ color: "hsla(205, 80%, 70%, 0.9)", flexShrink: 0 }} />
                        ) : (
                          <img src={b.favicon || "/icons/bookmarks/instagram.svg"} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                        )}
                        <span className="truncate">{b.title}</span>
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      <div className="relative group">
        <button
          type="button"
          title="Bookmarks"
          onClick={() => onNavigate("petezah://bookmarks")}
          className="w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 border-0 bg-transparent"
          style={{ color: "hsla(0,0%,100%,0.45)" }}
        >
          <Plus size={10} />
        </button>
        <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 rounded-md text-[9px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-[80]"
        style={{
          background: "hsla(220, 35%, 5%, 0.95)",
          border: "1px solid hsla(210, 40%, 80%, 0.14)",
          color: "hsla(0,0%,100%,0.88)",
        }}
      >
          Bookmarks
        </span>
      </div>
      </div>
      <button
        type="button"
        onClick={() => openTrendingOverlay()}
        className="relative z-10 inline-flex items-center justify-center gap-1.5 self-start px-2.5 py-1.5 rounded-xl text-[10px] font-semibold tracking-wide cursor-pointer transition-all duration-200"
        style={{
          background: "hsla(220, 35%, 6%, 0.92)",
          border: "1px solid hsla(210, 40%, 80%, 0.14)",
          color: "hsla(0, 0%, 96%, 0.9)",
          backdropFilter: "blur(10px)",
          width: "fit-content",
          maxWidth: "100%",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "hsla(210, 40%, 80%, 0.28)";
          e.currentTarget.style.background = "hsla(220, 24%, 16%, 0.72)";
          e.currentTarget.style.color = "hsla(0, 0%, 100%, 0.98)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "hsla(210, 40%, 80%, 0.14)";
          e.currentTarget.style.background = "hsla(220, 35%, 6%, 0.92)";
          e.currentTarget.style.color = "hsla(0, 0%, 96%, 0.9)";
        }}
      >
        <Flame size={11} />
        Trending
      </button>
    </motion.div>
  );
}

function NewTabPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [presets, setPresets] = useState<Preset[]>(getStoredPresets);
  const [editingPreset, setEditingPreset] = useState<Preset | null | "new">(
    null,
  );

  const savePresets = useCallback((updated: Preset[]) => {
    setPresets(updated);
    savePresetsToStorage(updated);
  }, []);

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-transparent">
      <NewTabBookmarks onNavigate={onNavigate} />
      <div className="absolute top-3 right-3 z-[10] flex flex-col items-end gap-1.5 newtab-side-actions">
        <motion.a
          href="https://discord.gg/cYjHFDguxS"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55, ease }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all"
          style={{
            background: "hsla(220, 35%, 6%, 0.92)",
            border: "1px solid hsla(210, 40%, 80%, 0.14)",
            color: "hsla(0,0%,100%,0.88)",
            backdropFilter: "blur(10px)",
          }}
        >
          <MessageCircle size={11} style={{ color: "hsla(0,0%,100%,0.92)" }} />
          <span>Discord</span>
        </motion.a>
        <motion.button
          type="button"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.62, ease }}
          onClick={() => {
            try {
              sessionStorage.setItem("pz-account-section", "get-links");
            } catch {}
            onNavigate("petezah://account");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all"
          style={{
            background: "hsla(220, 35%, 6%, 0.78)",
            border: "1px solid hsla(210, 40%, 80%, 0.12)",
            color: "hsla(0,0%,100%,0.72)",
            backdropFilter: "blur(10px)",
          }}
        >
          <Link2 size={10} style={{ color: "hsla(0,0%,100%,0.78)" }} />
          <span>Get Links</span>
        </motion.button>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5 max-w-2xl w-full px-6 text-center newtab-hero">
        <motion.h1
          initial={{
            opacity: 0,
            y: 18,
            letterSpacing: "0.18em",
            filter: "blur(8px)",
          }}
          animate={{
            opacity: 1,
            y: 0,
            letterSpacing: "-0.03em",
            filter: "blur(0px)",
          }}
          transition={{ duration: 0.85, ease }}
          className="text-[2rem] sm:text-[2.15rem] font-extrabold text-white tracking-tight"
          style={{ textShadow: "0 0 40px hsla(205, 80%, 60%, 0.25)" }}
        >
          <ObfuscatedText as="span">PeteZah</ObfuscatedText>
        </motion.h1>

        <motion.div
          initial={{ opacity: 1, y: 10, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.12, ease }}
          className="w-full flex justify-center"
        >
          <NewTabSearchBar onNavigate={onNavigate} />
        </motion.div>

        <div className="flex items-center justify-center gap-2.5 py-1 flex-wrap px-3 newtab-presets">
          {presets.map((preset, i) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              index={i}
              onClick={() => onNavigate(preset.url)}
              onEdit={() => setEditingPreset(preset)}
            />
          ))}
          <motion.button
            type="button"
            title="Add"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.4,
              delay: 0.32 + presets.length * 0.04,
              ease,
            }}
            onClick={() => setEditingPreset("new")}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 newtab-preset-btn"
            style={{
              background: "hsla(220, 35%, 5%, 0.72)",
              border: "1px dashed hsla(210, 40%, 80%, 0.22)",
              color: "hsla(0,0%,100%,0.45)",
            }}
          >
            <Plus size={13} />
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.55,
            delay: 0.42 + presets.length * 0.03,
            ease,
          }}
        >
          <VpnSelector onNavigate={onNavigate} />
        </motion.div>
      </div>
      <AnimatePresence>
        {editingPreset && (
          <PresetEditModal
            preset={editingPreset === "new" ? null : editingPreset}
            onSave={(p) => {
              if (editingPreset === "new") {
                savePresets([...presets, p]);
              } else {
                savePresets(presets.map((x) => (x.id === p.id ? p : x)));
              }
              setEditingPreset(null);
            }}
            onDelete={
              editingPreset !== "new"
                ? () => {
                    savePresets(
                      presets.filter(
                        (x) => x.id !== (editingPreset as Preset).id,
                      ),
                    );
                    setEditingPreset(null);
                  }
                : undefined
            }
            onClose={() => setEditingPreset(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RemotePaneHost({ tab, isVisible }: { tab: Tab; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const introClaimedRef = useRef(false);
  const [introActive, setIntroActive] = useState(false);

  useEffect(() => {
    if (!tab.frame?.frame || introClaimedRef.current) return;
    introClaimedRef.current = true;
    if (introPending()) setIntroActive(true);
  }, [tab.frame]);

  const onIntroDone = useCallback(() => {
    markIntroSeen();
    setIntroActive(false);
  }, []);

  useEffect(() => {
    if (!tab.frame?.frame) return;
    const container = containerRef.current;
    if (!container) return;
    const frame = tab.frame.frame as HTMLIFrameElement;
    if (frame.parentElement !== container) {
      container.appendChild(frame);
    }
    frame.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:none;z-index:2;";
  }, [tab.frame]);

  useEffect(() => {
    if (!tab.frame?.frame) return;
    (tab.frame.frame as HTMLIFrameElement).style.display = isVisible
      ? "block"
      : "none";
  }, [isVisible, tab.frame]);

  useEffect(() => {
    if (!isVisible || !tab.frame?.frame) return;
    const iframe = tab.frame.frame as HTMLIFrameElement;

    const inject = (url?: string) => {
      const pageUrl = url || tab.url;
      runExtensionsOnFrame(iframe, pageUrl);
      syncRivetTab({
        id: tab.id,
        url:
          !pageUrl || pageUrl.startsWith("petezah://")
            ? "about:blank"
            : pageUrl,
        title: tab.title,
        favicon: tab.favicon,
        iframe,
        active: isVisible,
      });
      void injectRivetIntoFrame(iframe, tab.id, pageUrl);
      installFrameOpenTrap(iframe);
    };

    inject();
    const onLoad = () => inject();
    iframe.addEventListener("load", onLoad);

    const onUrl = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tabId === tab.id && detail?.url) {
        try {
          (iframe as any).__pzExtRan = new Set();
          (iframe as any).__pzShieldRan = new Set();
        } catch {}
        setTimeout(() => inject(detail.url), 250);
      }
    };
    window.addEventListener("petezah-url-change", onUrl);

    const pollMs = extensionPollMs();
    const pollTick = () => {
      if (document.hidden) return;
      inject();
    };
    const poll = window.setInterval(pollTick, pollMs);
    const onVis = () => {
      if (!document.hidden) inject();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("petezah-url-change", onUrl);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, [isVisible, tab.frame, tab.id, tab.url]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: isVisible ? "block" : "none" }}
    >
      {introActive && (
        <GameLaunchSplash beneath onDone={onIntroDone} minMs={2400} />
      )}
    </div>
  );
}

function ExtensionAwareIframe({
  src,
  pageUrl,
  isVisible,
}: {
  src: string;
  pageUrl: string;
  isVisible: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isVisible) return;
    const iframe = ref.current;
    if (!iframe) return;
    const inject = () => {
      runExtensionsOnFrame(iframe, pageUrl);
      void injectRivetIntoFrame(iframe, "legacy", pageUrl);
    };
    inject();
    iframe.addEventListener("load", inject);
    const pollMs = extensionPollMs();
    const pollTick = () => {
      if (document.hidden) return;
      inject();
    };
    const poll = window.setInterval(pollTick, pollMs);
    const onVis = () => {
      if (!document.hidden) inject();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      iframe.removeEventListener("load", inject);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, [src, pageUrl, isVisible]);

  return (
    <iframe
      ref={ref}
      src={src}
      className="w-full h-full border-none"
      title={hrefs.modeP()}
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation"
      allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
    />
  );
}

function TabPane({
  tab,
  isVisible,
  onNavigate,
}: {
  tab: Tab;
  isVisible: boolean;
  onNavigate: (url: string) => void;
}) {
  const isNewTab =
    !tab.url ||
    tab.url === "petezah://newtab" ||
    tab.url === "about:blank" ||
    tab.url === "https://";

  const isGames = isGHref(tab.url);
  const isAI = tab.url === "petezah://ai";
  const isApps = tab.url === "petezah://apps";
  const isMusic = tab.url === hrefs.mu() || tab.url.startsWith(hrefs.mu() + "?");
  const isChat = tab.url === "petezah://chat";
  const isMovies = tab.url === hrefs.mo();
  const isFirefox =
    tab.url === "petezah://vm" || tab.url === "petezah://firefox";
  const isTrending = tab.url === "petezah://trending";
  const isUserProfile = tab.url.startsWith("petezah://user/");
  const isGameViewer = tab.url.startsWith(hrefs.gv());
  const displayUrl = isGameViewer ? hrefs.gv() : tab.url;
  const isAppViewer = tab.url.startsWith("petezah://appviewer");

  useSectionInsight(tab.url, isVisible);

  if (isGameViewer) {
    const params = new URLSearchParams(tab.url.split("?")[1] || "");
    const gameUrl = params.get("url") || "";
    const gameTitle =
      params.get("title") ||
      (tab.title && tab.title !== "New Tab" && tab.title !== "Gameviewer"
        ? tab.title
        : "") ||
      "";
    const moduleId = params.get("gid") || "";
    return (
      <TabPaneShell visible={isVisible}>
        <GameViewerPage
          url={gameUrl}
          title={gameTitle}
          moduleId={moduleId}
          onBack={() => onNavigate(hrefs.g())}
        />
      </TabPaneShell>
    );
  }
  if (isNewTab) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <NewTabPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (isTrending) {
    return (
      <TabPaneShell visible={isVisible}>
        <TrendingDashboard variant="page" onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (isGames) {
    const params = new URLSearchParams(tab.url.split("?")[1] || "");
    const adminEdit = params.get("adminEdit") === "1";
    return (
      <TabPaneShell visible={isVisible}>
        <GamesPage onNavigate={onNavigate} adminEdit={adminEdit} />
      </TabPaneShell>
    );
  }

  if (isAI) {
    return (
      <TabPaneShell visible={isVisible}>
        <AIPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (isApps) {
    return (
      <TabPaneShell visible={isVisible}>
        <AppsPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (isMusic) {
    return (
      <TabPaneShell visible={isVisible}>
        <MusicPage onNavigate={onNavigate} initialUrl={tab.url} />
      </TabPaneShell>
    );
  }

  if (isUserProfile) {
    const handle = tab.url.replace(/^petezah:\/\/user\//, "");
    return (
      <TabPaneShell visible={isVisible}>
        <ProfilePage username={handle} onNavigate={onNavigate} embedded />
      </TabPaneShell>
    );
  }

  if (isChat) {
    return (
      <TabPaneShell visible={isVisible}>
        <ChatPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (isMovies) {
    return (
      <TabPaneShell visible={isVisible}>
        <MoviesPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (isFirefox) {
    return (
      <TabPaneShell visible={isVisible}>
        <FirefoxVmPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (tab.url.startsWith("petezah://ad")) {
    const adUrl = parseAdTabUrl(tab.url) || "";
    return (
      <TabPaneShell visible={isVisible}>
        {adUrl ? <AdViewerPage url={adUrl} /> : null}
      </TabPaneShell>
    );
  }

  if (tab.url === "petezah://changelog") {
    return (
      <TabPaneShell visible={isVisible}>
        <ChangelogPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (tab.url === "petezah://feedback") {
    return (
      <TabPaneShell visible={isVisible}>
        <FeedbackPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (tab.url === "petezah://settings") {
    return (
      <TabPaneShell visible={isVisible}>
        <AccountPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (tab.url === "petezah://account") {
    return (
      <TabPaneShell visible={isVisible}>
        <AccountPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (tab.url === "petezah://history") {
    return (
      <TabPaneShell visible={isVisible}>
        <HistoryPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }
  if (tab.url === "petezah://extensions") {
    return (
      <TabPaneShell visible={isVisible}>
        <ExtensionsPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }
  if (tab.url === "petezah://bookmarks") {
    return (
      <TabPaneShell visible={isVisible}>
        <BookmarksPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }
  if (tab.url === "petezah://tools" || tab.url.startsWith("petezah://tools?")) {
    return (
      <TabPaneShell visible={isVisible}>
        <ToolsPage onNavigate={onNavigate} />
      </TabPaneShell>
    );
  }

  if (isAppViewer) {
    const params = new URLSearchParams(tab.url.split("?")[1] || "");
    const appUrl = params.get("url") || "";
    const appTitle =
      params.get("title") ||
      (tab.title && tab.title !== "New Tab" && tab.title !== "Appviewer"
        ? tab.title
        : "") ||
      "";
    return (
      <TabPaneShell visible={isVisible}>
        <AppViewerPage
          url={appUrl}
          title={appTitle}
          onBack={() => onNavigate("petezah://apps")}
        />
      </TabPaneShell>
    );
  }

  return (
    <div
      className="absolute inset-0 w-full h-full"
      style={{ display: isVisible ? "block" : "none" }}
    >
      {tab.frame ? (
        <RemotePaneHost tab={tab} isVisible={isVisible} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-transparent">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <div className="w-16 h-16 rounded-full bg-foreground/5 border border-border" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-foreground/30" />
          </div>
        </motion.div>
        <div className="text-center">
          <h2 className="text-base font-medium text-foreground">
            Nothing to see
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Open a tab to begin
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function ContentArea({
  tabs,
  activeTab,
  splitTab,
  focusedPane = "main",
  onFocusPane,
  onNavigate,
  onNewTab,
  onCloseSplit,
  zoomLevel = 100,
  contentRef,
}: ContentAreaProps) {
  if (!activeTab && tabs.length === 0) {
    return (
      <div
        ref={contentRef}
        className="flex-1 flex relative w-full min-h-0 bg-transparent"
        style={{ overflow: "clip" }}
      >
        <EmptyState />
      </div>
    );
  }

  const mainTabs = tabs.filter((t) => !splitTab || t.id !== splitTab.id);
  const leftActive =
    activeTab && splitTab && activeTab.id === splitTab.id
      ? mainTabs[0]
      : activeTab;

  const scale = zoomLevel / 100;
  const zoomStyle: CSSProperties =
    scale === 1
      ? { width: "100%", height: "100%" }
      : {
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        };

  return (
    <div
      ref={contentRef}
      className="flex-1 flex relative w-full min-h-0 bg-transparent [&:fullscreen]:bg-[hsla(220,35%,5%,1)]"
      style={{ overflow: scale === 1 ? "clip" : "auto" }}
    >
      <div
        className="flex flex-1 relative w-full h-full min-h-0"
        style={zoomStyle}
      >
        <div
          className="flex-1 relative bg-transparent min-w-0"
          onMouseDown={() => onFocusPane?.("main")}
          style={{
            outline:
              focusedPane === "main" && splitTab
                ? "1px solid hsl(210 100% 65% / 0.25)"
                : undefined,
            outlineOffset: -1,
          }}
        >
          {mainTabs.length === 0 ? (
            <EmptyState />
          ) : (
            mainTabs.map((tab) => (
              <TabPane
                key={tab.id}
                tab={tab}
                isVisible={leftActive?.id === tab.id}
                onNavigate={onNavigate}
              />
            ))
          )}
        </div>

        {splitTab && (
          <>
            <div className="w-px bg-border/40 flex-shrink-0" />
            <div
              className="flex-1 relative min-w-0"
              onMouseDown={() => onFocusPane?.("split")}
              style={{
                outline:
                  focusedPane === "split"
                    ? "1px solid hsl(210 100% 65% / 0.25)"
                    : undefined,
                outlineOffset: -1,
              }}
            >
              <TabPane tab={splitTab} isVisible onNavigate={onNavigate} />
              <button
                onClick={onCloseSplit}
                className="absolute top-2 right-2 z-50 p-1.5 rounded-lg glass-heavy border border-border text-foreground/70 hover:text-white transition-colors"
                title="Close split view"
              >
                <X size={11} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}