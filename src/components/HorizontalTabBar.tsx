import { Reorder, AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Plus, X } from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";
import { themeById } from "@/lib/siteThemes";
import { hrefs } from "@/lib/uiMarks";

function tabMark(tab: Tab) {
  const url = (tab.url || "").split("?")[0];
  if (url.startsWith("petezah://")) {
    const map: Record<string, string> = {
      "petezah://newtab": "H",
      "petezah://trending": "TR",
      [hrefs.g()]: "G",
      "petezah://ai": "AI",
      "petezah://apps": "A",
      "petezah://chat": "C",
      [hrefs.mu()]: "M",
      [hrefs.mo()]: "MV",
      "petezah://vm": "VM",
      "petezah://firefox": "VM",
      "petezah://tools": "T",
      "petezah://history": "H",
      "petezah://bookmarks": "B",
      "petezah://extensions": "E",
      "petezah://account": "AC",
      "petezah://settings": "S",
    };
    return map[url] || "P";
  }
  try {
    if (url.startsWith("http")) {
      return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=32`;
    }
  } catch {}
  return "";
}

function tabLabel(tab: Tab) {
  const url = (tab.url || "").split("?")[0];
  if (url === "petezah://newtab" || !url) return "Home";
  if (url === "petezah://trending") return "Trending";
  if (tab.title && tab.title !== "New Tab" && tab.title !== "Home") return tab.title;
  if (url.startsWith("petezah://")) {
    const name = url.replace("petezah://", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return tab.url || "Home";
}

export default function HorizontalTabBar({
  pinnedTabs,
  unpinnedTabs,
  activeTabId,
  onSelect,
  onClose,
  onReorder,
  onAddTab,
}: {
  pinnedTabs: Tab[];
  unpinnedTabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onAddTab: () => void;
}) {
  const tabs = [...pinnedTabs, ...unpinnedTabs];
  const ids = tabs.map((t) => t.id);
  let accent = "#d96a72";
  try {
    accent = themeById(localStorage.getItem("theme")).accent;
  } catch {}

  const activeBg = "hsla(220, 28%, 16%, 0.98)";
  const ear = 10;

  return (
    <div
      className="shell-row flex-shrink-0 flex items-end gap-0 px-2 pt-1.5 min-h-[40px] overflow-x-auto"
      style={{
        borderBottom: "1px solid hsla(210, 40%, 80%, 0.08)",
        scrollbarWidth: "none",
      }}
    >
      <button
        type="button"
        title="Search tabs"
        onClick={() => {
          try {
            window.dispatchEvent(new CustomEvent("petezah-search-tabs"));
          } catch {}
        }}
        className="flex-shrink-0 mb-[6px] mr-1 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{
          background: "hsla(210, 30%, 80%, 0.08)",
          color: "hsla(0,0%,96%,0.7)",
          border: "1px solid hsla(210, 30%, 80%, 0.1)",
        }}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      <Reorder.Group
        as="div"
        axis="x"
        values={ids}
        onReorder={onReorder}
        className="flex items-end flex-1 min-w-0 overflow-x-auto"
        style={{ scrollbarWidth: "none", gap: 0 }}
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab, index) => {
            const active = tab.id === activeTabId;
            const mark = tabMark(tab);
            const isImg = mark.startsWith("http") || mark.startsWith("/");
            const title = tabLabel(tab);
            const showDivider =
              !active &&
              index < tabs.length - 1 &&
              tabs[index + 1]?.id !== activeTabId;

            return (
              <Reorder.Item
                key={tab.id}
                value={tab.id}
                as="div"
                className="list-none flex-shrink-0 relative"
                whileDrag={{ zIndex: 40 }}
                style={{ marginBottom: 0 }}
              >
                <motion.button
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  className="group relative flex items-center gap-2 h-[34px] pl-3 pr-2 cursor-grab active:cursor-grabbing"
                  style={{
                    width: "clamp(120px, 18vw, 220px)",
                    maxWidth: 220,
                    minWidth: 96,
                    background: active ? activeBg : "transparent",
                    color: active ? "hsla(0,0%,96%,0.95)" : "hsla(0,0%,96%,0.72)",
                    border: "none",
                    borderRadius: active ? "12px 12px 0 0" : "10px 10px 0 0",
                    zIndex: active ? 5 : 1,
                    boxShadow: active
                      ? `0 -1px 0 hsla(210,30%,80%,0.06) inset`
                      : "none",
                  }}
                  title={title}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "hsla(210,30%,80%,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {active ? (
                    <>
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: -ear,
                          bottom: 0,
                          width: ear,
                          height: ear,
                          background: `radial-gradient(circle at 0 0, transparent ${ear}px, ${activeBg} ${ear}px)`,
                          pointerEvents: "none",
                        }}
                      />
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          right: -ear,
                          bottom: 0,
                          width: ear,
                          height: ear,
                          background: `radial-gradient(circle at 100% 0, transparent ${ear}px, ${activeBg} ${ear}px)`,
                          pointerEvents: "none",
                        }}
                      />
                    </>
                  ) : null}

                  {isImg ? (
                    <img
                      src={mark}
                      alt=""
                      className="w-4 h-4 rounded-[4px] object-contain flex-shrink-0"
                      draggable={false}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span
                      className="w-4 h-4 rounded-[4px] text-[8px] font-bold flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `color-mix(in srgb, ${accent} 22%, transparent)`,
                        color: "hsla(0,0%,96%,0.88)",
                      }}
                    >
                      {mark || "?"}
                    </span>
                  )}
                  <span className="text-[12.5px] truncate font-medium flex-1 text-left tracking-tight">
                    {title}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(tab.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onClose(tab.id);
                      }
                    }}
                    className={`p-0.5 rounded-full transition-opacity ${
                      active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-55"
                    } hover:bg-white/10`}
                  >
                    <X size={12} />
                  </span>
                </motion.button>

                {showDivider ? (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "28%",
                      height: "44%",
                      width: 1,
                      background: "hsla(210, 30%, 80%, 0.16)",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>

      <button
        type="button"
        onClick={onAddTab}
        className="flex-shrink-0 w-8 h-8 mb-[3px] ml-1 rounded-full flex items-center justify-center transition-colors"
        style={{ color: "hsla(0,0%,96%,0.72)" }}
        title="New tab"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "hsla(210,30%,80%,0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Plus size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
