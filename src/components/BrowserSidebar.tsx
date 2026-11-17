import { motion } from "framer-motion";
import {
  Plus,
  PanelLeftClose,
  PanelLeft,
  User,
  History,
  Bookmark,
  Puzzle,
  Command,
  Bot,
  Music,
  Film,
  Gamepad2,
  AppWindow,
  MessageCircle,
  Monitor,
  Wrench,
} from "lucide-react";
import { TabList } from "@/components/TabItem";
import ObfuscatedText from "@/components/ObfuscatedText";
import { Tab, Space } from "@/hooks/useBrowserState";
import { getHomeUrl } from "@/lib/homeUrl";
import { defaultBrandSrc, hrefs, marks } from "@/lib/uiMarks";
import { useEffect, useState } from "react";

interface SidebarProps {
  spaces: Space[];
  activeSpaceId: string;
  pinnedTabs: Tab[];
  unpinnedTabs: Tab[];
  activeTabId: string;
  splitTabId?: string | null;
  collapsed: boolean;
  onSpaceSwitch: (id: string) => void;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabPin: (id: string) => void;
  onTabSplit: (id: string) => void;
  onTabReorder?: (orderedIds: string[]) => void;
  onAddTab: () => void;
  onToggleCollapse: () => void;
  onAccountClick: () => void;
  onNavigate: (url: string) => void;
  user?: {
    username?: string;
    email?: string;
    avatar_url?: string;
    is_admin?: number;
  } | null;
  hideTabs?: boolean;
}

const SIDEBAR_FEATURES = [
  { icon: Gamepad2, label: marks.a(), url: hrefs.g() },
  { icon: AppWindow, label: marks.apps(), url: "petezah://apps" },
  { icon: Bot, label: "AI", url: "petezah://ai" },
  { icon: Music, label: marks.music(), url: hrefs.mu() },
  { icon: Film, label: marks.movies(), url: hrefs.mo() },
  { icon: Monitor, label: "VM", url: "petezah://vm" },
  { icon: MessageCircle, label: "Chat", url: "petezah://chat" },
  { icon: Wrench, label: "Tools", url: "petezah://tools" },
];

