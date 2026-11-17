import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, X, Film, Search, Heart, ArrowLeft, Tv, Star, Clapperboard, Sparkles,
  ChevronLeft, ChevronRight, Info, Loader2,
} from "lucide-react";
import { CoverImg } from "@/lib/mediaCover";
import { pxEncode, pxReady } from "@/lib/px";
import { applyVpnRegion, isSignedIn } from "@/lib/vpn";
import { setPendingAuth } from "@/lib/authPending";
import { AdFeedStrip, AdPageStack } from "@/components/ads/Units";
import { sealPlayerPopups, setPopupLock } from "@/lib/sealPlayerPopups";
import { sealPollMs } from "@/lib/liteDevice";

interface CatalogItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  media_type?: string;
}

interface SeasonInfo {
  season_number: number;
  name?: string;
  episode_count?: number;
}

interface EpisodeInfo {
  episode_number: number;
  name?: string;
  overview?: string;
  still_path?: string;
}

interface SavedMovie {
  id: string;
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  groupId: string | null;
  season?: number;
  episode?: number;
  createdAt: number;
}

interface MovieGroup {
  id: string;
  name: string;
  collapsed: boolean;
  createdAt: number;
}

interface PlayerState {
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  season?: number;
  episode?: number;
}

const S = {
  bg: "transparent",
  surface: "hsla(220, 28%, 12%, 0.38)",
  elevated: "hsla(220, 24%, 16%, 0.45)",
  border: "hsla(210, 30%, 80%, 0.12)",
  borderFocus: "hsla(210, 40%, 70%, 0.28)",
  accent: "hsla(205, 70%, 62%, 0.95)",
  accentDim: "hsla(210, 40%, 55%, 0.16)",
  text: "hsla(210, 20%, 96%, 0.95)",
  textSub: "hsla(210, 14%, 70%, 0.78)",
  textMuted: "hsla(210, 12%, 55%, 0.55)",
  danger: "hsl(0 60% 58%)",
  gold: "hsl(42 90% 55%)",
};

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_STILL = "https://image.tmdb.org/t/p/w300";

/** Embed fallbacks when FrameX HLS fails — Tor first (providers ban bare VPS IPs). */
const PROVIDERS = [
  {
    id: "vidfast",
    label: "VidFast",
    movie: (id: number) => `https://vidfast.pro/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidfast.pro/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrc",
    label: "VidSrc",
    movie: (id: number) => `https://vidsrc.xyz/embed/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidsrc.xyz/embed/tv/${id}/${s}-${e}`,
  },
  {
    id: "vidlink",
    label: "VidLink",
    movie: (id: number) => `https://vidlink.pro/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrccc",
    label: "VidSrc CC",
    movie: (id: number) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "autoembed",
    label: "AutoEmbed",
    movie: (id: number) => `https://player.autoembed.cc/embed/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "2embed",
    label: "2Embed",
    movie: (id: number) => `https://www.2embed.cc/embed/${id}`,
    tv: (id: number, s: number, e: number) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
];

const DEFAULT_REGION = "default";
const TOR_REGION = "tor";
const BLACK_FAIL_MS = 20000;
/** Don't skip a FrameX source until it's had this long to start. */
const SOURCE_MIN_MS = 12000;
/** Auto-try this many FrameX HLS urls before embed fallback. */
const MAX_AUTO_SOURCES = 4;
/**
 * Embed hops — Tor first (same idea as routing FrameX through Tor),
 * then default wisp, then more Tor providers.
 */
const AUTO_SOURCE_HOPS = [
  { provider: "vidfast", region: TOR_REGION, label: "VidFast · Tor" },
  { provider: "vidsrc", region: TOR_REGION, label: "VidSrc · Tor" },
  { provider: "vidfast", region: DEFAULT_REGION, label: "VidFast" },
  { provider: "vidlink", region: TOR_REGION, label: "VidLink · Tor" },
  { provider: "vidsrc", region: DEFAULT_REGION, label: "VidSrc" },
] as const;

function collectVideos(root: Window | Document | ShadowRoot, depth = 0, out: HTMLVideoElement[] = []): HTMLVideoElement[] {
  if (!root || depth > 5) return out;
  try {
    const scope: ParentNode | null = "document" in root && (root as Window).document
      ? (root as Window).document
      : (root as ParentNode);
    if (!scope || typeof scope.querySelectorAll !== "function") return out;
    scope.querySelectorAll("video").forEach((v) => out.push(v as HTMLVideoElement));
    scope.querySelectorAll("*").forEach((el) => {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) collectVideos(sr, depth + 1, out);
    });
    if (depth < 4) {
      scope.querySelectorAll("iframe").forEach((frame) => {
        try {
          const w = (frame as HTMLIFrameElement).contentWindow;
          if (w) collectVideos(w, depth + 1, out);
        } catch {}
      });
    }
  } catch {}
  return out;
}

function mediaLooksAlive(v: HTMLVideoElement, lastTimes: WeakMap<HTMLVideoElement, number>): boolean {
  const t = Number(v.currentTime) || 0;
  const prev = lastTimes.get(v);
  lastTimes.set(v, t);
  if (typeof prev === "number" && t > prev + 0.12) return true;
  const hasFrame = (v.readyState || 0) >= 2 && v.videoWidth >= 16 && v.videoHeight >= 16;
  if (hasFrame) return true;
  if (!v.paused && t > 0.25) return true;
  try {
    if (v.played && v.played.length > 0 && v.played.end(v.played.length - 1) > 0.3) return true;
  } catch {}
  return false;
}

function hostVideoCleanup(host: HTMLElement | null) {
  if (!host) return;
  host.querySelectorAll("video[data-pz-direct], iframe[data-pz-direct-stub]").forEach((n) => {
    try {
      n.remove();
    } catch {}
  });
}

type HlsInstance = {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  on: (event: string, cb: (event: string, data: { fatal?: boolean; type?: string; details?: string }) => void) => void;
  startLoad?: () => void;
  recoverMediaError?: () => void;
};
type HlsCtor = {
  isSupported: () => boolean;
  Events?: { ERROR?: string; MANIFEST_PARSED?: string; MEDIA_ATTACHED?: string };
  ErrorTypes?: { NETWORK_ERROR?: string; MEDIA_ERROR?: string };
  new (opts?: Record<string, unknown>): HlsInstance;
};

