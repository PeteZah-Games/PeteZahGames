import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Dices, Plus, Star, MoreVertical, X, Trash2, Share2, Copy, Check, Upload, ChevronLeft, ChevronRight, RefreshCw, Crown, Pencil } from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";
<<<<<<< HEAD
import { AdResponsiveBanner, AdNativeBar, AdNativeBarAlt } from "@/components/ads/Adsterra";
import { armAdAudio } from "@/lib/exoclick";
=======
import { armAdAudio } from "@/lib/adGate";
import { AdFeedStrip, AdPageStack } from "@/components/ads/Units";
>>>>>>> e03cf675 (updates updates (games and chat fixes))
import { originHttpHost } from "@/lib/siteOrigin";
import { resolveGameViaHref } from "@/lib/proxyTarget";
import { normalizeGameVia, type GameVia } from "@/lib/mochiPath";
import { generateGameId } from "@/lib/gameId";
import { hrefs, marks } from "@/lib/uiMarks";
import { isLiteDevice } from "@/lib/liteDevice";
import ObfuscatedText from "./ObfuscatedText";
import {
  trackCatalogFilter,
  trackCatalogSearch,
  trackLibraryOpen,
  trackModuleOpen,
} from "@/lib/lessonMetrics";

const CATEGORIES = ["All", "Action", "Racing", "Strategy", "Sports", "Skill", "Shooting", "2 Player", "Io"];
const PINNED_LABELS = [marks.request(), "Minecraft", "Roblox"];

function pinnedRank(label: string) {
  const i = PINNED_LABELS.findIndex((p) => p.toLowerCase() === String(label || "").toLowerCase());
  return i === -1 ? 999 : i;
}

function recordPlay(game: Game) {
  try {
    fetch(hrefs.apiPlay(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: game.id,
        label: game.label,
        imageUrl: game.imageUrl || "",
      }),
    }).catch(() => {});
  } catch {}
}

interface Game {
  id: string;
  label: string;
  url: string;
  imageUrl: string;
  categories: string[];
  isCustom?: boolean;
  isGlobal?: boolean;
  via?: GameVia;
}

interface GamesPageProps {
  onNavigate?: (url: string) => void;
  adminEdit?: boolean;
  initialQuery?: string;
}