export default function Sidebar({
  spaces,
  activeSpaceId,
  pinnedTabs,
  unpinnedTabs,
  activeTabId,
  splitTabId,
  collapsed,
  onSpaceSwitch,
  onTabSelect,
  onTabClose,
  onTabPin,
  onTabSplit,
  onTabReorder,
  onAddTab,
  onToggleCollapse,
  onAccountClick,
  onNavigate,
  user,
  hideTabs = false,
}: SidebarProps) {
  const displayName = user?.username || user?.email?.split("@")[0] || "Guest";
  const isLoggedIn = !!user;
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsPhone(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  const expandedWidth = isPhone ? 200 : 260;
  const collapsedWidth = isPhone ? 48 : 56;

  return (
    <motion.aside
      animate={{ width: collapsed ? collapsedWidth : expandedWidth }}
      transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
      className="h-full flex flex-col overflow-hidden flex-shrink-0 shell-row browser-sidebar min-h-0"
      style={{
        borderRight: "1px solid hsla(210, 40%, 80%, 0.08)",
      }}
    >
      <div
        className={`flex items-center flex-shrink-0 ${
          collapsed ? "flex-col justify-center gap-1 py-2" : "justify-between gap-2 px-3 pt-3 pb-2"
        }`}
      >
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 min-w-0"
          >
            <button
              onClick={() => onNavigate(getHomeUrl())}
              className="p-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
            >
              <img src={defaultBrandSrc()} alt="Logo" className="w-6 h-6 object-contain opacity-90" />
            </button>
            <ObfuscatedText
              as="span"
              className="text-sm font-semibold tracking-tight truncate"
              style={{ color: "hsla(0,0%,100%,0.92)" }}
            >
              PeteZah
            </ObfuscatedText>
          </motion.div>
        )}
        <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
          {collapsed && (
            <button
              onClick={() => onNavigate(getHomeUrl())}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <img src={defaultBrandSrc()} alt="Logo" className="w-6 h-6 object-contain opacity-90" />
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "hsla(0,0%,100%,0.72)" }}
          >
            {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="flex-1 flex flex-col items-center overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto scrollbar-none py-1 space-y-1 min-h-0 w-full">
            {!hideTabs && pinnedTabs.length > 0 && (
              <TabList
                label="Pinned"
                tabs={pinnedTabs}
                activeTabId={activeTabId}
                pinned
                collapsed
                onSelect={onTabSelect}
                onClose={onTabClose}
                onTogglePin={onTabPin}
                onToggleSplit={onTabSplit}
                onReorder={(ids) =>
                  onTabReorder?.([...ids, ...unpinnedTabs.map((t) => t.id)])
                }
              />
            )}
            {!hideTabs && (
              <TabList
                label="Tabs"
                tabs={unpinnedTabs}
                activeTabId={activeTabId}
                collapsed
                onSelect={onTabSelect}
                onClose={onTabClose}
                onTogglePin={onTabPin}
                onToggleSplit={onTabSplit}
                onReorder={(ids) =>
                  onTabReorder?.([...pinnedTabs.map((t) => t.id), ...ids])
                }
              />
            )}
          </div>

          <div
            className="flex flex-col items-center gap-0.5 py-2 flex-shrink-0"
            style={{ borderTop: "1px solid hsla(210, 40%, 80%, 0.08)" }}
          >
            {SIDEBAR_FEATURES.map(({ icon: Icon, label, url }) => (
              <button
                key={label}
                onClick={() => onNavigate(url)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-all"
                style={{ color: "hsla(0,0%,100%,0.78)" }}
                title={label}
              >
                <Icon size={13} />
              </button>
            ))}
            <div className="w-4 h-px my-0.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
            <button
              onClick={onAddTab}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-all"
              style={{ color: "hsla(0,0%,100%,0.78)" }}
              title="New page"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={onAccountClick}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-all"
              style={{ color: "hsla(0,0%,100%,0.78)" }}
              title={isLoggedIn ? displayName : "Sign In"}
            >
              {isLoggedIn && user?.avatar_url ? (
                <img src={user.avatar_url} className="w-5 h-5 rounded-full object-cover" alt="" />
              ) : (
                <User size={13} />
              )}
            </button>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex flex-col overflow-hidden min-h-0"
        >
          <div className="flex-1 overflow-y-auto scrollbar-none space-y-0.5 pb-2 min-h-0">
            {!hideTabs && pinnedTabs.length > 0 && (
              <TabList
                label="Pinned"
                tabs={pinnedTabs}
                activeTabId={activeTabId}
                pinned
                onSelect={onTabSelect}
                onClose={onTabClose}
                onTogglePin={onTabPin}
                onToggleSplit={onTabSplit}
                onReorder={(ids) =>
                  onTabReorder?.([...ids, ...unpinnedTabs.map((t) => t.id)])
                }
              />
            )}
            {!hideTabs && (
              <TabList
                label="Tabs"
                tabs={unpinnedTabs}
                activeTabId={activeTabId}
                onSelect={onTabSelect}
                onClose={onTabClose}
                onTogglePin={onTabPin}
                onToggleSplit={onTabSplit}
                onReorder={(ids) =>
                  onTabReorder?.([...pinnedTabs.map((t) => t.id), ...ids])
                }
              />
            )}
          </div>

          <div
            className="px-2 py-1 flex-shrink-0"
            style={{ borderTop: "1px solid hsla(210, 40%, 80%, 0.08)" }}
          >
            <div className="grid grid-cols-4 gap-x-0 gap-y-0 mb-1.5 sidebar-feature-grid">
              {SIDEBAR_FEATURES.map(({ icon: Icon, label, url }) => (
                <button
                  key={label}
                  onClick={() => onNavigate(url)}
                  className="group flex flex-col items-center gap-0.5 py-0 bg-transparent border-none cursor-pointer sidebar-feature-btn"
                  style={{ color: "hsla(0,0%,100%,0.78)" }}
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center transition-colors group-hover:bg-white/[0.08] sidebar-feature-icon">
                    <Icon size={14} />
                  </span>
                  <ObfuscatedText as="span" className="text-[9px] leading-tight sidebar-feature-label" style={{ color: "hsla(0,0%,100%,0.55)" }}>
                    {label}
                  </ObfuscatedText>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 mb-1.5">
              {[
                { icon: Bookmark, label: "Saved", url: "petezah://bookmarks" },
                { icon: History, label: "History", url: "petezah://history" },
                { icon: Puzzle, label: "Extensions", url: "petezah://extensions" },
              ].map(({ icon: Icon, label, url }) => (
                <button
                  key={label}
                  onClick={() => onNavigate(url)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-white/5 transition-all"
                  style={{ color: "hsla(0,0%,100%,0.72)" }}
                >
                  <Icon size={11} />
                  <span className="text-[10px]">{label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={onAddTab}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl hover:bg-white/5 transition-all text-xs"
              style={{
                color: "hsla(0,0%,100%,0.82)",
                background: "hsla(210, 40%, 90%, 0.04)",
                border: "1px solid hsla(210, 40%, 80%, 0.1)",
              }}
            >
              <Plus size={12} />
              <span className="tracking-wide">New page</span>
            </button>

            <div className="flex items-center gap-2 px-2 pt-1.5">
              <button
                onClick={onAccountClick}
                className="flex items-center gap-2 flex-1 py-2 rounded-lg hover:bg-white/5 transition-all group"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden"
                  style={{ background: "hsla(210, 40%, 90%, 0.08)", border: "1px solid hsla(210, 40%, 80%, 0.12)" }}
                >
                  {isLoggedIn && user?.avatar_url ? (
                    <img src={user.avatar_url} className="w-6 h-6 object-cover" alt="" />
                  ) : (
                    <User size={10} style={{ color: "hsla(0,0%,100%,0.75)" }} />
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[11px]" style={{ color: "hsla(0,0%,100%,0.88)" }}>{displayName}</span>
                  <span className="text-[9px]" style={{ color: "hsla(0,0%,100%,0.4)" }}>
                    {isLoggedIn ? "Account" : "Sign in"}
                  </span>
                </div>
              </button>
              <button
                className="p-2 rounded-lg hover:bg-white/5 transition-all"
                style={{ color: "hsla(0,0%,100%,0.65)" }}
              >
                <Command size={13} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.aside>
  );
}