/** Load HLS.js from CDN only when a direct stream needs it — keeps the Vite build free of the package. */
function loadHlsCtor(): Promise<HlsCtor | null> {
  const w = window as Window & { Hls?: HlsCtor };
  if (w.Hls) return Promise.resolve(w.Hls);
  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-pz-hls="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(w.Hls || null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
    s.async = true;
    s.dataset.pzHls = "1";
    s.onload = () => resolve(w.Hls || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

function inspectPlayerIframe(
  iframe: HTMLIFrameElement | null,
  lastTimes: WeakMap<HTMLVideoElement, number>
): "alive" | "dead" | "unknown" {
  if (!iframe) return "dead";
  // Native x8rr direct player (sibling <video data-pz-direct>).
  if (iframe.dataset.pzDirectStub === "1") {
    const host = iframe.parentElement;
    const videos = host ? Array.from(host.querySelectorAll("video[data-pz-direct]")) : [];
    for (const v of videos) {
      if (mediaLooksAlive(v as HTMLVideoElement, lastTimes)) return "alive";
    }
    return "dead";
  }
  let win: Window | null = null;
  let doc: Document | null = null;
  try {
    win = iframe.contentWindow;
    doc = iframe.contentDocument || win?.document || null;
  } catch {
    return "unknown";
  }
  if (!win || !doc || !doc.body) return "unknown";
  const videos = collectVideos(win);
  for (const v of videos) {
    if (mediaLooksAlive(v, lastTimes)) return "alive";
  }
  return "dead";
}

function getSavedMovies(): { items: SavedMovie[]; groups: MovieGroup[] } {
  try {
    const raw = localStorage.getItem("movies-saved");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { items: [], groups: [] };
}

function saveFavorites(data: { items: SavedMovie[]; groups: MovieGroup[] }) {
  try {
    localStorage.setItem("movies-saved", JSON.stringify(data));
  } catch {}
}

function mediaTypeOf(item: CatalogItem): "movie" | "tv" {
  if (item.media_type === "tv" || (!item.title && item.name)) return "tv";
  return "movie";
}

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      margin: "0 0 12px",
    }}>
      <p style={{
        fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em",
        color: S.text, margin: 0, display: "flex", alignItems: "center", gap: 8,
      }}>
        {children}
      </p>
      {action}
    </div>
  );
}

function PosterCard({
  item, type, isFavorited, onFavorite, onPlay, wide, rank,
}: {
  item: CatalogItem;
  type: "movie" | "tv";
  isFavorited?: boolean;
  onFavorite?: (item: CatalogItem, type: "movie" | "tv") => void;
  onPlay: (item: CatalogItem, type: "movie" | "tv") => void;
  wide?: boolean;
  rank?: number;
}) {
  const title = item.title || item.name || "Untitled";
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const poster = item.poster_path ? TMDB_IMG + item.poster_path : "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.02 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "relative", background: "transparent", border: "none",
        borderRadius: 14, overflow: "visible", cursor: "pointer",
        flex: wide ? "0 0 132px" : undefined, width: wide ? 132 : undefined,
      }}
      onClick={() => onPlay(item, type)}
    >
      <div style={{
        aspectRatio: "2/3", overflow: "hidden", background: S.elevated, position: "relative",
        borderRadius: 14, border: `1px solid ${S.border}`,
        boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
      }}>
        {poster ? (
          <CoverImg src={poster} alt={title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
            {type === "tv" ? <Tv size={28} /> : <Film size={28} />}
          </div>
        )}
        {typeof rank === "number" && (
          <span style={{
            position: "absolute", left: 6, bottom: -2, fontSize: 42, fontWeight: 850,
            color: "hsla(0,0%,100%,0.88)", letterSpacing: "-0.06em",
            textShadow: "0 4px 18px rgba(0,0,0,0.75)", lineHeight: 1, zIndex: 2,
          }}>
            {rank}
          </span>
        )}
        {rating && (
          <span style={{
            position: "absolute", top: 7, left: 7, fontSize: 10, fontWeight: 700,
            background: "hsla(220, 32%, 6%, 0.72)", color: S.gold, padding: "3px 6px",
            borderRadius: 999, display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(8px)",
          }}>
            <Star size={9} fill={S.gold} /> {rating}
          </span>
        )}
        {onFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onFavorite(item, type); }}
            style={{
              position: "absolute", top: 7, right: 7, width: 26, height: 26, borderRadius: 999,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "hsla(220, 32%, 6%, 0.72)", border: `1px solid ${S.border}`,
              cursor: "pointer", color: isFavorited ? "hsla(0,72%,62%,0.95)" : S.textMuted, backdropFilter: "blur(8px)",
            }}
          >
            <Heart size={11} fill={isFavorited ? "currentColor" : "none"} />
          </button>
        )}
        <div style={{
          position: "absolute", inset: 0, opacity: 0, transition: "opacity 0.15s",
          background: "linear-gradient(to top, hsla(220,35%,4%,0.75), transparent 50%)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 12,
        }}
          className="pz-poster-hover"
        />
      </div>
      <div style={{ padding: "8px 2px 0" }}>
        <h3 style={{ fontSize: 12, fontWeight: 650, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </h3>
        <p style={{ fontSize: 10, color: S.textMuted, margin: "2px 0 0" }}>
          {year || "—"} · {type === "tv" ? "Series" : "Movie"}
        </p>
      </div>
    </motion.div>
  );
}

function ShelfRow({
  title, items, onPlay, isFavorited, onFavorite, ranked,
}: {
  title: ReactNode;
  items: CatalogItem[];
  onPlay: (item: CatalogItem, type: "movie" | "tv") => void;
  isFavorited?: (id: number, type: "movie" | "tv") => boolean;
  onFavorite?: (item: CatalogItem, type: "movie" | "tv") => void;
  ranked?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, paddingRight: 8, scrollbarWidth: "none" }}>
        {items.map((item, i) => {
          const type = mediaTypeOf(item);
          return (
            <PosterCard
              key={`${title}-${type}-${item.id}`}
              wide
              rank={ranked ? i + 1 : undefined}
              item={item}
              type={type}
              isFavorited={isFavorited?.(item.id, type)}
              onFavorite={onFavorite}
              onPlay={onPlay}
            />
          );
        })}
      </div>
    </div>
  );
}