function getCustomGames(): Game[] {
  try { const s = localStorage.getItem(hrefs.lsCustom()); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveCustomGames(games: Game[]) {
  try { localStorage.setItem(hrefs.lsCustom(), JSON.stringify(games)); requestSyncSoon(); } catch {}
}
function getFavorites(): string[] {
  try { const s = localStorage.getItem(hrefs.lsFav()); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveFavorites(favs: string[]) {
  try { localStorage.setItem(hrefs.lsFav(), JSON.stringify(favs)); requestSyncSoon(); } catch {}
}
function getHiddenGames(): string[] {
  try { const s = localStorage.getItem(hrefs.lsHid()); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveHiddenGames(hidden: string[]) {
  try { localStorage.setItem(hrefs.lsHid(), JSON.stringify(hidden)); requestSyncSoon(); } catch {}
}
function getRecentGameIds(): string[] {
  try {
    const s = localStorage.getItem(hrefs.lsRecent());
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}
function pushRecentGame(id: string) {
  try {
    const prev = getRecentGameIds().filter((x) => x !== id);
    const next = [id, ...prev].slice(0, 24);
    localStorage.setItem(hrefs.lsRecent(), JSON.stringify(next));
  } catch {}
}

function carouselBadge(title: string, index: number): { label: string; tone: "blue" | "gold" | "white" } | null {
  const t = title.toLowerCase();
  if (t.includes("recent")) return { label: "Updated", tone: "blue" };
  if (t.includes("top") || index === 0) return { label: "Top", tone: "gold" };
  if (t.includes("action") || t.includes("sport")) return { label: "Pick", tone: "white" };
  if (index % 5 === 2) return { label: "Hot", tone: "gold" };
  return null;
}

function clearRecentGames() {
  try {
    localStorage.removeItem(hrefs.lsRecent());
  } catch {}
}

async function compressCoverFile(file: File): Promise<string> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("load"));
      el.src = blobUrl;
    });
    const maxW = 400;
    const maxH = 320;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("size");
    const scale = Math.min(1, maxW / w, maxH / h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ctx");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function readCoverFile(file: File): Promise<string> {
  return compressCoverFile(file).catch(() =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    })
  );
}

function GameCarousel({
  title,
  tiles,
  favorites,
  onPlay,
  onOptions,
  onClear,
}: {
  title: string;
  tiles: Game[];
  favorites: string[];
  onPlay: (g: Game) => void;
  onOptions: (g: Game) => void;
  onClear?: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  if (!tiles.length) return null;

  const scrollBy = (dir: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.78, 520), behavior: "smooth" });
  };

  return (
    <div className="mb-5 relative group/carousel">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h2 className="text-[13px] font-semibold text-white/90 tracking-tight">
          <ObfuscatedText as="span">{title}</ObfuscatedText>
        </h2>
        <div className="flex items-center gap-2">
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors"
              style={{
                color: "hsla(0,0%,100%,0.45)",
                border: "1px solid hsla(0,0%,100%,0.1)",
                background: "hsla(0,0%,100%,0.04)",
              }}
            >
              Clear
            </button>
          ) : null}
          <span className="text-[10px] text-white/28 tabular-nums">{tiles.length}</span>
        </div>
      </div>
      <div className="relative">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: "hsla(0,0%,0%,0.55)",
            border: "1px solid hsla(0,0%,100%,0.35)",
            color: "#fff",
            marginLeft: -2,
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: "hsla(0,0%,0%,0.55)",
            border: "1px solid hsla(0,0%,100%,0.35)",
            color: "#fff",
            marginRight: -2,
          }}
        >
          <ChevronRight size={16} />
        </button>
        <div
          ref={scrollerRef}
          className="flex gap-1.5 overflow-x-auto pb-1 px-0.5"
          style={{ scrollbarWidth: "none", scrollSnapType: "x proximity" }}
        >
          {tiles.map((game, i) => (
            <div
              key={game.id}
              className="flex-shrink-0"
              style={{ width: 148, scrollSnapAlign: "start" }}
            >
              <GameCard
                game={game}
                isFav={favorites.includes(game.id)}
                priority={i < 6}
                index={i}
                badge={carouselBadge(title, i)}
                onPlay={() => onPlay(game)}
                onOptions={() => onOptions(game)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function resolveGameUrl(url: string, via?: GameVia): string {
  if (!url) return url;
  const routed = resolveGameViaHref(url, via);
  if (routed.startsWith("http://") || routed.startsWith("https://")) return routed;
  const host = originHttpHost();
  if (routed.startsWith("/")) return host + routed;
  return host + "/" + routed.replace(/^\/+/, "");
}

function LaunchPathField({
  value,
  onChange,
}: {
  value: GameVia;
  onChange: (next: GameVia) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Launch path</label>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange("fg")}
          className="px-3 py-2 rounded-xl text-left text-xs transition-colors"
          style={{
            border: value === "fg" ? "1px solid hsla(var(--primary), 0.45)" : "1px solid hsl(var(--border))",
            background: value === "fg" ? "hsla(var(--primary), 0.12)" : "hsl(var(--accent))",
            color: "hsl(var(--foreground))",
          }}
        >
          <span className="font-semibold block">Path 1</span>
          <span className="text-[10px] text-muted-foreground">Same-origin embed</span>
        </button>
        <button
          type="button"
          onClick={() => onChange("ve")}
          className="px-3 py-2 rounded-xl text-left text-xs transition-colors"
          style={{
            border: value === "ve" ? "1px solid hsla(var(--primary), 0.45)" : "1px solid hsl(var(--border))",
            background: value === "ve" ? "hsla(var(--primary), 0.12)" : "hsl(var(--accent))",
            color: "hsl(var(--foreground))",
          }}
        >
          <span className="font-semibold block">Path 2</span>
          <span className="text-[10px] text-muted-foreground">Remote frame</span>
        </button>
      </div>
    </div>
  );
}



function AddGameModal({ onAdd, onClose, publish = false }: { onAdd: (g: Game) => void; onClose: () => void; publish?: boolean }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [imageData, setImageData] = useState("");
  const [preview, setPreview] = useState("");
  const [via, setVia] = useState<GameVia>("ve");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void readCoverFile(file).then((result) => {
      setImageData(result);
      setPreview(result);
    });
  };

  const handleSubmit = () => {
    if (!title.trim() || !url.trim() || !imageData || !category) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http") && !finalUrl.startsWith("/")) finalUrl = "https://" + finalUrl;
    const game: Game = {
      id: generateGameId({ label: title, url: finalUrl }),
      label: title.trim(),
      url: finalUrl,
      imageUrl: imageData,
      categories: [category],
      isCustom: true,
      via: publish ? via : undefined,
    };
    onAdd(game);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }}
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl bg-card border border-border"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-foreground">{publish ? hrefs.pubG() : hrefs.addCustom()}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Name"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          {publish ? <LaunchPathField value={via} onChange={setVia} /> : null}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground outline-none focus:ring-1 focus:ring-foreground/20">
              <option value="">Select category</option>
              {CATEGORIES.filter(c => c !== "All").map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Image</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
              <Upload size={12} />{preview ? "Image selected ✓" : "Upload image"}
            </button>
            {preview && <img src={preview} alt="preview" className="mt-2 w-full h-24 object-cover rounded-xl" />}
          </div>
          <button onClick={handleSubmit} disabled={!title || !url || !imageData || !category}
            className="w-full py-2.5 rounded-xl bg-foreground/10 border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/15 transition-colors disabled:opacity-40">
            {publish ? hrefs.pubGBtn() : hrefs.addG()}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EditGameModal({
  game,
  onSave,
  onClose,
  showLaunchPath = false,
}: {
  game: Game;
  onSave: (g: Game) => void;
  onClose: () => void;
  showLaunchPath?: boolean;
}) {
  const [title, setTitle] = useState(game.label);
  const [url, setUrl] = useState(game.url);
  const cat0 = game.categories?.[0] || "";
  const matched = CATEGORIES.find((c) => c !== "All" && c.toLowerCase() === cat0.toLowerCase());
  const [category, setCategory] = useState(matched || cat0 || "");
  const [imageData, setImageData] = useState(game.imageUrl || "");
  const [preview, setPreview] = useState(game.imageUrl || "");
  const [via, setVia] = useState<GameVia>(normalizeGameVia(game.via));
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void readCoverFile(file).then((result) => {
      setImageData(result);
      setPreview(result);
    });
  };

  const handleSubmit = () => {
    if (!title.trim() || !url.trim() || !imageData || !category) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http") && !finalUrl.startsWith("/")) finalUrl = "https://" + finalUrl;
    onSave({
      ...game,
      label: title.trim(),
      url: finalUrl,
      imageUrl: imageData,
      categories: [category],
      via: showLaunchPath ? via : game.via,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }}
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl bg-card border border-border"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-foreground">Edit game</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Name"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          {showLaunchPath ? <LaunchPathField value={via} onChange={setVia} /> : null}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground outline-none focus:ring-1 focus:ring-foreground/20">
              <option value="">Select category</option>
              {CATEGORIES.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Image</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
              <Upload size={12} />{preview ? "Change image" : "Upload image"}
            </button>
            {preview && <img src={preview} alt="preview" className="mt-2 w-full h-24 object-cover rounded-xl" />}
          </div>
          <button onClick={handleSubmit} disabled={!title || !url || !imageData || !category}
            className="w-full py-2.5 rounded-xl bg-foreground/10 border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/15 transition-colors disabled:opacity-40">
            Save changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GameOptionsMenu({ game, isFav, onFav, onRemove, onShare, onEdit, onClose, adminMode = false }: {
  game: Game; isFav: boolean; onFav: () => void; onRemove: () => void; onShare: () => void; onEdit?: () => void; onClose: () => void; adminMode?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-5 shadow-2xl bg-card border border-border"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground truncate pr-4">{game.label}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {adminMode && onEdit && (
            <button onClick={onEdit}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-accent border border-border text-sm font-medium text-foreground hover:bg-accent/70 transition-all">
              <Pencil size={13} className="text-muted-foreground" /> Edit
            </button>
          )}
          {!adminMode && (
            <button onClick={onFav}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-accent border border-border text-sm font-medium text-foreground hover:bg-accent/70 transition-all">
              <Star size={13} className={isFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} />
              {isFav ? "Unfavorite" : "Favorite"}
            </button>
          )}
          {!adminMode && (
            <button onClick={onShare}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-accent border border-border text-sm font-medium text-foreground hover:bg-accent/70 transition-all">
              <Share2 size={13} className="text-muted-foreground" /> Share Game
            </button>
          )}
          <button onClick={onRemove}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-sm font-medium text-destructive hover:bg-destructive/20 transition-all">
            <Trash2 size={13} />
            {adminMode
              ? (game.isGlobal ? "Delete global game" : "Suspend for everyone")
              : "Remove Game"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ShareModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-5 shadow-2xl bg-card border border-border"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Share Game</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Share this game with others:</p>
        <div className="flex gap-2">
          <input value={url} readOnly
            className="flex-1 px-3 py-2 rounded-xl bg-accent border border-border text-xs text-foreground outline-none" />
          <button onClick={copy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent border border-border text-xs font-medium text-foreground hover:bg-accent/70 transition-colors">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GameCard({ game, isFav, onPlay, onOptions, priority = false, index = 0, badge = null }: {
  game: Game; isFav: boolean; onPlay: () => void; onOptions: () => void; priority?: boolean; index?: number;
  badge?: { label: string; tone: "blue" | "gold" | "white" } | null;
}) {
  const ease = [0.22, 1, 0.36, 1] as const;
  const lite = isLiteDevice();
  const badgeStyle =
    badge?.tone === "gold"
      ? { background: "#e8b84a", color: "#1a1204" }
      : badge?.tone === "white"
        ? { background: "#f4f4f6", color: "#4b2d8a" }
        : { background: "#5aa8d4", color: "#fff" };
  return (
    <motion.div
      initial={lite ? false : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: lite ? 0.12 : 0.45,
        delay: lite ? 0 : Math.min(index, 20) * 0.03,
        ease,
      }}
      whileHover={lite ? undefined : { scale: 1.04, zIndex: 10 }}
      whileTap={lite ? undefined : { scale: 0.985 }}
      className="relative cursor-pointer group rounded-xl overflow-hidden game-card"
      style={{
        aspectRatio: "5/4",
        background: "hsla(220, 28%, 10%, 0.9)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.26)",
        border: "2px solid transparent",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--pz-accent, hsla(210, 70%, 70%, 0.75))";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px color-mix(in srgb, var(--pz-accent, #6eb0d4) 35%, transparent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.26)";
      }}
      onClick={onPlay}
    >
      <img
        src={game.imageUrl}
        alt=""
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "low"}
        sizes="(max-width: 640px) 42vw, 148px"
        width={148}
        height={118}
        style={{ background: "hsla(210, 30%, 12%, 0.6)" }}
        onError={(e) => {
          const el = e.currentTarget;
          if (el.dataset.fallback === "1") return;
          el.dataset.fallback = "1";
          el.src = "/logo.png";
        }}
      />

      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)" }}
      />

      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <p className="text-white text-[11px] font-semibold truncate drop-shadow-sm">
          <ObfuscatedText as="span" force>
            {game.label}
          </ObfuscatedText>
        </p>
      </div>

      {badge && (
        <div
          className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 px-1.5 py-[2px] rounded-full text-[8px] font-bold tracking-wide"
          style={badgeStyle}
        >
          {badge.tone === "gold" ? <Star size={8} className="fill-current" /> : badge.tone === "white" ? <Crown size={8} /> : <RefreshCw size={8} />}
          {badge.label}
        </div>
      )}

      {isFav && !badge && (
        <div className="absolute top-1.5 left-1.5">
          <Star size={10} className="fill-yellow-400 text-yellow-400 drop-shadow-sm" />
        </div>
      )}
      {isFav && badge && (
        <div className="absolute top-1.5 right-1.5">
          <Star size={10} className="fill-yellow-400 text-yellow-400 drop-shadow-sm" />
        </div>
      )}

      <button
        onClick={e => { e.stopPropagation(); onOptions(); }}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 border border-white/15 backdrop-blur-sm"
      >
        <MoreVertical size={9} className="text-white" />
      </button>
    </motion.div>
  );
}

export default function GamesPage({ onNavigate, adminEdit = false, initialQuery = "" }: GamesPageProps) {
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [listReady, setListReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(getFavorites);
  const [search, setSearch] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState("All");
  const [page, setPage] = useState(1);
  const PER_PAGE = 50;
  const [optionsGame, setOptionsGame] = useState<Game | null>(null);
  const [editGame, setEditGame] = useState<Game | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adminOk, setAdminOk] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [recentTick, setRecentTick] = useState(0);
  const [showRecentPlays, setShowRecentPlays] = useState(
    () => localStorage.getItem(hrefs.rp()) === "true"
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isAdminMode = adminEdit && adminOk;
  const searchTrackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    trackLibraryOpen();
  }, []);

  useEffect(() => {
    if (activeCategory && activeCategory !== "All") trackCatalogFilter(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    if (searchTrackRef.current) clearTimeout(searchTrackRef.current);
    if (!search.trim()) return;
    searchTrackRef.current = setTimeout(() => trackCatalogSearch(search), 700);
    return () => {
      if (searchTrackRef.current) clearTimeout(searchTrackRef.current);
    };
  }, [search]);

  useEffect(() => {
    if (!adminEdit) {
      setAdminOk(false);
      return;
    }
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("auth");
        const d = await r.json();
        const u = d?.user;
        const ok = !!u && ((u.is_admin ?? 0) >= 1 || !!u.is_owner);
        if (!cancelled) setAdminOk(ok);
      })
      .catch(() => {
        if (!cancelled) setAdminOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminEdit]);

  useEffect(() => {
    const sync = () => {
      setShowRecentPlays(localStorage.getItem(hrefs.rp()) === "true");
      setRecentTick((n) => n + 1);
    };
    window.addEventListener("petezah-settings-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("petezah-settings-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [res, playsRes, catalogRes] = await Promise.all([
          fetch("/storage/data/collection.json"),
          fetch(hrefs.apiPlays()).catch(() => null),
          fetch(hrefs.apiCat(), { credentials: "include" }).catch(() => null),
        ]);
        const data = await res.json();
        const remote: Game[] = (data[hrefs.kindG()] || []).map((g: Game) => ({ ...g, id: generateGameId(g), isCustom: false }));
        const custom = getCustomGames();
        const hidden = getHiddenGames();
        let exclusions: string[] = [];
        let globals: Game[] = [];
        let overrides: Record<string, Partial<Game>> = {};
        if (catalogRes && catalogRes.ok) {
          const catalog = await catalogRes.json();
          if (Array.isArray(catalog?.exclusions)) exclusions = catalog.exclusions;
          if (Array.isArray(catalog?.globals)) globals = catalog.globals;
          if (Array.isArray(catalog?.overrides)) {
            for (const o of catalog.overrides) {
              if (o?.gameId) overrides[o.gameId] = o;
            }
          }
        }
        const excluded = new Set(exclusions);
        let counts: Record<string, number> = {};
        if (playsRes && playsRes.ok) {
          const playsData = await playsRes.json();
          if (playsData?.counts && typeof playsData.counts === "object") {
            counts = playsData.counts;
          }
        }
        setPlayCounts(counts);
        setAllGames(
          [...globals, ...custom, ...remote]
            .map((g) => {
              const o = overrides[g.id];
              if (!o) return g;
              return {
                ...g,
                label: o.label || g.label,
                url: o.url || g.url,
                imageUrl: o.imageUrl || g.imageUrl,
                categories: Array.isArray(o.categories) && o.categories.length ? o.categories : g.categories,
                via: o.via || g.via,
              };
            })
            .filter((g) => !hidden.includes(g.id) && !excluded.has(g.id)),
        );
        setListReady(true);
      } catch {
        const custom = getCustomGames();
        const hidden = getHiddenGames();
        setAllGames(custom.filter((g) => !hidden.includes(g.id)));
        setListReady(true);
      }
    }
    load();
  }, []);

  const filtered = (() => {
    let g = allGames;
    if (search.trim()) g = g.filter(x => x.label.toLowerCase().includes(search.toLowerCase()));
    if (activeCategory !== "All") g = g.filter(x => x.categories.some(c => c.toLowerCase() === activeCategory.toLowerCase()));
    return [...g].sort((a, b) => {
      const ap = pinnedRank(a.label);
      const bp = pinnedRank(b.label);
      if (ap !== bp) return ap - bp;
      const ac = playCounts[a.id] || 0;
      const bc = playCounts[b.id] || 0;
      if (ac !== bc) return bc - ac;
      const af = favorites.includes(a.id), bf = favorites.includes(b.id);
      return af === bf ? 0 : af ? -1 : 1;
    });
  })();

  const visible = filtered.slice(0, page * PER_PAGE);
  const hasMore = visible.length < filtered.length;

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setPage(p => p + 1); },
      { threshold: 0.1, rootMargin: "600px 0px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, visible.length]);

  const handlePlay = useCallback((game: Game) => {
    armAdAudio();
    recordPlay(game);
    trackModuleOpen({
      id: game.id,
      label: game.label,
      topic: game.categories?.[0] || "general",
      via: game.via || "standard",
    });
    pushRecentGame(game.id);
    setPlayCounts((prev) => ({ ...prev, [game.id]: (prev[game.id] || 0) + 1 }));
    if (onNavigate) {
      const resolved = resolveGameUrl(game.url, game.via);
      onNavigate(`${hrefs.gv()}?url=${encodeURIComponent(resolved)}&title=${encodeURIComponent(game.label)}&gid=${encodeURIComponent(game.id)}`);
    }
  }, [onNavigate]);

  const showCarousels = !search.trim() && activeCategory === "All" && listReady;

  const carouselShelves = (() => {
    if (!showCarousels) return [] as { title: string; tiles: Game[] }[];
    void recentTick;
    const byId = new Map(allGames.map((g) => [g.id, g]));
    const recentIds = getRecentGameIds();
    const recentlyPlayed = recentIds.map((id) => byId.get(id)).filter(Boolean) as Game[];
    const topGames = [...allGames]
      .sort((a, b) => (playCounts[b.id] || 0) - (playCounts[a.id] || 0))
      .filter((g) => (playCounts[g.id] || 0) > 0)
      .slice(0, 16);
    const sports = allGames
      .filter((g) => g.categories.some((c) => /sport/i.test(c)))
      .slice(0, 16);
    const action = allGames
      .filter((g) => g.categories.some((c) => /action|racing|shooting/i.test(c)))
      .slice(0, 16);
    const shelves: { title: string; tiles: Game[] }[] = [];
    if (showRecentPlays && recentlyPlayed.length) shelves.push({ title: marks.recent(), tiles: recentlyPlayed.slice(0, 16) });
    if (topGames.length) shelves.push({ title: marks.f(), tiles: topGames });
    else shelves.push({ title: marks.f(), tiles: allGames.slice(0, 16) });
    if (sports.length) shelves.push({ title: "Sports", tiles: sports });
    if (action.length) shelves.push({ title: "Action & Racing", tiles: action });
    return shelves.slice(0, 4);
  })();

  const handleFav = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      saveFavorites(next);
      return next;
    });
    setOptionsGame(null);
  }, []);

  const handleRemove = useCallback(async (game: Game) => {
    if (isAdminMode) {
      if (adminBusy) return;
      setAdminBusy(true);
      try {
        if (game.isGlobal) {
          const r = await fetch(`${hrefs.admG()}/${encodeURIComponent(game.id)}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!r.ok) throw new Error("fail");
        } else {
          const r = await fetch(hrefs.admEx(), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gameId: game.id,
              label: game.label,
              imageUrl: game.imageUrl || "",
            }),
          });
          if (!r.ok) throw new Error("fail");
        }
        setAllGames((prev) => prev.filter((g) => g.id !== game.id));
        setOptionsGame(null);
      } catch {
        alert("Could not delete game globally. Try again.");
      } finally {
        setAdminBusy(false);
      }
      return;
    }

    if (game.isCustom) saveCustomGames(getCustomGames().filter((g) => g.id !== game.id));
    const hidden = getHiddenGames();
    hidden.push(game.id);
    saveHiddenGames(hidden);
    setAllGames((prev) => prev.filter((g) => g.id !== game.id));
    setFavorites((prev) => {
      const next = prev.filter((x) => x !== game.id);
      saveFavorites(next);
      return next;
    });
    setOptionsGame(null);
  }, [isAdminMode, adminBusy]);

  const handleAddGame = useCallback(async (game: Game) => {
    if (isAdminMode) {
      if (adminBusy) return;
      setAdminBusy(true);
      try {
        const r = await fetch(hrefs.admG(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: game.label,
            url: game.url,
            imageUrl: game.imageUrl,
            categories: game.categories || [],
            via: game.via || "ve",
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || "fail");
        if (data?.game) {
          setAllGames((prev) => [data.game, ...prev]);
        }
        setShowAdd(false);
      } catch (e: any) {
        alert(e?.message || "Could not add global game.");
      } finally {
        setAdminBusy(false);
      }
      return;
    }

    saveCustomGames([game, ...getCustomGames()]);
    setAllGames((prev) => [game, ...prev]);
    setShowAdd(false);
  }, [isAdminMode, adminBusy]);

  const handleEditGame = useCallback(async (game: Game) => {
    if (!isAdminMode || adminBusy) return;
    setAdminBusy(true);
    try {
      const r = await fetch(`${hrefs.admG()}/${encodeURIComponent(game.id)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: game.label,
          url: game.url,
          imageUrl: game.imageUrl,
          categories: game.categories || [],
          via: game.via || "ve",
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "fail");
      const next = data?.game ? { ...game, ...data.game } : game;
      setAllGames((prev) => prev.map((g) => (g.id === game.id ? next : g)));
      setEditGame(null);
      setOptionsGame(null);
    } catch (e: any) {
      alert(e?.message || "Could not save game.");
    } finally {
      setAdminBusy(false);
    }
  }, [isAdminMode, adminBusy]);

  const randomGame = () => {
    if (!filtered.length) return;
    handlePlay(filtered[Math.floor(Math.random() * filtered.length)]);
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="px-6 cat-scroll" style={{ paddingTop: 108, paddingBottom: 32 }}>
          {!listReady ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <div className="w-4 h-4 rounded-full border border-white/10 border-t-white/40 animate-spin mb-3" />
              <p className="text-sm">
                <ObfuscatedText as="span">{marks.loading()}</ObfuscatedText>
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <p className="text-sm">
                <ObfuscatedText as="span">{marks.none()}</ObfuscatedText>
              </p>
            </div>
          ) : (
            <>
              {showCarousels &&
                carouselShelves.map((shelf) => (
                  <GameCarousel
                    key={shelf.title}
                    title={shelf.title}
                    tiles={shelf.tiles}
                    favorites={favorites}
                    onPlay={handlePlay}
                    onOptions={setOptionsGame}
                    onClear={
                      shelf.title === marks.recent()
                        ? () => {
                            clearRecentGames();
                            setRecentTick((n) => n + 1);
                          }
                        : undefined
                    }
                  />
                ))}
              {showCarousels && (
                <h2 className="text-sm font-semibold text-white/90 tracking-tight mb-2.5">
                  <ObfuscatedText as="span">{marks.e()}</ObfuscatedText>
                </h2>
              )}
              <div className="grid gap-3 cat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                {visible.map((game, i) => (
                  <div key={game.id} style={{ display: "contents" }}>
                    <GameCard
                      game={game}
                      isFav={favorites.includes(game.id)}
                      priority={i < 12}
                      index={i}
                      onPlay={() => handlePlay(game)}
                      onOptions={() => setOptionsGame(game)}
                    />
                    {(i + 1) % 12 === 0 && i + 1 < visible.length ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <AdFeedStrip />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="pt-4 pb-2">
<<<<<<< HEAD
                <AdResponsiveBanner />
                <AdNativeBar />
                <AdNativeBarAlt />
=======
                <AdPageStack dense />
>>>>>>> e03cf675 (updates updates (games and chat fixes))
              </div>
              {hasMore && (
                <div ref={loadMoreRef} className="flex justify-center py-8">
                  <div className="w-4 h-4 rounded-full border border-white/10 border-t-white/40 animate-spin" />
                </div>
              )}
              {!hasMore && <div style={{ paddingBottom: 32 }} />}
            </>
          )}
        </div>
      </div>

      <div
        className="absolute top-0 left-0 right-0 z-20 px-6 pt-5 pb-3 cat-toolbar pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, hsla(220,35%,6%,0.55) 0%, hsla(220,35%,6%,0.18) 70%, transparent 100%)",
        }}
      >
        <div className="max-w-4xl mx-auto pointer-events-auto">
          {isAdminMode && (
            <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10">
              <p className="text-[11px] text-amber-100/90 font-medium">
                Admin edit mode — 3-dot menu to edit or suspend · publishes are global and final
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.("petezah://account")}
                className="text-[10px] px-2 py-1 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground"
              >
                Exit
              </button>
            </div>
          )}
          {adminEdit && !adminOk && listReady && (
            <div className="mb-3 px-3 py-2 rounded-xl border border-destructive/30 bg-destructive/10 text-[11px] text-destructive">
              Admin access required for {hrefs.editG()}.
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={randomGame}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/40 border border-white/8 hover:border-white/20 hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all flex-shrink-0 backdrop-blur-md"
              title="Random game"
            >
              <Dices size={14} />
            </button>

            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/40 border border-white/8 focus-within:border-white/25 focus-within:bg-accent/60 transition-all backdrop-blur-md">
              <Search size={13} className="text-muted-foreground flex-shrink-0" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/40 border border-white/8 hover:border-white/20 hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all flex-shrink-0 backdrop-blur-md"
              title="Add custom game"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex gap-1.5 justify-center overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setPage(1); }}
                className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-150 backdrop-blur-md"
                style={{
                  background: activeCategory === cat ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)",
                  color: activeCategory === cat ? "var(--foreground)" : "var(--muted-foreground)",
                  border: `1px solid ${activeCategory === cat ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && <AddGameModal onAdd={handleAddGame} onClose={() => setShowAdd(false)} publish={isAdminMode} />}
        {editGame && (
          <EditGameModal
            game={editGame}
            onSave={handleEditGame}
            onClose={() => setEditGame(null)}
            showLaunchPath={isAdminMode}
          />
        )}
        {optionsGame && (
          <GameOptionsMenu
            game={optionsGame}
            isFav={favorites.includes(optionsGame.id)}
            onFav={() => handleFav(optionsGame.id)}
            onRemove={() => handleRemove(optionsGame)}
            onShare={() => { setShareUrl(resolveGameUrl(optionsGame.url)); setOptionsGame(null); }}
            onEdit={isAdminMode ? () => { setEditGame(optionsGame); setOptionsGame(null); } : undefined}
            onClose={() => setOptionsGame(null)}
            adminMode={isAdminMode}
          />
        )}
        {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
      </AnimatePresence>
    </div>
  );
}