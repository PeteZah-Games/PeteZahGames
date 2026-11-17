import { forwardRef } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { X, Pin, SplitSquareHorizontal } from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";
import { hrefs } from "@/lib/uiMarks";

function getFaviconUrl(url: string): string {
  try {
    if (
      !url ||
      url === "petezah://newtab" ||
      url === "about:blank" ||
      url === "https://" ||
      url.startsWith("petezah://")
    ) {
      return "";
    }
    const clean = url.startsWith("http") ? url : `https://${url}`;
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(clean)}&size=32`;
  } catch {
    return "";
  }
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  isPinned?: boolean;
  collapsed?: boolean;
  onClick: () => void;
  onClose: () => void;
  onTogglePin: () => void;
  onToggleSplit: () => void;
}

const TabItem = forwardRef<HTMLDivElement, TabItemProps>(
  (
    {
      tab,
      isActive,
      isPinned,
      collapsed,
      onClick,
      onClose,
      onTogglePin,
      onToggleSplit,
    },
    ref,
  ) => {
    const petezahIcons: Record<string, string> = {
      "petezah://tools": "T",
      "petezah://newtab": "N",
      "petezah://trending": "TR",
      [hrefs.g()]: "G",
      "petezah://ai": "AI",
      "petezah://apps": "AP",
      [hrefs.mu()]: "M",
      [hrefs.mo()]: "MV",
      "petezah://firefox": "VM",
      "petezah://vm": "VM",
      [hrefs.gv()]: "GV",
      "petezah://settings": "S",
      "petezah://account": "AC",
      "petezah://changelog": "CL",
      "petezah://feedback": "FB",
      "petezah://ad": "AD",
    };

    const isNewTab =
      !tab.url ||
      tab.url === "petezah://newtab" ||
      tab.url === "about:blank" ||
      tab.url === "https://" ||
      tab.url.startsWith("petezah://");

    const petezahIcon = tab.url
      ? petezahIcons[tab.url] || (tab.url.startsWith("petezah://ad") ? "AD" : petezahIcons[tab.url.split("?")[0]])
      : undefined;

    const faviconSrc = tab.favicon || getFaviconUrl(tab.url);
    const showFavicon = !isNewTab && !!faviconSrc;
    const displayTitle =
      tab.title && tab.title !== "New Tab"
        ? tab.title
        : isNewTab
          ? "New Tab"
          : tab.url;

    if (collapsed) {
      return (
        <div ref={ref} className="flex items-center justify-center touch-none">
          <motion.button
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={onClick}
            className={`relative w-8 h-8 rounded-xl flex items-center justify-center text-xs font-medium transition-all duration-150 cursor-grab active:cursor-grabbing ${
              isActive
                ? "bg-white/10 text-white"
                : "hover:bg-white/5 text-white/75"
            }`}
            title={displayTitle}
          >
            {isActive && (
              <motion.div
                layoutId="tab-collapsed-glow"
                className="absolute inset-0 rounded-xl border border-foreground/20"
                style={{ background: "hsl(0 0% 100% / 0.06)" }}
              />
            )}
            {showFavicon ? (
              <img
                src={faviconSrc}
                alt=""
                className="relative z-10 w-4 h-4 rounded-sm pointer-events-none"
                draggable={false}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span className="text-[10px] font-medium text-foreground/60 pointer-events-none">
                {petezahIcon ?? displayTitle[0]?.toUpperCase()}
              </span>
            )}
          </motion.button>
        </div>
      );
    }

    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8, height: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClick}
        className={`group relative flex items-center gap-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-150 px-3 py-2.5 touch-none ${
          isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="tab-active-bar"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-white/50"
          />
        )}

        <div
          className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${
            isActive ? "bg-white/10" : "bg-white/5"
          }`}
        >
          {showFavicon ? (
            <img
              src={faviconSrc}
              alt=""
              className="relative z-10 w-4 h-4 rounded-sm pointer-events-none"
              draggable={false}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="relative z-10 text-[11px] text-white/80 pointer-events-none">
              {petezahIcon ?? displayTitle[0]?.toUpperCase()}
            </span>
          )}
        </div>

        <span
          className={`flex-1 truncate text-[13px] pointer-events-none ${
            isActive ? "text-white font-medium" : "text-white/70"
          }`}
        >
          {displayTitle}
        </span>

        {tab.pinned && (
          <Pin
            size={9}
            className="text-white/35 flex-shrink-0 group-hover:hidden pointer-events-none"
          />
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSplit();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            title="Split view"
          >
            <SplitSquareHorizontal size={11} className="text-white/65" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded-lg hover:bg-accent transition-colors"
            title={tab.pinned ? "Unpin" : "Pin"}
          >
            <Pin
              size={11}
              className={tab.pinned ? "text-foreground" : "text-foreground/50"}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded-lg hover:bg-destructive/20 transition-colors"
            title="Dismiss"
          >
            <X size={11} className="text-foreground/50" />
          </button>
        </div>
      </motion.div>
    );
  },
);

TabItem.displayName = "TabItem";
export default TabItem;

interface TabListProps {
  label: string;
  tabs: Tab[];
  activeTabId: string;
  pinned?: boolean;
  collapsed?: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleSplit: (id: string) => void;
  onReorder?: (orderedIds: string[]) => void;
}

export function TabList({
  label,
  tabs,
  activeTabId,
  pinned,
  collapsed,
  onSelect,
  onClose,
  onTogglePin,
  onToggleSplit,
  onReorder,
}: TabListProps) {
  if (tabs.length === 0) return null;

  const ids = tabs.map((t) => t.id);

  const handleReorder = (nextIds: string[]) => {
    if (!onReorder) return;
    onReorder(nextIds);
  };

  if (collapsed) {
    return (
      <Reorder.Group
        as="div"
        axis="y"
        values={ids}
        onReorder={handleReorder}
        className="flex flex-col items-center gap-1"
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <Reorder.Item
              key={tab.id}
              value={tab.id}
              as="div"
              className="list-none"
              whileDrag={{ scale: 1.08, zIndex: 40, opacity: 0.95 }}
            >
              <TabItem
                tab={tab}
                isActive={tab.id === activeTabId}
                isPinned={pinned}
                collapsed
                onClick={() => onSelect(tab.id)}
                onClose={() => onClose(tab.id)}
                onTogglePin={() => onTogglePin(tab.id)}
                onToggleSplit={() => onToggleSplit(tab.id)}
              />
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
    );
  }

  return (
    <div className="px-2">
      <div className="px-2 py-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-foreground/40">
          {label}
        </span>
      </div>
      <Reorder.Group
        as="div"
        axis="y"
        values={ids}
        onReorder={handleReorder}
        className="flex flex-col gap-0.5"
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <Reorder.Item
              key={tab.id}
              value={tab.id}
              as="div"
              className="list-none"
              whileDrag={{
                scale: 1.02,
                zIndex: 40,
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}
            >
              <TabItem
                tab={tab}
                isActive={tab.id === activeTabId}
                isPinned={pinned}
                onClick={() => onSelect(tab.id)}
                onClose={() => onClose(tab.id)}
                onTogglePin={() => onTogglePin(tab.id)}
                onToggleSplit={() => onToggleSplit(tab.id)}
              />
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
    </div>
  );
}