function MoviePlayer({
  state, onBack, onUpdate, recommended, onPlayRecommended,
}: {
  state: PlayerState;
  onBack: () => void;
  onUpdate: (next: Partial<PlayerState>) => void;
  recommended: CatalogItem[];
  onPlayRecommended: (item: CatalogItem, type: "movie" | "tv") => void;
}) {
  const frameHostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [watching, setWatching] = useState(false);
  const [provider, setProvider] = useState("vidfast");
  const [season, setSeason] = useState(state.season || 1);
  const [episode, setEpisode] = useState(state.episode || 1);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [frameReady, setFrameReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [barVisible, setBarVisible] = useState(true);
  const [hopIndex, setHopIndex] = useState(0);
  const [sourceNote, setSourceNote] = useState("");
  const [streams, setStreams] = useState<
    Array<{
      url: string;
      type?: string;
      quality?: string;
      provider?: string;
      providerName?: string;
      headers?: Record<string, string>;
      dead?: boolean;
      label?: string;
    }>
  >([]);
  const [streamIdx, setStreamIdx] = useState(0);
  const [playMode, setPlayMode] = useState<"direct" | "embed" | null>(null);
  const [directKey, setDirectKey] = useState(0);
  /** Bumped only when embed must remount (Tor hop / manual provider). */
  const [embedNonce, setEmbedNonce] = useState(0);
  const hideBarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoHopRef = useRef(true);
  const hopIndexRef = useRef(0);
  const streamIdxRef = useRef(0);
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  streamIdxRef.current = streamIdx;
  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const mediaKey = `${state.tmdbId}:${state.type}:${season}:${episode}`;
  const mediaKeyRef = useRef(mediaKey);

  useEffect(() => {
    const prev = localStorage.getItem("selectedVpnRegion") || DEFAULT_REGION;
    if (prev !== DEFAULT_REGION && prev !== TOR_REGION) {
      localStorage.setItem("pz-vpn-before-movies", prev);
    }
    // Prefer Tor for movie embeds (FrameX resolve is Tor server-side; embeds match).
    applyVpnRegion(TOR_REGION);
    return () => {
      const restore = localStorage.getItem("pz-vpn-before-movies") || DEFAULT_REGION;
      applyVpnRegion(restore);
    };
  }, []);

  useEffect(() => {
    setSeason(state.season || 1);
    setEpisode(state.episode || 1);
    setWatching(false);
    setFrameReady(false);
    autoHopRef.current = true;
    hopIndexRef.current = 0;
    setHopIndex(0);
    setProvider("vidfast");
    setSourceNote("");
    setStreams([]);
    setStreamIdx(0);
    setPlayMode(null);
    setDirectKey(0);
    setEmbedNonce(0);
  }, [state.tmdbId, state.type]);

  useEffect(() => {
    if (state.type !== "tv") {
      setSeasons([]);
      setEpisodes([]);
      return;
    }
    fetch(`/api/tmdb/tv/${state.tmdbId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: SeasonInfo[] = (d.seasons || []).filter((s: SeasonInfo) => s.season_number > 0);
        setSeasons(list);
      })
      .catch(() => setSeasons([]));
  }, [state.tmdbId, state.type]);

  useEffect(() => {
    if (state.type !== "tv") return;
    fetch(`/api/tmdb/tv/${state.tmdbId}/season/${season}`)
      .then((r) => r.json())
      .then((d) => setEpisodes(d.episodes || []))
      .catch(() => setEpisodes([]));
  }, [state.tmdbId, state.type, season]);

  useEffect(() => {
    onUpdate({ season, episode });
  }, [season, episode]);

  useEffect(() => {
    setPopupLock(true);
    const prevOpen = window.open;
    window.open = function () {
      return null;
    } as typeof window.open;
    const blockAux = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const blockBlank = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const t = (a.getAttribute("target") || "").toLowerCase();
      if (t === "_blank" || t === "_new") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("auxclick", blockAux, true);
    document.addEventListener("click", blockBlank, true);
    return () => {
      setPopupLock(false);
      window.open = prevOpen;
      document.removeEventListener("auxclick", blockAux, true);
      document.removeEventListener("click", blockBlank, true);
    };
  }, []);

  useEffect(() => {
    if (!watching) {
      try {
        if (iframeRef.current?.parentNode) iframeRef.current.parentNode.removeChild(iframeRef.current);
      } catch {}
      iframeRef.current = null;
      try {
        hostVideoCleanup(frameHostRef.current);
      } catch {}
      setFrameReady(false);
      return;
    }

    const host = frameHostRef.current;
    if (!host) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let sealTimer: ReturnType<typeof setInterval> | null = null;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let hls: { destroy: () => void } | null = null;
    let playToken = 0;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
      try {
        hls?.destroy();
      } catch {}
      hls = null;
      try {
        if (iframeRef.current?.parentNode) iframeRef.current.parentNode.removeChild(iframeRef.current);
      } catch {}
      iframeRef.current = null;
      hostVideoCleanup(host);
    };

    const sealFrame = (iframe: HTMLIFrameElement) => {
      sealPlayerPopups(iframe);
    };

    const proxyUrl = (stream: { url: string; headers?: Record<string, string> }) => {
      let u = `/api/tmdb/stream/proxy?url=${encodeURIComponent(stream.url)}`;
      if (stream.headers) u += `&headers=${encodeURIComponent(JSON.stringify(stream.headers))}`;
      return u;
    };

    const uniqStreams = (list: typeof streams) => {
      const best = new Map<string, (typeof streams)[number]>();
      for (const s of list) {
        if (!s?.url) continue;
        const key = `${s.providerName || s.provider || "src"}:${s.type || ""}:${s.quality || s.url}`;
        const cur = best.get(key);
        const q = (x?: string) => parseInt(String(x || ""), 10) || 0;
        if (!cur || q(s.quality) > q(cur.quality)) best.set(key, { ...s });
      }
      const unique = [...best.values()];
      const count: Record<string, number> = {};
      for (const s of unique) {
        const base = s.providerName || s.provider || "Server";
        count[base] = (count[base] || 0) + 1;
        s.label = base + (count[base] > 1 ? ` ${count[base]}` : "") + (s.quality ? ` ${s.quality}` : "");
      }
      return unique;
    };

    const startEmbed = async (regionOverride?: string) => {
      const hop = AUTO_SOURCE_HOPS[hopIndexRef.current] || AUTO_SOURCE_HOPS[0];
      const providerId = autoHopRef.current ? hop.provider : providerRef.current;
      const regionId =
        regionOverride ||
        (autoHopRef.current
          ? hop.region
          : localStorage.getItem("selectedVpnRegion") || DEFAULT_REGION);
      const prov = PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];

      setPlayMode("embed");
      playModeRef.current = "embed";
      setSourceNote(regionId === TOR_REGION ? "Loading via Tor…" : "Loading via proxy…");
      await applyVpnRegion(regionId);
      if (cancelled) return;

      const mountEmbed = () => {
        if (!pxReady()) return false;
        try {
          cleanup();
          const target =
            state.type === "tv"
              ? prov.tv(state.tmdbId, season, episode)
              : prov.movie(state.tmdbId);
          const iframe = document.createElement("iframe");
          iframe.style.cssText =
            "position:absolute;inset:0;width:100%;height:100%;border:none;background:#000;opacity:0;transition:opacity 0.25s ease;";
          iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
          iframe.allowFullscreen = true;
          iframe.referrerPolicy = "no-referrer";
          iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms allow-presentation"
          );
          iframe.title = "Player";
          iframe.onload = () => {
            iframe.dataset.pzReady = "1";
            iframe.style.opacity = "1";
            sealFrame(iframe);
          };
          iframe.src = pxEncode(target);
          host.appendChild(iframe);
          iframeRef.current = iframe;
          setFrameReady(true);
          setLoadError("");
          setSourceNote(regionId === TOR_REGION ? "Proxy · Tor" : "Proxy · Default");
          return true;
        } catch (e: any) {
          setLoadError(e?.message || "Failed to start player");
          return false;
        }
      };

      if (!mountEmbed()) {
        timer = setInterval(() => {
          if (cancelled) return;
          if (mountEmbed() && timer) clearInterval(timer);
        }, 120);
      }
    };

    const playDirect = async (list: typeof streams, idx: number, auto = true) => {
      const stream = list[idx];
      if (!stream?.url || cancelled) return false;
      const token = ++playToken;
      const startedAt = Date.now();
      cleanup();
      setPlayMode("direct");
      playModeRef.current = "direct";
      setStreamIdx(idx);
      streamIdxRef.current = idx;
      setSourceNote(`Loading ${stream.label || stream.providerName || "stream"}…`);

      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.autoplay = true;
      video.preload = "auto";
      video.dataset.pzDirect = "1";
      video.dataset.pzReady = "1";
      video.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;border:none;background:#000;object-fit:contain;";
      host.appendChild(video);

      const stub = document.createElement("iframe");
      stub.dataset.pzReady = "1";
      stub.dataset.pzDirectStub = "1";
      stub.style.display = "none";
      host.appendChild(stub);
      iframeRef.current = stub;

      let failed = false;
      let playing = false;
      let mediaRecoveries = 0;

      const goNext = () => {
        if (failed || cancelled || token !== playToken) return;
        failed = true;
        list[idx] = { ...list[idx], dead: true };
        setStreams([...list]);
        const next = idx + 1;
        if (auto && next < list.length && next < MAX_AUTO_SOURCES) {
          setSourceNote("Server failed — trying next…");
          void playDirect(list, next, true);
          return;
        }
        setSourceNote("Direct streams failed — trying Tor embed…");
        hopIndexRef.current = 0;
        setHopIndex(0);
        autoHopRef.current = true;
        void startEmbed(TOR_REGION);
      };

      /** Wait out SOURCE_MIN_MS so we don't burn through the list on first error blip. */
      const fail = (why?: string) => {
        if (failed || cancelled || token !== playToken || playing) return;
        const waited = Date.now() - startedAt;
        const left = SOURCE_MIN_MS - waited;
        if (left > 0) {
          setSourceNote(
            `Still loading ${stream.label || stream.providerName || "stream"}…` +
              (why ? ` (${why})` : "")
          );
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => goNext(), left);
          return;
        }
        goNext();
      };

      stallTimer = setTimeout(() => fail("timeout"), BLACK_FAIL_MS);

      const onPlaying = () => {
        if (token !== playToken) return;
        playing = true;
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = null;
        setSourceNote("");
        setFrameReady(true);
        setLoadError("");
      };
      video.addEventListener("playing", onPlaying);
      video.addEventListener("loadeddata", () => {
        if ((video.readyState || 0) >= 2) setFrameReady(true);
      });
      // Don't skip on the first media error — HLS often recovers; enforce min dwell.
      video.addEventListener("error", () => fail("media"));

      const src = proxyUrl(stream);
      const isHls =
        /\.m3u8(\?|$)/i.test(stream.url) || String(stream.type || "").toLowerCase() === "hls";
      try {
        if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
        } else if (isHls) {
          const Hls = await loadHlsCtor();
          if (cancelled || token !== playToken) return false;
          if (!Hls || !Hls.isSupported()) {
            fail("hls unsupported");
            return false;
          }
          const inst = new Hls({
            enableWorker: false,
            maxBufferLength: 24,
            maxMaxBufferLength: 48,
            backBufferLength: 12,
            manifestLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 3,
            fragLoadingMaxRetry: 4,
          });
          const errEvt = Hls.Events?.ERROR || "hlsError";
          const netErr = Hls.ErrorTypes?.NETWORK_ERROR || "networkError";
          const mediaErr = Hls.ErrorTypes?.MEDIA_ERROR || "mediaError";
          inst.on(errEvt, (_e, data) => {
            if (!data?.fatal || playing || failed || token !== playToken) return;
            if (data.type === netErr) {
              try {
                inst.startLoad?.();
                return;
              } catch {}
            } else if (data.type === mediaErr && mediaRecoveries < 2) {
              mediaRecoveries += 1;
              try {
                inst.recoverMediaError?.();
                return;
              } catch {}
            }
            fail(data.details || "hls");
          });
          const parsedEvt = Hls.Events?.MANIFEST_PARSED || "hlsManifestParsed";
          inst.on(parsedEvt, () => {
            void video.play().catch(() => {});
          });
          inst.loadSource(src);
          inst.attachMedia(video);
          hls = inst;
        } else {
          video.src = src;
        }
        void video.play().catch(() => {});
        setFrameReady(true);
        return true;
      } catch {
        fail("exception");
        return false;
      }
    };

    // Title / episode change must always re-scrape — ignore stale embed hop state.
    const mediaChanged = mediaKeyRef.current !== mediaKey;
    if (mediaChanged) {
      mediaKeyRef.current = mediaKey;
      autoHopRef.current = true;
      hopIndexRef.current = 0;
      playModeRef.current = null;
      streamsRef.current = [];
      streamIdxRef.current = 0;
      setStreams([]);
      setStreamIdx(0);
      setPlayMode(null);
      setHopIndex(0);
    }

    setFrameReady(false);
    (async () => {
      // User picked a scraped server from the bar (same title/episode).
      if (!mediaChanged && directKey > 0 && streamsRef.current.length) {
        await playDirect(streamsRef.current, streamIdxRef.current, false);
        return;
      }

      // Embed hop / manual provider (default wisp → Tor after ~20s black).
      // embedNonce is only a remount signal; hop/playMode refs decide the path.
      if (!mediaChanged && (hopIndexRef.current > 0 || playModeRef.current === "embed")) {
        await startEmbed();
        return;
      }

      // Lyra-style: FrameX over Tor → native HLS; if empty/fail → Tor embeds.
      setSourceNote("Finding stream (FrameX)…");
      try {
        const path =
          state.type === "tv"
            ? `/api/tmdb/stream/tv/${state.tmdbId}/${season}/${episode}`
            : `/api/tmdb/stream/movie/${state.tmdbId}`;
        const r = await fetch(path, { credentials: "include", cache: "no-store" });
        const d = await r.json().catch(() => null);
        const list = uniqStreams(Array.isArray(d?.streams) ? d.streams : []);
        if (!cancelled && list.length) {
          setStreams(list);
          streamsRef.current = list;
          await playDirect(list, 0, true);
          return;
        }
      } catch {}

      if (cancelled) return;
      hopIndexRef.current = 0;
      setHopIndex(0);
      autoHopRef.current = true;
      playModeRef.current = "embed";
      setPlayMode("embed");
      await startEmbed(TOR_REGION);
    })();

    sealTimer = setInterval(() => {
      if (iframeRef.current && !iframeRef.current.dataset.pzDirectStub) {
        sealFrame(iframeRef.current);
      }
    }, sealPollMs());

    return () => {
      cancelled = true;
      playToken += 1;
      if (timer) clearInterval(timer);
      if (sealTimer) clearInterval(sealTimer);
      cleanup();
    };
    // playMode/hopIndex omitted — refs + embedNonce drive remounts without killing HLS.
  }, [watching, provider, embedNonce, directKey, mediaKey]);

  useEffect(() => {
    if (!watching || !autoHopRef.current) return;
    const lastTimes = new WeakMap<HTMLVideoElement, number>();
    let deadMs = 0;
    let aliveHits = 0;
    let locked = false;
    const tickMs = 1000;
    const timer = window.setInterval(() => {
      if (!autoHopRef.current || locked) return;
      // Direct scrape path handles its own per-server 20s fail; only Tor-hop embeds.
      if (playModeRef.current === "direct") return;
      const iframe = iframeRef.current;
      if (iframe?.dataset.pzDirectStub === "1") return;
      if (!iframe || iframe.dataset.pzReady !== "1") {
        deadMs += tickMs;
      } else {
        const verdict = inspectPlayerIframe(iframe, lastTimes);
        if (verdict === "alive") {
          aliveHits += 1;
          deadMs = 0;
          if (aliveHits >= 2) locked = true;
          setSourceNote("");
          return;
        }
        if (verdict === "unknown") return;
        deadMs += tickMs;
      }
      if (deadMs < BLACK_FAIL_MS) return;
      deadMs = 0;
      const next = hopIndexRef.current + 1;
      if (next >= AUTO_SOURCE_HOPS.length) {
        autoHopRef.current = false;
        setSourceNote("Still not playing — try another source");
        return;
      }
      hopIndexRef.current = next;
      setHopIndex(next);
      setProvider(AUTO_SOURCE_HOPS[next].provider);
      setPlayMode("embed");
      playModeRef.current = "embed";
      setEmbedNonce((n) => n + 1);
      const nextHop = AUTO_SOURCE_HOPS[next];
      setSourceNote(
        nextHop.region === TOR_REGION ? "Switching to Tor…" : "Switching source…"
      );
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [watching, embedNonce, provider, mediaKey]);

  const bumpBar = () => {
    setBarVisible(true);
    if (hideBarTimer.current) clearTimeout(hideBarTimer.current);
    hideBarTimer.current = setTimeout(() => setBarVisible(false), 2800);
  };

  useEffect(() => {
    if (!watching) return;
    bumpBar();
    return () => {
      if (hideBarTimer.current) clearTimeout(hideBarTimer.current);
    };
  }, [watching, episode, season]);

  const pickProvider = (id: string) => {
    autoHopRef.current = false;
    setSourceNote("");
    setPlayMode("embed");
    playModeRef.current = "embed";
    setProvider(id);
    setEmbedNonce((n) => n + 1);
  };

  const startWatch = (ep?: number) => {
    if (typeof ep === "number") setEpisode(ep);
    autoHopRef.current = true;
    hopIndexRef.current = 0;
    setHopIndex(0);
    setPlayMode(null);
    playModeRef.current = null;
    setDirectKey(0);
    setEmbedNonce(0);
    setSourceNote("");
    setWatching(true);
  };

  const episodeList = episodes.length
    ? episodes
    : Array.from({ length: Math.max(episode, 12) }, (_, i) => ({
        episode_number: i + 1,
        name: `Episode ${i + 1}`,
      }));

  if (watching) {
    return (
      <div
        style={{ position: "absolute", inset: 0, background: "#000", display: "flex", flexDirection: "column" }}
        onMouseMove={bumpBar}
        onClick={bumpBar}
      >
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <div ref={frameHostRef} style={{ position: "absolute", inset: 0 }} />
          {!frameReady && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", color: S.textMuted, fontSize: 12, zIndex: 2,
            }}>
              {loadError || "Loading player…"}
            </div>
          )}
          {sourceNote ? (
            <div style={{
              position: "absolute", inset: 0, zIndex: 6, display: "flex",
              alignItems: "center", justifyContent: "center", pointerEvents: "none",
              background: sourceNote.startsWith("Switching") ? "hsla(220, 30%, 4%, 0.55)" : "transparent",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 999, background: "hsla(220, 28%, 10%, 0.88)",
                border: `1px solid ${S.border}`, color: S.text, fontSize: 12, fontWeight: 650,
                backdropFilter: "blur(12px)",
              }}>
                {sourceNote.startsWith("Switching") ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>
                  {sourceNote}
                  {autoHopRef.current && hopIndex > 0 && sourceNote.startsWith("Switching")
                    ? ` ${AUTO_SOURCE_HOPS[hopIndex]?.label || ""}`
                    : ""}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 8,
            padding: "10px 12px 12px",
            background: "linear-gradient(to top, hsla(220,35%,4%,0.88), transparent)",
            opacity: barVisible ? 1 : 0,
            transform: barVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.25s ease, transform 0.25s ease",
            pointerEvents: barVisible ? "auto" : "none",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "hsla(220, 28%, 10%, 0.72)",
            border: `1px solid ${S.border}`,
            borderRadius: 999,
            padding: "6px 8px 6px 6px",
            backdropFilter: "blur(16px)",
            maxWidth: 920,
            margin: "0 auto",
          }}>
            <button
              type="button"
              onClick={() => setWatching(false)}
              title="Back to details"
              style={{
                width: 28, height: 28, borderRadius: 999, border: `1px solid ${S.border}`,
                background: "hsla(220,24%,16%,0.5)", color: S.textSub, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <ArrowLeft size={12} />
            </button>
            <div style={{ minWidth: 0, flex: "0 1 140px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {state.title}
              </p>
              {state.type === "tv" && (
                <p style={{ fontSize: 9, color: S.textMuted, margin: 0 }}>S{season} · E{episode}</p>
              )}
            </div>

            {state.type === "tv" ? (
              <>
                <button
                  type="button"
                  onClick={() => setEpisode((e) => Math.max(1, e - 1))}
                  style={{
                    width: 26, height: 26, borderRadius: 999, border: `1px solid ${S.border}`,
                    background: "transparent", color: S.textSub, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  <ChevronLeft size={12} />
                </button>
                <div style={{ flex: 1, display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none", minWidth: 0 }}>
                  {episodeList.map((ep) => {
                    const active = ep.episode_number === episode;
                    return (
                      <button
                        key={ep.episode_number}
                        type="button"
                        onClick={() => setEpisode(ep.episode_number)}
                        style={{
                          flex: "0 0 auto",
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 650,
                          cursor: "pointer",
                          border: `1px solid ${active ? S.borderFocus : "transparent"}`,
                          background: active ? S.accentDim : "transparent",
                          color: active ? S.text : S.textMuted,
                        }}
                      >
                        E{ep.episode_number}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const max = episodeList.length || episode + 1;
                    setEpisode((e) => Math.min(max, e + 1));
                  }}
                  style={{
                    width: 26, height: 26, borderRadius: 999, border: `1px solid ${S.border}`,
                    background: "transparent", color: S.textSub, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  <ChevronRight size={12} />
                </button>
              </>
            ) : (
              <div style={{ flex: 1 }} />
            )}

            {streams.length && playMode !== "embed" ? (
              <div style={{ display: "flex", gap: 4, overflowX: "auto", maxWidth: 280, scrollbarWidth: "none" }}>
                {streams.map((s, i) => (
                  <button
                    key={`${s.label}-${i}`}
                    type="button"
                    disabled={!!s.dead}
                    onClick={() => {
                      streamIdxRef.current = i;
                      setStreamIdx(i);
                      setPlayMode("direct");
                      setDirectKey((k) => k + 1);
                    }}
                    style={{
                      flex: "0 0 auto",
                      padding: "4px 8px",
                      borderRadius: 999,
                      fontSize: 9,
                      fontWeight: 650,
                      cursor: s.dead ? "default" : "pointer",
                      opacity: s.dead ? 0.4 : 1,
                      textDecoration: s.dead ? "line-through" : "none",
                      border: `1px solid ${i === streamIdx ? S.borderFocus : S.border}`,
                      background: i === streamIdx ? S.accentDim : "transparent",
                      color: i === streamIdx ? S.text : S.textMuted,
                    }}
                  >
                    {s.label || s.providerName || `S${i + 1}`}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={provider}
                onChange={(e) => pickProvider(e.target.value)}
                style={{
                  background: "transparent", border: `1px solid ${S.border}`, borderRadius: 999,
                  color: S.textSub, fontSize: 10, padding: "4px 8px", outline: "none", cursor: "pointer",
                  flexShrink: 0, maxWidth: 110,
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "hsla(220, 35%, 4%, 0.96)" }}>
      {state.backdrop_path && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <CoverImg
            src={TMDB_BACKDROP + state.backdrop_path}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(2px) saturate(1.05)", opacity: 0.45 }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background:
              "linear-gradient(to right, hsla(220,35%,4%,0.92) 0%, hsla(220,35%,4%,0.72) 42%, hsla(220,35%,4%,0.55) 100%), linear-gradient(to top, hsla(220,35%,4%,0.96) 0%, hsla(220,35%,4%,0.35) 55%, hsla(220,35%,4%,0.55) 100%)",
          }} />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 2, height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 11px",
              background: "hsla(220, 28%, 12%, 0.55)", border: `1px solid ${S.border}`, borderRadius: 999,
              color: S.textSub, fontSize: 11, cursor: "pointer", backdropFilter: "blur(12px)",
            }}
          >
            <ArrowLeft size={12} /> Catalog
          </button>
          <div style={{ flex: 1 }} />
          <select
            value={provider}
            onChange={(e) => pickProvider(e.target.value)}
            style={{
              background: "hsla(220, 28%, 12%, 0.55)", border: `1px solid ${S.border}`, borderRadius: 999,
              color: S.textSub, fontSize: 10, padding: "6px 10px", outline: "none", cursor: "pointer",
              backdropFilter: "blur(12px)",
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 20px 20px",
          display: "flex", flexDirection: "column", gap: 16, scrollbarWidth: "none",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(240px, 0.85fr)",
            gap: 18,
            alignItems: "start",
          }}
            className="pz-movie-detail-grid"
          >
            <div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                {state.poster_path && (
                  <CoverImg
                    src={TMDB_IMG + state.poster_path}
                    alt=""
                    style={{
                      width: 120, height: 180, objectFit: "cover", borderRadius: 14,
                      border: `1px solid ${S.border}`, boxShadow: "0 16px 36px rgba(0,0,0,0.4)", flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                    color: S.accent, margin: "0 0 6px",
                  }}>
                    {state.type === "tv" ? "Series" : "Movie"}
                  </p>
                  <h1 style={{
                    fontSize: "clamp(1.35rem, 3vw, 2rem)", fontWeight: 800, color: S.text, margin: "0 0 8px",
                    letterSpacing: "-0.03em", lineHeight: 1.1,
                  }}>
                    {state.title}
                  </h1>
                  {state.type === "tv" && (
                    <p style={{ fontSize: 12, color: S.textSub, margin: "0 0 10px" }}>
                      Season {season} · Episode {episode}
                    </p>
                  )}
                  <p style={{
                    fontSize: 13, color: S.textSub, margin: "0 0 16px", lineHeight: 1.5,
                    display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {state.overview || "Ready when you are."}
                  </p>
                  <button
                    type="button"
                    onClick={() => startWatch()}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px",
                      borderRadius: 999, border: "none", cursor: "pointer",
                      background: "hsla(0,0%,98%,0.95)", color: "#0a0e16",
                      fontSize: 12, fontWeight: 700,
                      boxShadow: "0 10px 28px rgba(0,0,0,0.3)",
                    }}
                  >
                    <Play size={13} fill="currentColor" />
                    {state.type === "tv" ? `Open E${episode} source` : "Open source"}
                  </button>
                  <p style={{
                    margin: "12px 0 0",
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: S.textMuted,
                    maxWidth: 420,
                  }}>
                    Metadata from third-party catalog services. PeteZah does not host audiovisual files.
                    Playback is requested from separate third-party sources through the browsing layer.
                    Authorization depends on those sources and your local law — not a PeteZah license.
                  </p>
                </div>
              </div>

              {state.type === "tv" && (
                <div style={{
                  marginTop: 18, borderRadius: 16, border: `1px solid ${S.border}`,
                  background: "hsla(220, 28%, 10%, 0.5)", backdropFilter: "blur(14px)",
                  padding: "12px 12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: S.text, margin: 0 }}>Episodes</p>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(seasons.length ? seasons : [{ season_number: season }]).map((s) => (
                        <button
                          key={s.season_number}
                          type="button"
                          onClick={() => setSeason(s.season_number)}
                          style={{
                            padding: "4px 9px", borderRadius: 999, fontSize: 10, fontWeight: 650, cursor: "pointer",
                            background: season === s.season_number ? S.accentDim : "transparent",
                            border: `1px solid ${season === s.season_number ? S.borderFocus : S.border}`,
                            color: season === s.season_number ? S.text : S.textSub,
                          }}
                        >
                          S{s.season_number}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                    gap: 8,
                    maxHeight: 220,
                    overflowY: "auto",
                    scrollbarWidth: "thin",
                  }}>
                    {episodeList.map((ep) => {
                      const active = ep.episode_number === episode;
                      return (
                        <button
                          key={ep.episode_number}
                          type="button"
                          onClick={() => {
                            setEpisode(ep.episode_number);
                            startWatch(ep.episode_number);
                          }}
                          style={{
                            display: "flex", gap: 8, alignItems: "center", textAlign: "left",
                            padding: 6, borderRadius: 12, cursor: "pointer",
                            background: active ? S.accentDim : "hsla(220,24%,16%,0.35)",
                            border: `1px solid ${active ? S.borderFocus : S.border}`,
                          }}
                        >
                          <div style={{
                            width: 64, height: 36, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                            background: "hsla(220,28%,8%,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {ep.still_path ? (
                              <CoverImg src={TMDB_STILL + ep.still_path} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <Play size={11} style={{ color: S.textMuted }} />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: active ? S.accent : S.textMuted, margin: 0 }}>
                              E{ep.episode_number}
                            </p>
                            <p style={{
                              fontSize: 11, fontWeight: 550, color: S.text, margin: "1px 0 0",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {ep.name || `Episode ${ep.episode_number}`}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{
              borderRadius: 16, border: `1px solid ${S.border}`,
              background: "hsla(220, 28%, 10%, 0.5)", backdropFilter: "blur(14px)",
              padding: "12px",
              maxHeight: "min(70vh, 560px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: S.text, margin: "0 0 10px" }}>
                More like this
              </p>
              <div style={{
                flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7,
                scrollbarWidth: "thin",
              }}>
                {recommended.slice(0, 16).map((item) => {
                  const type = mediaTypeOf(item);
                  const title = item.title || item.name || "Untitled";
                  const poster = item.poster_path ? TMDB_IMG + item.poster_path : "";
                  return (
                    <button
                      key={`${type}-${item.id}`}
                      type="button"
                      onClick={() => onPlayRecommended(item, type)}
                      style={{
                        display: "flex", gap: 10, alignItems: "center", padding: 5, borderRadius: 12,
                        background: "transparent", border: `1px solid ${S.border}`, cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 42, height: 60, borderRadius: 8, overflow: "hidden",
                        background: S.elevated, flexShrink: 0,
                      }}>
                        {poster && <CoverImg src={poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{
                          fontSize: 12, fontWeight: 650, color: S.text, margin: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {title}
                        </p>
                        <p style={{ fontSize: 10, color: S.textMuted, margin: "3px 0 0" }}>
                          {type === "tv" ? "Series" : "Movie"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .pz-movie-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function MoviesPage({
  onNavigate,
  initialQuery = "",
}: {
  onNavigate?: (url: string) => void;
  initialQuery?: string;
}) {
  const [data, setData] = useState(getSavedMovies);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [trending, setTrending] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<"popular" | "trending" | "top_rated" | "now_playing">("popular");
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { items } = data;

  const isFavorited = (tmdbId: number, type: "movie" | "tv") =>
    items.some((i) => i.tmdbId === tmdbId && i.type === type);

  const toggleFavorite = (item: CatalogItem, type: "movie" | "tv") => {
    const tmdbId = item.id;
    if (isFavorited(tmdbId, type)) {
      setData((prev) => ({
        ...prev,
        items: prev.items.filter((i) => !(i.tmdbId === tmdbId && i.type === type)),
      }));
    } else {
      setData((prev) => ({
        ...prev,
        items: [{
          id: String(Date.now()),
          type,
          tmdbId,
          title: item.title || item.name || "Untitled",
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          release_date: item.release_date,
          first_air_date: item.first_air_date,
          groupId: null,
          season: type === "tv" ? 1 : undefined,
          episode: type === "tv" ? 1 : undefined,
          createdAt: Date.now(),
        }, ...prev.items],
      }));
    }
  };

  const openPlayer = async (item: CatalogItem, type: "movie" | "tv") => {
    const ok = await isSignedIn();
    if (!ok) {
      setPendingAuth({ type: "movies" });
      onNavigate?.("petezah://account");
      return;
    }
    const saved = items.find((i) => i.tmdbId === item.id && i.type === type);
    setPlayerState({
      type,
      tmdbId: item.id,
      title: item.title || item.name || "Untitled",
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      overview: item.overview,
      season: type === "tv" ? saved?.season || 1 : undefined,
      episode: type === "tv" ? saved?.episode || 1 : undefined,
    });
  };

  useEffect(() => { saveFavorites(data); }, [data]);

  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);
      setError("");
      try {
        if (searchQuery.trim()) {
          const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(searchQuery.trim())}`);
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || "Search failed");
          setCatalog(d.results || []);
        } else {
          const [moviesRes, tvRes, trendMovie, trendTv] = await Promise.all([
            fetch(`/api/tmdb/movie/${sortBy}`),
            fetch(`/api/tmdb/tv/${sortBy}`),
            fetch(`/api/tmdb/movie/trending`),
            fetch(`/api/tmdb/tv/trending`),
          ]);
          if (!moviesRes.ok || !tvRes.ok || !trendMovie.ok || !trendTv.ok) {
            const bad = [moviesRes, tvRes, trendMovie, trendTv].find((r) => !r.ok);
            let msg = "Catalog unavailable";
            try {
              const d = await bad?.json();
              if (d?.error) msg = d.error;
            } catch {}
            throw new Error(msg);
          }
          const [movies, tv, tm, tt] = await Promise.all([
            moviesRes.json(), tvRes.json(), trendMovie.json(), trendTv.json(),
          ]);
          const merged = [
            ...(movies.results || []).map((r: CatalogItem) => ({ ...r, media_type: "movie" })),
            ...(tv.results || []).map((r: CatalogItem) => ({ ...r, media_type: "tv" })),
          ].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
          setCatalog(merged);
          setTrending([
            ...(tm.results || []).map((r: CatalogItem) => ({ ...r, media_type: "movie" })),
            ...(tt.results || []).map((r: CatalogItem) => ({ ...r, media_type: "tv" })),
          ]);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load catalog");
      } finally {
        setLoading(false);
      }
    };

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (searchQuery) searchTimeoutRef.current = setTimeout(fetchCatalog, 320);
    else fetchCatalog();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, sortBy]);

  const continueList = items.slice(0, 12);
  const featured = (!searchQuery && (trending[0] || catalog[0])) || null;
  const recommended = (trending.length ? trending : catalog).filter(
    (i) => !playerState || i.id !== playerState.tmdbId
  );

  if (playerState) {
    return (
      <MoviePlayer
        key={`${playerState.type}-${playerState.tmdbId}`}
        state={playerState}
        onBack={() => {
          if (playerState.type === "tv") {
            setData((prev) => ({
              ...prev,
              items: prev.items.map((i) =>
                i.tmdbId === playerState.tmdbId && i.type === "tv"
                  ? { ...i, season: playerState.season, episode: playerState.episode }
                  : i
              ),
            }));
          }
          setPlayerState(null);
        }}
        onUpdate={(next) => setPlayerState((prev) => (prev ? { ...prev, ...next } : null))}
        recommended={recommended}
        onPlayRecommended={openPlayer}
      />
    );
  }

  const featuredType = featured ? mediaTypeOf(featured) : "movie";
  const featuredRating = featured?.vote_average ? featured.vote_average.toFixed(1) : null;
  const topTen = (trending.length ? trending : catalog).slice(0, 10);
  const shelfCatalog = catalog.slice(0, 18);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: S.bg }}>
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", scrollbarWidth: "none" }}>
        {!searchQuery && featured && (
          <div style={{ position: "relative", height: "min(58vh, 460px)", minHeight: 280 }}>
            {featured.backdrop_path && (
              <CoverImg
                src={TMDB_BACKDROP + featured.backdrop_path}
                alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
            <div style={{
              position: "absolute", inset: 0,
              background:
                "linear-gradient(to top, hsla(220,35%,4%,0.98) 0%, hsla(220,35%,4%,0.55) 42%, hsla(220,35%,4%,0.25) 70%, hsla(220,35%,4%,0.45) 100%), linear-gradient(90deg, hsla(220,35%,4%,0.88) 0%, hsla(220,35%,4%,0.35) 55%, transparent 100%)",
            }} />
            <div style={{
              position: "relative", zIndex: 2, height: "100%", display: "flex", flexDirection: "column",
              justifyContent: "flex-end", padding: "24px 28px 28px", maxWidth: 560,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                color: S.accent, marginBottom: 8,
              }}>
                Featured · {featuredType === "tv" ? "Series" : "Movie"}
              </span>
              <h1 style={{
                fontSize: "clamp(1.6rem, 4vw, 2.6rem)", fontWeight: 800, color: S.text, margin: "0 0 8px",
                lineHeight: 1.08, letterSpacing: "-0.03em",
              }}>
                {featured.title || featured.name}
              </h1>
              {featuredRating && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Star size={12} fill={S.gold} color={S.gold} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: S.gold }}>{featuredRating}</span>
                </div>
              )}
              <p style={{
                fontSize: 13, color: S.textSub, margin: "0 0 16px", lineHeight: 1.45,
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {featured.overview || "Browse metadata and open a third-party source."}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => openPlayer(featured, featuredType)}
                  style={{
                    width: 48, height: 48, borderRadius: 999, border: "none", cursor: "pointer",
                    background: "hsla(0,0%,98%,0.95)", color: "#0a0e16",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
                  }}
                >
                  <Play size={18} fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={() => openPlayer(featured, featuredType)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px",
                    borderRadius: 999, cursor: "pointer",
                    background: "hsla(220, 28%, 12%, 0.55)", border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 12, fontWeight: 650, backdropFilter: "blur(10px)",
                  }}
                >
                  <Info size={13} /> See more
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: searchQuery ? "64px 24px 40px" : "8px 24px 48px", position: "relative", zIndex: 1 }}>
          {error && (
            <div style={{
              padding: "12px 16px", background: "hsl(0 60% 30% / 0.2)",
              border: `1px solid hsl(0 60% 50% / 0.4)`, borderRadius: 12,
              color: S.danger, fontSize: 12, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {searchQuery ? (
            <div>
              <SectionLabel>
                <Search size={14} /> Results for “{searchQuery}”
              </SectionLabel>
              {loading && (
                <div style={{ textAlign: "center", color: S.textMuted, padding: "40px 0" }}>
                  <p style={{ fontSize: 12 }}>Loading…</p>
                </div>
              )}
              {!loading && catalog.length === 0 && (
                <div style={{ textAlign: "center", color: S.textMuted, padding: "40px 0" }}>
                  <p style={{ fontSize: 12 }}>No results found</p>
                </div>
              )}
              {!loading && catalog.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 14 }}>
                  <AnimatePresence>
                    {catalog.map((item) => {
                      const type = mediaTypeOf(item);
                      return (
                        <PosterCard
                          key={`${type}-${item.id}`}
                          item={item}
                          type={type}
                          isFavorited={isFavorited(item.id, type)}
                          onFavorite={toggleFavorite}
                          onPlay={openPlayer}
                        />
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          ) : (
            <>
              {continueList.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionLabel><Play size={14} /> Continue Watching</SectionLabel>
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
                    {continueList.map((item) => (
                      <PosterCard
                        key={`${item.type}-${item.tmdbId}`}
                        wide
                        item={{
                          id: item.tmdbId,
                          title: item.title,
                          poster_path: item.poster_path,
                          release_date: item.release_date,
                          first_air_date: item.first_air_date,
                          media_type: item.type,
                        }}
                        type={item.type}
                        onPlay={() =>
                          openPlayer(
                            {
                              id: item.tmdbId,
                              title: item.title,
                              poster_path: item.poster_path,
                              backdrop_path: item.backdrop_path,
                              release_date: item.release_date,
                              first_air_date: item.first_air_date,
                              media_type: item.type,
                            },
                            item.type
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              <ShelfRow
                title={<>TOP 10 Today</>}
                items={topTen}
                ranked
                onPlay={openPlayer}
                isFavorited={isFavorited}
                onFavorite={toggleFavorite}
              />

              <ShelfRow
                title={<><Sparkles size={14} /> Trending</>}
                items={trending.slice(0, 16)}
                onPlay={openPlayer}
                isFavorited={isFavorited}
                onFavorite={toggleFavorite}
              />

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <p style={{
                    fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em",
                    color: S.text, margin: 0, display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Film size={14} />{" "}
                    {sortBy === "trending" ? "Trending" : sortBy === "top_rated" ? "Top rated" : sortBy === "now_playing" ? "Now playing" : "Popular"}
                  </p>
                  <div style={{ flex: 1 }} />
                  <div style={{
                    display: "inline-flex", gap: 4, padding: 3, borderRadius: 999,
                    background: "hsla(220,28%,12%,0.4)", border: `1px solid ${S.border}`,
                  }}>
                    {([
                      ["popular", "Popular"],
                      ["trending", "Trending"],
                      ["top_rated", "Top"],
                      ["now_playing", "New"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSortBy(id)}
                        style={{
                          padding: "5px 10px", borderRadius: 999, border: "none", cursor: "pointer",
                          fontSize: 11, fontWeight: 650,
                          background: sortBy === id ? S.accentDim : "transparent",
                          color: sortBy === id ? S.text : S.textMuted,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {loading ? (
                  <div style={{ textAlign: "center", color: S.textMuted, padding: "28px 0" }}>
                    <p style={{ fontSize: 12 }}>Loading…</p>
                  </div>
                ) : (
                  <>
                    <div style={{ padding: "0 0 12px" }}>
                      <AdFeedStrip />
                      <AdPageStack />
                    </div>
                    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
                      {shelfCatalog.map((item) => {
                        const type = mediaTypeOf(item);
                        return (
                          <PosterCard
                            key={`shelf-${type}-${item.id}`}
                            wide
                            item={item}
                            type={type}
                            isFavorited={isFavorited(item.id, type)}
                            onFavorite={toggleFavorite}
                            onPlay={openPlayer}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          <div style={{ padding: "16px 0 4px" }}>
            <AdPageStack />
          </div>
          <p style={{
            margin: "28px 0 8px",
            fontSize: 10,
            lineHeight: 1.45,
            color: S.textMuted,
            maxWidth: 560,
          }}>
            Film &amp; TV metadata is for discovery. PeteZah does not host or store the underlying audiovisual files.
            Opening a title requests content from separate third-party sources through the browsing layer.
            See Terms §6 and the DMCA policy for architecture and complaint handling.
          </p>
        </div>
      </div>

      <div
        className="pointer-events-none"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, padding: "14px 20px",
          background: "linear-gradient(to bottom, hsla(220,35%,6%,0.55) 0%, hsla(220,35%,6%,0.12) 75%, transparent 100%)",
        }}
      >
        <div className="pointer-events-auto" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 999,
              background: S.accentDim, border: `1px solid ${S.borderFocus}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Clapperboard size={13} style={{ color: S.accent }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 750, color: S.text, letterSpacing: "-0.02em" }}>Cinema</span>
          </div>
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 8,
            background: "hsla(220, 28%, 12%, 0.42)", border: `1px solid ${S.border}`,
            borderRadius: 999, padding: "7px 12px", backdropFilter: "blur(14px)",
            width: "min(340px, 52vw)",
          }}>
            <Search size={12} style={{ color: S.textMuted, flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search movies & TV…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1, background: "none", border: "none", color: S.text,
                fontSize: 12, outline: "none", fontFamily: "inherit", minWidth: 0,
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex", padding: 0 }}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
