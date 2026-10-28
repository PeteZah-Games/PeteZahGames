import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, ListMusic,
  Plus, Trash2, Share2, X, Music2, Heart, Copy, Check, Disc3, Flame,
  Sparkles, Zap, Radio, ChevronLeft, ChevronRight, MoreHorizontal,
  ListPlus, ListEnd, Library, SlidersHorizontal,
} from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";
import { hrefs } from "@/lib/uiMarks";
import { trackAchievementEvent } from "@/lib/achievementEvents";
import { CoverImg } from "@/lib/mediaCover";
<<<<<<< HEAD
<<<<<<< HEAD
import { AdResponsiveBanner, AdNativeBarAlt } from "@/components/ads/Adsterra";
=======
import { AdPageStack } from "@/components/ads/Units";
>>>>>>> e03cf675 (updates updates (games and chat fixes))
=======
import { AdPageStack } from "@/components/ads/Units";
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
import { progressPollMs } from "@/lib/liteDevice";

interface Track {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  duration: number;
  permalink_url?: string | null;
  genre?: string | null;
}

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

interface BrowseSection {
  id: string;
  title: string;
  icon: string;
  tracks: Track[];
}

type NavView = "browse" | "search" | "library" | "playlist";

const S = {
  bg: "transparent",
  surface: "hsla(220, 32%, 8%, 0.55)",
  elevated: "hsla(215, 28%, 14%, 0.72)",
  glass: "hsla(220, 35%, 6%, 0.42)",
  border: "hsla(210, 40%, 70%, 0.12)",
  borderFocus: "hsla(205, 80%, 55%, 0.55)",
  accent: "hsl(205 85% 62%)",
  accentDim: "hsla(205, 70%, 45%, 0.22)",
  accentHot: "hsla(340, 78%, 58%, 0.92)",
  text: "hsla(0, 0%, 98%, 0.95)",
  textSub: "hsla(210, 20%, 70%, 0.65)",
  textMuted: "hsla(210, 15%, 55%, 0.55)",
  danger: "hsl(0 60% 56%)",
};

const EQ_BANDS = [
  { label: "100", freq: 100 },
  { label: "250", freq: 250 },
  { label: "600", freq: 600 },
  { label: "2k", freq: 2000 },
  { label: "5k", freq: 5000 },
  { label: "8k", freq: 8000 },
] as const;

const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0],
  Bass: [8, 5, 1, 0, -1, -2],
  Vocal: [-2, 0, 4, 5, 3, 1],
  Treble: [-2, -1, 0, 2, 6, 8],
};

const EQ_KEY = "petezah-music-eq";
const EQ_ORANGE = "hsl(28 78% 58%)";
const EQ_ORANGE_DIM = "hsla(28, 70%, 48%, 0.22)";
const MUSIC_KEY = "petezah-music";
const LIKED_KEY = "petezah-music-liked";
const ease = [0.22, 1, 0.36, 1] as const;

function loadEqState(): { on: boolean; gains: number[]; preset: string } {
  try {
    const raw = localStorage.getItem(EQ_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.gains) && p.gains.length === EQ_BANDS.length) {
        return { on: !!p.on, gains: p.gains.map((n: any) => Number(n) || 0), preset: p.preset || "Flat" };
      }
    }
  } catch {}
  return { on: false, gains: EQ_PRESETS.Flat.slice(), preset: "Flat" };
}

const INSTANT_SEED: BrowseSection[] = [
  {
    id: "top",
    title: "Top Hits",
    icon: "flame",
    tracks: [
      { id: "yt51zjlMhdSTE", title: "Espresso", artist: "Sabrina Carpenter", artwork: "https://i.ytimg.com/vi/51zjlMhdSTE/hqdefault.jpg", duration: 176000 },
      { id: "ytd5gf9dXbPi0", title: "BIRDS OF A FEATHER", artist: "Billie Eilish", artwork: "https://i.ytimg.com/vi/d5gf9dXbPi0/hqdefault.jpg", duration: 212000 },
      { id: "ytPfH7jq_uSCM", title: "Die With A Smile", artist: "Lady Gaga & Bruno Mars", artwork: "https://i.ytimg.com/vi/PfH7jq_uSCM/hqdefault.jpg", duration: 252000 },
      { id: "yt8Ebqe2Dbzls", title: "APT.", artist: "ROSÉ & Bruno Mars", artwork: "https://i.ytimg.com/vi/8Ebqe2Dbzls/hqdefault.jpg", duration: 170000 },
      { id: "ytnZjTtuNR3Og", title: "A Bar Song (Tipsy)", artist: "Shaboozey", artwork: "https://i.ytimg.com/vi/nZjTtuNR3Og/hqdefault.jpg", duration: 172000 },
      { id: "ytFkOpwodhROI", title: "Lose Control", artist: "Teddy Swims", artwork: "https://i.ytimg.com/vi/FkOpwodhROI/hqdefault.jpg", duration: 211000 },
      { id: "ytHU08BcK5SUY", title: "Beautiful Things", artist: "Benson Boone", artwork: "https://i.ytimg.com/vi/HU08BcK5SUY/hqdefault.jpg", duration: 181000 },
      { id: "yt1RKqOmSkGgM", title: "Good Luck, Babe!", artist: "Chappell Roan", artwork: "https://i.ytimg.com/vi/1RKqOmSkGgM/hqdefault.jpg", duration: 219000 },
      { id: "ytW_YOJWZIjxo", title: "That's So True", artist: "Gracie Abrams", artwork: "https://i.ytimg.com/vi/W_YOJWZIjxo/hqdefault.jpg", duration: 167000 },
      { id: "ytkpwunIatorM", title: "Ordinary", artist: "Alex Warren", artwork: "https://i.ytimg.com/vi/kpwunIatorM/hqdefault.jpg", duration: 188000 },
      { id: "ytmhTiOYFF0wg", title: "Messy", artist: "Lola Young", artwork: "https://i.ytimg.com/vi/mhTiOYFF0wg/hqdefault.jpg", duration: 285000 },
      { id: "ytm0NZ-aH0G1g", title: "Sailor Song", artist: "Gigi Perez", artwork: "https://i.ytimg.com/vi/m0NZ-aH0G1g/hqdefault.jpg", duration: 211000 },
    ],
  },
  {
    id: "pop",
    title: "Pop",
    icon: "sparkles",
    tracks: [
      { id: "ytzAgVtzhjfCA", title: "Please Please Please", artist: "Sabrina Carpenter", artwork: "https://i.ytimg.com/vi/zAgVtzhjfCA/hqdefault.jpg", duration: 187000 },
      { id: "ytz9Q9OzL_wI8", title: "Taste", artist: "Sabrina Carpenter", artwork: "https://i.ytimg.com/vi/z9Q9OzL_wI8/hqdefault.jpg", duration: 158000 },
      { id: "ytic8j13piAhQ", title: "Cruel Summer", artist: "Taylor Swift", artwork: "https://i.ytimg.com/vi/ic8j13piAhQ/hqdefault.jpg", duration: 180000 },
      { id: "ytV1Z586zoeeE", title: "As It Was", artist: "Harry Styles", artwork: "https://i.ytimg.com/vi/V1Z586zoeeE/hqdefault.jpg", duration: 166000 },
      { id: "ytXqN2qFvY64U", title: "Anti-Hero", artist: "Taylor Swift", artwork: "https://i.ytimg.com/vi/XqN2qFvY64U/hqdefault.jpg", duration: 204000 },
      { id: "ytWHuBW3qKm9g", title: "Levitating", artist: "Dua Lipa", artwork: "https://i.ytimg.com/vi/WHuBW3qKm9g/hqdefault.jpg", duration: 221000 },
      { id: "ytvp6XdbG3AhA", title: "Pink Pony Club", artist: "Chappell Roan", artwork: "https://i.ytimg.com/vi/vp6XdbG3AhA/hqdefault.jpg", duration: 259000 },
    ],
  },
  {
    id: "hiphop",
    title: "Hip-Hop",
    icon: "zap",
    tracks: [
      { id: "ytT6eK-2OQtew", title: "Not Like Us", artist: "Kendrick Lamar", artwork: "https://i.ytimg.com/vi/T6eK-2OQtew/hqdefault.jpg", duration: 274000 },
      { id: "ytHfWLgELllZs", title: "luther", artist: "Kendrick Lamar & SZA", artwork: "https://i.ytimg.com/vi/HfWLgELllZs/hqdefault.jpg", duration: 178000 },
      { id: "ytU-l4ya3ejko", title: "FE!N", artist: "Travis Scott", artwork: "https://i.ytimg.com/vi/U-l4ya3ejko/hqdefault.jpg", duration: 194000 },
      { id: "ytd-JBBNg8YKs", title: "SICKO MODE", artist: "Travis Scott", artwork: "https://i.ytimg.com/vi/d-JBBNg8YKs/hqdefault.jpg", duration: 315000 },
      { id: "ytm1a_GqJf02M", title: "God's Plan", artist: "Drake", artwork: "https://i.ytimg.com/vi/m1a_GqJf02M/hqdefault.jpg", duration: 199000 },
      { id: "yti9PSG5mFYoo", title: "Industry Baby", artist: "Lil Nas X & Jack Harlow", artwork: "https://i.ytimg.com/vi/i9PSG5mFYoo/hqdefault.jpg", duration: 229000 },
    ],
  },
  {
    id: "rnb",
    title: "R&B",
    icon: "heart",
    tracks: [
      { id: "ytSv5yCzPCkv8", title: "Snooze", artist: "SZA", artwork: "https://i.ytimg.com/vi/Sv5yCzPCkv8/hqdefault.jpg", duration: 204000 },
      { id: "ytSQnc1QibapQ", title: "Kill Bill", artist: "SZA", artwork: "https://i.ytimg.com/vi/SQnc1QibapQ/hqdefault.jpg", duration: 156000 },
      { id: "ytfHI8X4OXluQ", title: "Blinding Lights", artist: "The Weeknd", artwork: "https://i.ytimg.com/vi/fHI8X4OXluQ/hqdefault.jpg", duration: 204000 },
      { id: "ytu6lihZAcy4s", title: "Save Your Tears", artist: "The Weeknd", artwork: "https://i.ytimg.com/vi/u6lihZAcy4s/hqdefault.jpg", duration: 217000 },
      { id: "ytmX19AV35PhI", title: "Timeless", artist: "The Weeknd & Playboi Carti", artwork: "https://i.ytimg.com/vi/mX19AV35PhI/hqdefault.jpg", duration: 257000 },
    ],
  },
  {
    id: "chill",
    title: "Chill",
    icon: "radio",
    tracks: [
      { id: "ytFvOpPeKSf_4", title: "Glimpse of Us", artist: "Joji", artwork: "https://i.ytimg.com/vi/FvOpPeKSf_4/hqdefault.jpg", duration: 234000 },
      { id: "ytLUXu4aTnK7E", title: "Slow Dancing in the Dark", artist: "Joji", artwork: "https://i.ytimg.com/vi/LUXu4aTnK7E/hqdefault.jpg", duration: 210000 },
      { id: "ytApXoWvfEYVU", title: "Sunflower", artist: "Post Malone & Swae Lee", artwork: "https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg", duration: 162000 },
      { id: "ytpQV0WEdT_OE", title: "Circles", artist: "Post Malone", artwork: "https://i.ytimg.com/vi/pQV0WEdT_OE/hqdefault.jpg", duration: 216000 },
      { id: "ytKT7F15T9VBI", title: "Heat Waves", artist: "Glass Animals", artwork: "https://i.ytimg.com/vi/KT7F15T9VBI/hqdefault.jpg", duration: 239000 },
    ],
  },
];

function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(MUSIC_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [{ id: "default", name: "Liked Mix", tracks: [], createdAt: Date.now() }];
}

function savePlaylists(playlists: Playlist[]) {
  try {
    localStorage.setItem(MUSIC_KEY, JSON.stringify(playlists));
    requestSyncSoon();
  } catch {}
}

function loadLiked(): Track[] {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLiked(tracks: Track[]) {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify(tracks));
    requestSyncSoon();
  } catch {}
}

function formatTime(ms: number) {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatSec(sec: number) {
  const m = Math.floor(sec / 60);
  const r = Math.floor(sec % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function encodeShare(payload: object) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeShare(raw: string) {
  try {
    const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}

function parseMusicUrl(url?: string) {
  if (!url || !url.startsWith(hrefs.mu())) return { trackId: null as string | null, share: null as any };
  try {
    const q = url.includes("?") ? url.split("?")[1] : "";
    const params = new URLSearchParams(q);
    const trackId = params.get("t") || params.get("track");
    const shareRaw = params.get("share") || params.get("p");
    return { trackId, share: shareRaw ? decodeShare(shareRaw) : null };
  } catch {
    return { trackId: null, share: null };
  }
}

function loadScriptOnce(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.ready === "1") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => {
      (s as any).dataset.ready = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadYoutubeApi() {
  return new Promise<any>((resolve) => {
    const w = window as any;
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try { prev?.(); } catch {}
      resolve(w.YT);
    };
    loadScriptOnce("youtube-iframe-api", "https://www.youtube.com/iframe_api").catch(() => {});
  });
}

function loadSoundCloudApi() {
  return loadScriptOnce("soundcloud-widget-api", "https://w.soundcloud.com/player/api.js").then(() => (window as any).SC);
}

function sectionIcon(name: string) {
  switch (name) {
    case "flame": return <Flame size={14} />;
    case "sparkles": return <Sparkles size={14} />;
    case "zap": return <Zap size={14} />;
    case "radio": return <Radio size={14} />;
    case "heart": return <Heart size={14} />;
    default: return <Disc3 size={14} />;
  }
}

export default function MusicPage({
  onNavigate,
  initialUrl,
}: {
  onNavigate: (url: string) => void;
  initialUrl?: string;
}) {
  const [query, setQuery] = useState(() => {
    try {
      if (!initialUrl) return "";
      return new URLSearchParams(initialUrl.split("?")[1] || "").get("q") || "";
    } catch {
      return "";
    }
  });
  const [results, setResults] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>(() => INSTANT_SEED[0]?.tracks || []);
  const [sections, setSections] = useState<BrowseSection[]>(INSTANT_SEED);
  const [loading, setLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [error, setError] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists);
  const [liked, setLiked] = useState<Track[]>(loadLiked);
  const [nav, setNav] = useState<NavView>(() => {
    try {
      if (!initialUrl) return "browse";
      const q = new URLSearchParams(initialUrl.split("?")[1] || "").get("q");
      return q ? "search" : "browse";
    } catch {
      return "browse";
    }
  });
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loopTrack, setLoopTrack] = useState(false);
  const [loopPlaylist, setLoopPlaylist] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shareMsg, setShareMsg] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [addMenuTrack, setAddMenuTrack] = useState<Track | null>(null);

  const [eqOpen, setEqOpen] = useState(false);
  const [eqOn, setEqOn] = useState(() => loadEqState().on);
  const [eqGains, setEqGains] = useState(() => loadEqState().gains);
  const [eqPreset, setEqPreset] = useState(() => loadEqState().preset);
  const [playNonce, setPlayNonce] = useState(0);

  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const scFrameRef = useRef<HTMLIFrameElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const scWidgetRef = useRef<any>(null);
  const providerRef = useRef<"youtube" | "soundcloud" | "audio" | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenRef = useRef(0);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const loopTrackRef = useRef(loopTrack);
  const loopPlaylistRef = useRef(loopPlaylist);
  const playingRef = useRef(playing);
  const eqOnRef = useRef(eqOn);
  const eqGainsRef = useRef(eqGains);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const eqSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqPreampRef = useRef<GainNode | null>(null);
  const current = queue[queueIndex] || null;

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { loopTrackRef.current = loopTrack; }, [loopTrack]);
  useEffect(() => { loopPlaylistRef.current = loopPlaylist; }, [loopPlaylist]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { eqOnRef.current = eqOn; }, [eqOn]);
  useEffect(() => { eqGainsRef.current = eqGains; }, [eqGains]);

  useEffect(() => {
    try {
      localStorage.setItem(EQ_KEY, JSON.stringify({ on: eqOn, gains: eqGains, preset: eqPreset }));
    } catch {}
  }, [eqOn, eqGains, eqPreset]);

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const ensureEqGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const preamp = ctx.createGain();
      preamp.gain.value = 1;
      eqPreampRef.current = preamp;
      const filters = EQ_BANDS.map((b, i) => {
        const f = ctx.createBiquadFilter();
        f.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
        f.frequency.value = b.freq;
        f.Q.value = 1.1;
        f.gain.value = eqGainsRef.current[i] || 0;
        return f;
      });
      eqFiltersRef.current = filters;
      try {
        const src = ctx.createMediaElementSource(audio);
        eqSourceRef.current = src;
        let node: AudioNode = src;
        node.connect(preamp);
        node = preamp;
        for (const f of filters) {
          node.connect(f);
          node = f;
        }
        node.connect(ctx.destination);
      } catch {}
    }
    return audioCtxRef.current;
  }, []);

  const applyEqGains = useCallback((gains: number[], on: boolean) => {
    const filters = eqFiltersRef.current;
    filters.forEach((f, i) => {
      f.gain.value = on ? gains[i] || 0 : 0;
    });
    if (eqPreampRef.current) {
      const boost = on ? Math.max(...gains.map(Math.abs), 0) : 0;
      eqPreampRef.current.gain.value = boost > 6 ? 0.85 : 1;
    }
    if (providerRef.current === "youtube" && ytPlayerRef.current?.setVolume) {
      try {
        if (!on) ytPlayerRef.current.setVolume(100);
        else {
          const avg = gains.reduce((a, b) => a + b, 0) / gains.length;
          ytPlayerRef.current.setVolume(Math.max(40, Math.min(100, 100 + avg * 3)));
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    applyEqGains(eqGains, eqOn);
  }, [eqGains, eqOn, applyEqGains]);

  const advanceQueue = useCallback(() => {
    if (loopTrackRef.current) {
      try {
        if (providerRef.current === "youtube" && ytPlayerRef.current) {
          ytPlayerRef.current.seekTo(0);
          ytPlayerRef.current.playVideo();
          setPlaying(true);
          return;
        }
        if (providerRef.current === "soundcloud" && scWidgetRef.current) {
          scWidgetRef.current.seekTo(0);
          scWidgetRef.current.play();
          setPlaying(true);
          return;
        }
        if (providerRef.current === "audio" && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
          setPlaying(true);
          return;
        }
      } catch {}
    }
    const q = queueRef.current;
    const i = queueIndexRef.current;
    if (i < q.length - 1) {
      setQueueIndex(i + 1);
      setPlaying(true);
    } else if (loopPlaylistRef.current && q.length) {
      if (i === 0 && q.length === 1) {
        setPlayNonce((n) => n + 1);
      } else {
        setQueueIndex(0);
      }
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, []);

  const startProgressPoll = useCallback(() => {
    clearProgressTimer();
    progressTimer.current = setInterval(() => {
      try {
        if (providerRef.current === "youtube" && ytPlayerRef.current?.getCurrentTime) {
          setProgress(ytPlayerRef.current.getCurrentTime() || 0);
          setDuration(ytPlayerRef.current.getDuration?.() || 0);
        } else if (providerRef.current === "soundcloud" && scWidgetRef.current?.getPosition) {
          scWidgetRef.current.getPosition((pos: number) => setProgress((pos || 0) / 1000));
          scWidgetRef.current.getDuration((dur: number) => setDuration((dur || 0) / 1000));
        } else if (providerRef.current === "audio" && audioRef.current) {
          setProgress(audioRef.current.currentTime || 0);
          setDuration(audioRef.current.duration || 0);
        }
      } catch {}
    }, progressPollMs());
  }, []);

  const pauseOthers = useCallback((keep: "youtube" | "soundcloud" | "audio") => {
    try {
      if (keep !== "youtube") ytPlayerRef.current?.pauseVideo?.();
    } catch {}
    try {
      if (keep !== "soundcloud") scWidgetRef.current?.pause?.();
    } catch {}
    try {
      if (keep !== "audio" && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
    } catch {}
  }, []);

  useEffect(() => { savePlaylists(playlists); }, [playlists]);
  useEffect(() => { saveLiked(liked); }, [liked]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/music/browse").then((r) => r.json()).catch(() => ({ sections: [] })),
      fetch("/api/music/trending").then((r) => r.json()).catch(() => ({ tracks: [] })),
    ]).then(([browse, trend]) => {
      if (cancelled) return;
      const secs: BrowseSection[] = browse.sections?.length ? browse.sections : INSTANT_SEED;
      setSections(secs);
      setTrending(trend.tracks?.length ? trend.tracks : secs[0]?.tracks || INSTANT_SEED[0].tracks);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const { trackId, share } = parseMusicUrl(initialUrl);
    if (share?.type === "playlist" && Array.isArray(share.tracks)) {
      const imported: Playlist = {
        id: `shared-${Date.now()}`,
        name: share.name || "Shared playlist",
        tracks: share.tracks,
        createdAt: Date.now(),
      };
      setPlaylists((prev) => [imported, ...prev]);
      setActivePlaylistId(imported.id);
      setNav("playlist");
      if (imported.tracks.length) {
        setQueue(imported.tracks);
        setQueueIndex(0);
      }
    } else if (share?.type === "track" && share.track) {
      setQueue([share.track as Track]);
      setQueueIndex(0);
    } else if (trackId) {
      fetch(`/api/music/track/${trackId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.track) {
            setQueue([d.track]);
            setQueueIndex(0);
          }
        })
        .catch(() => {});
    }
  }, [initialUrl]);

  useEffect(() => {
    if (nav !== "search" || !query.trim()) {
      if (!query.trim()) setResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(`/api/music/search?q=${encodeURIComponent(query.trim())}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Search failed");
        setResults(d.tracks || []);
      } catch (e: any) {
        setError(e.message || "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, nav]);

  const loadAndPlay = useCallback(async (track: Track) => {
    const gen = ++loadGenRef.current;
    try {
      const params = new URLSearchParams();
      if (track.title) params.set("t", track.title);
      if (track.artist) params.set("a", track.artist);
      const qs = params.toString();
      const r = await fetch(`/api/music/play/${encodeURIComponent(track.id)}${qs ? `?${qs}` : ""}`);
      const d = await r.json();
      if (gen !== loadGenRef.current) return;
      if (!r.ok) throw new Error(d.error || "Play failed");

      setProgress(0);
      setDuration((track.duration || 0) / 1000);

      const playAudioUrl = async (url: string) => {
        pauseOthers("audio");
        providerRef.current = "audio";
        const audio = audioRef.current;
        if (!audio) throw new Error("Player unavailable");
        ensureEqGraph();
        applyEqGains(eqGainsRef.current, eqOnRef.current);
        if (audioCtxRef.current?.state === "suspended") {
          await audioCtxRef.current.resume().catch(() => {});
        }
        audio.src = url;
        audio.loop = false;
        await audio.play();
        if (gen !== loadGenRef.current) return;
        setPlaying(true);
        startProgressPoll();
      };

      if (d.audioUrl && typeof d.audioUrl === "string") {
        await playAudioUrl(d.audioUrl);
        if (gen !== loadGenRef.current) return;
        setError("");
        return;
      }

      if (d.provider === "youtube" && d.videoId) {
        pauseOthers("youtube");
        providerRef.current = "youtube";
        const YT = await loadYoutubeApi();
        if (gen !== loadGenRef.current) return;

        if (ytPlayerRef.current?.loadVideoById) {
          try {
            ytPlayerRef.current.loadVideoById({ videoId: d.videoId, startSeconds: 0 });
            ytPlayerRef.current.playVideo();
            setPlaying(true);
            startProgressPoll();
            applyEqGains(eqGainsRef.current, eqOnRef.current);
            setError("");
            return;
          } catch {}
        }

        await new Promise<void>((resolve, reject) => {
          if (!ytHostRef.current) return reject(new Error("Player unavailable"));
          ytHostRef.current.innerHTML = "";
          const mount = document.createElement("div");
          ytHostRef.current.appendChild(mount);
          ytPlayerRef.current = new YT.Player(mount, {
            height: "1",
            width: "1",
            videoId: d.videoId,
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              fs: 0,
              modestbranding: 1,
              playsinline: 1,
              rel: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: (ev: any) => {
                try {
                  ev.target.playVideo();
                  setPlaying(true);
                  startProgressPoll();
                  applyEqGains(eqGainsRef.current, eqOnRef.current);
                  resolve();
                } catch (e) {
                  reject(e);
                }
              },
              onStateChange: (ev: any) => {
                const state = ev.data;
                if (state === YT.PlayerState.PLAYING) {
                  setPlaying(true);
                  startProgressPoll();
                } else if (state === YT.PlayerState.PAUSED) {
                  if (document.visibilityState === "visible") setPlaying(false);
                } else if (state === YT.PlayerState.ENDED) {
                  advanceQueue();
                }
              },
              onError: () => {
                advanceQueue();
                reject(new Error("YouTube playback unavailable"));
              },
            },
          });
        });
        if (gen !== loadGenRef.current) return;
        setError("");
        return;
      }

      if (d.provider === "soundcloud" && (d.widgetUrl || d.soundcloudId)) {
        pauseOthers("soundcloud");
        providerRef.current = "soundcloud";
        const SC = await loadSoundCloudApi();
        if (gen !== loadGenRef.current) return;
        if (!scFrameRef.current) throw new Error("Player unavailable");
        const widgetUrl =
          d.widgetUrl ||
          `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://api.soundcloud.com/tracks/${d.soundcloudId}`)}&auto_play=true&hide_related=true&show_comments=false&visual=false`;
        scFrameRef.current.src = widgetUrl;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("SoundCloud timeout")), 12000);
          const widget = SC.Widget(scFrameRef.current);
          scWidgetRef.current = widget;
          widget.bind(SC.Widget.Events.READY, () => {
            clearTimeout(timer);
            try {
              widget.play();
              setPlaying(true);
              startProgressPoll();
              resolve();
            } catch (e) {
              reject(e);
            }
          });
          widget.bind(SC.Widget.Events.PLAY, () => {
            setPlaying(true);
            startProgressPoll();
          });
          widget.bind(SC.Widget.Events.PAUSE, () => {
            if (document.visibilityState === "visible") setPlaying(false);
          });
          widget.bind(SC.Widget.Events.FINISH, () => advanceQueue());
        });
        if (gen !== loadGenRef.current) return;
        setError("");
        return;
      }

      throw new Error("No licensed player available for this track");
    } catch (e: any) {
      if (gen !== loadGenRef.current) return;
      setError(e.message || "Could not play track");
      setPlaying(false);
    }
  }, [pauseOthers, startProgressPoll, advanceQueue, ensureEqGraph, applyEqGains]);

  const playTrack = useCallback((track: Track, list?: Track[]) => {
    const nextQueue = list && list.length ? list : [track];
    const idx = nextQueue.findIndex((t) => t.id === track.id);
    setQueue(nextQueue);
    setQueueIndex(idx >= 0 ? idx : 0);
    setPlayNonce((n) => n + 1);
    setPlaying(true);
  }, []);

  const playNext = useCallback((track: Track) => {
    setQueue((prev) => {
      if (!prev.length) return [track];
      const next = [...prev];
      next.splice(queueIndexRef.current + 1, 0, track);
      return next;
    });
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueue((prev) => {
      if (!prev.length) {
        setQueueIndex(0);
        setPlayNonce((n) => n + 1);
        return [track];
      }
      return [...prev, track];
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    loadAndPlay(current);
  }, [current?.id, queueIndex, playNonce]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => advanceQueue();
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      if (providerRef.current === "audio" && document.visibilityState === "visible") setPlaying(false);
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [advanceQueue]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!playingRef.current) return;
      try {
        if (providerRef.current === "youtube" && ytPlayerRef.current?.playVideo) {
          const st = ytPlayerRef.current.getPlayerState?.();
          if (st === 2 || st === 5 || st === -1) ytPlayerRef.current.playVideo();
        } else if (providerRef.current === "soundcloud" && scWidgetRef.current?.play) {
          scWidgetRef.current.play();
        } else if (providerRef.current === "audio" && audioRef.current?.paused) {
          audioRef.current.play().catch(() => {});
        }
      } catch {}
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => () => {
    clearProgressTimer();
    try { ytPlayerRef.current?.destroy?.(); } catch {}
    try { audioCtxRef.current?.close?.(); } catch {}
  }, []);

  const togglePlay = () => {
    if (!current) return;
    try {
      if (providerRef.current === "youtube" && ytPlayerRef.current) {
        if (playing) ytPlayerRef.current.pauseVideo();
        else ytPlayerRef.current.playVideo();
        return;
      }
      if (providerRef.current === "soundcloud" && scWidgetRef.current) {
        if (playing) scWidgetRef.current.pause();
        else scWidgetRef.current.play();
        return;
      }
      if (providerRef.current === "audio" && audioRef.current) {
        if (playing) audioRef.current.pause();
        else audioRef.current.play().catch(() => {});
      }
    } catch {}
  };

  const seekTo = (seconds: number) => {
    try {
      if (providerRef.current === "youtube" && ytPlayerRef.current?.seekTo) {
        ytPlayerRef.current.seekTo(seconds, true);
        setProgress(seconds);
      } else if (providerRef.current === "soundcloud" && scWidgetRef.current?.seekTo) {
        scWidgetRef.current.seekTo(seconds * 1000);
        setProgress(seconds);
      } else if (providerRef.current === "audio" && audioRef.current) {
        audioRef.current.currentTime = seconds;
        setProgress(seconds);
      }
    } catch {}
  };

  const prev = () => {
    if (progress > 3) {
      seekTo(0);
      return;
    }
    setQueueIndex((i) => Math.max(0, i - 1));
    setPlayNonce((n) => n + 1);
  };

  const next = () => {
    const q = queueRef.current;
    const i = queueIndexRef.current;
    if (i < q.length - 1) {
      setQueueIndex(i + 1);
      setPlayNonce((n) => n + 1);
    } else if (loopPlaylistRef.current && q.length) {
      setQueueIndex(0);
      setPlayNonce((n) => n + 1);
    }
  };

  const setEqPresetGains = (name: string) => {
    const gains = (EQ_PRESETS[name] || EQ_PRESETS.Flat).slice();
    setEqPreset(name);
    setEqGains(gains);
    setEqOn(true);
    ensureEqGraph();
    applyEqGains(gains, true);
  };

  const isLiked = (id: string) => liked.some((t) => t.id === id);

  const toggleLike = (track: Track) => {
    setLiked((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev.filter((t) => t.id !== track.id);
      return [track, ...prev];
    });
  };

  const createPlaylist = () => {
    const name = newPlaylistName.trim() || "New playlist";
    const pl: Playlist = { id: `pl-${Date.now()}`, name, tracks: [], createdAt: Date.now() };
    setPlaylists((prev) => [...prev, pl]);
    setNewPlaylistName("");
    setShowNewPlaylist(false);
    setActivePlaylistId(pl.id);
    setNav("playlist");
    trackAchievementEvent("playlist");
  };

  const addToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p;
        if (p.tracks.some((t) => t.id === track.id)) return p;
        return { ...p, tracks: [...p.tracks, track] };
      })
    );
    setAddMenuTrack(null);
    setMenuTrack(null);
  };

  const removeFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p))
    );
  };

  const deletePlaylist = (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (activePlaylistId === id) {
      setActivePlaylistId(null);
      setNav("browse");
    }
  };

  const shareTrack = async (track: Track) => {
    const internal = `${hrefs.mu()}?t=${track.id}`;
    const url = `${window.location.origin}/?m=${encodeURIComponent(internal)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied");
      } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(""), 2200);
  };

  const sharePlaylist = async (pl: Playlist) => {
    const payload = { type: "playlist", name: pl.name, tracks: pl.tracks };
    const token = encodeShare(payload);
    const internal = `${hrefs.mu()}?share=${token}`;
    const url = `${window.location.origin}/?m=${encodeURIComponent(internal)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(""), 2200);
  };

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const listTracks =
    nav === "search"
      ? results
      : nav === "playlist" && activePlaylist
        ? activePlaylist.tracks
        : nav === "library"
          ? liked
          : trending;

  const mainTitle =
    nav === "search"
      ? "Search"
      : nav === "playlist" && activePlaylist
        ? activePlaylist.name
        : nav === "library"
          ? "Your Library"
          : "Browse";

  return (
    <div
      className="music-page"
      style={{
        position: "absolute", inset: 0, background: S.bg, display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      <div
        ref={ytHostRef}
        aria-hidden
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden", left: -9999, top: 0 }}
      />
      <iframe
        ref={scFrameRef}
        title="SoundCloud player"
        allow="autoplay"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", left: -9999, top: 0, border: 0 }}
      />
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" style={{ display: "none" }} />

      <div className="music-body" style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Sidebar */}
        <motion.aside
          className="music-sidebar"
          initial={{ opacity: 0, x: -18, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease }}
          style={{
            width: 196,
            borderRight: `1px solid ${S.border}`,
            padding: "14px 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            overflowY: "auto",
            flexShrink: 0,
            background: S.glass,
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 10, letterSpacing: "0.14em", filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "-0.03em", filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease }}
            style={{
              fontSize: 22, fontWeight: 750, color: S.text, margin: "2px 4px 12px",
              textShadow: "0 0 28px hsla(205, 80%, 60%, 0.18)",
            }}
          >
            Music
          </motion.h1>

          <SideBtn
            active={nav === "browse"}
            onClick={() => { setNav("browse"); setActivePlaylistId(null); setQuery(""); }}
            icon={<Flame size={13} />}
            label="Browse"
            delay={0.12}
          />
          <SideBtn
            active={nav === "search"}
            onClick={() => { setNav("search"); setActivePlaylistId(null); }}
            icon={<Search size={13} />}
            label="Search"
            delay={0.18}
          />
          <SideBtn
            active={nav === "library"}
            onClick={() => { setNav("library"); setActivePlaylistId(null); setQuery(""); }}
            icon={<Library size={13} />}
            label="Your Library"
            delay={0.24}
          />

          <div className="music-side-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 4px 6px", gap: 6 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: S.textMuted, margin: 0 }}>
              Playlists
            </p>
            <button
              type="button"
              onClick={() => setShowNewPlaylist(true)}
              title="New playlist"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 6px",
                borderRadius: 6,
                border: `1px solid ${S.border}`,
                background: "transparent",
                color: S.textMuted,
                fontSize: 9,
                fontWeight: 550,
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              <Plus size={9} /> New
            </button>
          </div>

          {playlists.length === 0 && (
            <p style={{ fontSize: 10, color: S.textMuted, margin: "0 4px 8px", lineHeight: 1.4 }}>
              Create your first playlist.
            </p>
          )}

          {showNewPlaylist && (
            <div style={{ display: "flex", gap: 4, marginBottom: 8, marginInline: 4 }}>
              <input
                autoFocus
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
                placeholder="Name"
                style={{
                  flex: 1, background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8,
                  color: S.text, fontSize: 11, padding: "7px 9px", outline: "none",
                }}
              />
              <button onClick={createPlaylist} style={{
                background: S.accentDim, border: `1px solid ${S.borderFocus}`, borderRadius: 8,
                color: S.accent, padding: "0 8px", cursor: "pointer", display: "flex", alignItems: "center",
              }}>
                <Check size={12} />
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {playlists.map((pl, i) => (
              <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SideBtn
                    active={nav === "playlist" && activePlaylistId === pl.id}
                    onClick={() => { setNav("playlist"); setActivePlaylistId(pl.id); setQuery(""); }}
                    icon={<ListMusic size={13} />}
                    label={`${pl.name}`}
                    delay={0.36 + i * 0.04}
                  />
                </div>
                <button
                  onClick={() => sharePlaylist(pl)}
                  title="Share playlist"
                  style={{ background: "none", border: "none", color: S.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
                >
                  <Share2 size={11} />
                </button>
                <button
                  onClick={() => deletePlaylist(pl.id)}
                  title="Delete"
                  style={{ background: "none", border: "none", color: S.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

        </motion.aside>

        {/* Main */}
        <div className="music-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <motion.div
            className="music-list-header"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease }}
            style={{
              padding: "12px 16px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: "-0.02em" }}>
              {mainTitle}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {nav === "playlist" && activePlaylist && activePlaylist.tracks.length > 0 && (
                <button
                  onClick={() => {
                    playTrack(activePlaylist.tracks[0], activePlaylist.tracks);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
                    background: S.accent, border: "none", color: "#fff", fontSize: 11, fontWeight: 650, cursor: "pointer",
                  }}
                >
                  <Play size={11} fill="#fff" /> Play all
                </button>
              )}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setEqOpen((v) => !v);
                    ensureEqGraph();
                    if (audioCtxRef.current?.state === "suspended") {
                      audioCtxRef.current.resume().catch(() => {});
                    }
                  }}
                  title="Equaliser"
                  style={{
                    width: 30, height: 30, borderRadius: "50%",
                    border: `1px solid ${eqOpen || eqOn ? EQ_ORANGE : S.border}`,
                    background: eqOpen || eqOn ? EQ_ORANGE_DIM : S.elevated,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: eqOpen || eqOn ? EQ_ORANGE : S.textMuted,
                    cursor: "pointer", padding: 0,
                  }}
                >
                  <SlidersHorizontal size={13} />
                </button>
                <AnimatePresence>
                  {eqOpen && (
                    <EqualiserPopover
                      on={eqOn}
                      gains={eqGains}
                      preset={eqPreset}
                      onToggle={(v) => {
                        setEqOn(v);
                        ensureEqGraph();
                        applyEqGains(eqGains, v);
                      }}
                      onGain={(idx, val) => {
                        setEqGains((prev) => {
                          const next = prev.slice();
                          next[idx] = val;
                          applyEqGains(next, eqOn);
                          return next;
                        });
                        setEqPreset("Custom");
                      }}
                      onPreset={setEqPresetGains}
                      onClose={() => setEqOpen(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {nav === "search" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
              className="music-search"
              style={{
                margin: "0 22px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: S.elevated,
                border: `1px solid ${S.border}`,
                borderRadius: 12,
                padding: "10px 12px",
              }}
            >
              <Search size={14} style={{ color: S.textMuted }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, artists…"
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: S.text, fontSize: 13, fontFamily: "inherit",
                }}
              />
              {query && (
                <button onClick={() => setQuery("")} style={{ background: "none", border: "none", color: S.textMuted, cursor: "pointer", padding: 0, display: "flex" }}>
                  <X size={13} />
                </button>
              )}
            </motion.div>
          )}

          {error && (
            <div style={{ margin: "0 22px 10px", padding: "8px 12px", borderRadius: 8, background: "hsl(0 60% 30% / 0.15)", border: `1px solid hsl(0 50% 40% / 0.3)`, color: S.danger, fontSize: 11 }}>
              {error}
            </div>
          )}

          <div className="music-track-list" style={{ flex: 1, overflowY: "auto", padding: "4px 0 12px", scrollbarWidth: "none" }}>
            {nav === "browse" ? (
              <BrowseView
                sections={sections}
                trending={trending}
                loading={browseLoading}
                currentId={current?.id}
                playing={playing}
                onPlay={(track, list) => playTrack(track, list)}
                onMenu={setMenuTrack}
              />
            ) : (
              <TrackListView
                tracks={listTracks}
                loading={loading}
                emptyLabel={
                  nav === "search"
                    ? query
                      ? "No tracks found"
                      : "Type to search the catalog"
                    : nav === "library"
                      ? "Liked tracks show up here"
                      : "This playlist is empty"
                }
                currentId={current?.id}
                playing={playing}
                isLiked={isLiked}
                onPlay={(track) => playTrack(track, listTracks)}
                onLike={toggleLike}
                onMenu={setMenuTrack}
                onRemove={
                  nav === "playlist" && activePlaylist
                    ? (id) => removeFromPlaylist(activePlaylist.id, id)
                    : undefined
                }
              />
            )}

            {/* Ad sits below all shelves / lists — scroll to reach */}
            <div style={{ padding: "28px 22px 48px", minHeight: 140 }}>
<<<<<<< HEAD
<<<<<<< HEAD
              <AdResponsiveBanner exo={false} />
              <AdNativeBarAlt />
=======
              <AdPageStack />
>>>>>>> e03cf675 (updates updates (games and chat fixes))
=======
              <AdPageStack />
>>>>>>> 00ed85e5 (updates updates (games and chat fixes))
              <p style={{ margin: "10px 0 0", fontSize: 10, color: S.textMuted, lineHeight: 1.4 }}>
                Playback is requested through official SoundCloud and YouTube embed/API surfaces where available.
                Metadata may come from third-party catalog APIs (including iTunes Search). Licensing, geo rules,
                and takedowns for each track are determined by those platforms and their rights holders — not by PeteZah as a label.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Player — only when a track is loaded */}
      <AnimatePresence>
      {current && (
      <motion.div
        className="music-player"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.4, ease }}
        style={{
          borderTop: `1px solid ${S.border}`,
          background: "hsla(220, 35%, 6%, 0.72)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          padding: "10px 14px 12px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: 4, borderRadius: 99, background: S.elevated, marginBottom: 12, cursor: current ? "pointer" : "default",
            position: "relative", overflow: "hidden",
          }}
          onClick={(e) => {
            if (!current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            seekTo(ratio * duration);
          }}
        >
          <div style={{
            height: "100%", width: `${duration ? (progress / duration) * 100 : 0}%`,
            background: S.accent,
            borderRadius: 99, transition: "width 0.1s linear",
          }} />
        </div>

        <div className="music-player-row" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="music-now" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 11, overflow: "hidden", background: S.elevated, flexShrink: 0,
              border: `1px solid ${S.border}`,
            }}>
              {current?.artwork ? (
                <CoverImg src={current.artwork} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                  <Music2 size={16} />
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 650, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {current?.title || "Nothing playing"}
              </p>
              <p style={{ fontSize: 10, color: S.textMuted, margin: "2px 0 0" }}>
                {current?.artist || "—"}
              </p>
            </div>
          </div>

          <div className="music-controls" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={prev} style={ctrlBtn}><SkipBack size={15} /></button>
            <button
              onClick={togglePlay}
              disabled={!current}
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "none", cursor: current ? "pointer" : "default",
                background: S.accent,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                opacity: current ? 1 : 0.4,
              }}
            >
              {playing ? <Pause size={15} fill="#fff" /> : <Play size={15} fill="#fff" style={{ marginLeft: 2 }} />}
            </button>
            <button onClick={next} style={ctrlBtn}><SkipForward size={15} /></button>
          </div>

          <div className="music-extra" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <span className="music-time" style={{ fontSize: 10, color: S.textMuted, fontVariantNumeric: "tabular-nums" }}>
              {formatSec(progress)} / {formatSec(duration)}
            </span>
            <button
              onClick={() => setLoopTrack((v) => !v)}
              title="Loop track"
              style={{ ...ctrlBtn, color: loopTrack ? S.accent : S.textMuted }}
            >
              <Repeat1 size={14} />
            </button>
            <button
              onClick={() => setLoopPlaylist((v) => !v)}
              title="Loop playlist"
              style={{ ...ctrlBtn, color: loopPlaylist ? S.accent : S.textMuted }}
            >
              <Repeat size={14} />
            </button>
            {current && (
              <button onClick={() => shareTrack(current)} style={ctrlBtn} title="Share track">
                <Share2 size={13} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Track action sheet */}
      <AnimatePresence>
        {menuTrack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, background: "hsla(220, 40%, 4%, 0.55)",
              backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 40, padding: 16,
            }}
            onClick={() => setMenuTrack(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.35, ease }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 320,
                background: "hsla(220, 28%, 10%, 0.82)",
                border: `1px solid ${S.border}`,
                borderRadius: 18,
                padding: "16px 8px 10px",
                boxShadow: "0 24px 70px hsla(0,0%,0%,0.5)",
                backdropFilter: "blur(20px)",
              }}
            >
              <div style={{ padding: "0 12px 12px" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: S.text, margin: 0 }}>{menuTrack.title}</p>
                <p style={{ fontSize: 12, color: S.textMuted, margin: "4px 0 0" }}>{menuTrack.artist}</p>
              </div>
              <MenuGroup>
                <MenuItem icon={<Play size={15} />} label="Play now" onClick={() => { playTrack(menuTrack); setMenuTrack(null); }} />
                <MenuItem icon={<ListEnd size={15} />} label="Play next" onClick={() => { playNext(menuTrack); setMenuTrack(null); }} />
                <MenuItem icon={<ListPlus size={15} />} label="Add to queue" onClick={() => { addToQueue(menuTrack); setMenuTrack(null); }} />
              </MenuGroup>
              <MenuDivider />
              <MenuGroup>
                <MenuItem icon={<Plus size={15} />} label="Add to playlist" onClick={() => { setAddMenuTrack(menuTrack); setMenuTrack(null); }} />
                <MenuItem
                  icon={<Heart size={15} fill={isLiked(menuTrack.id) ? "currentColor" : "none"} />}
                  label={isLiked(menuTrack.id) ? "Unlike" : "Like"}
                  onClick={() => { toggleLike(menuTrack); setMenuTrack(null); }}
                />
              </MenuGroup>
              <MenuDivider />
              <MenuGroup>
                <MenuItem icon={<Copy size={15} />} label="Copy link" onClick={() => { shareTrack(menuTrack); setMenuTrack(null); }} />
                {menuTrack.permalink_url && (
                  <MenuItem
                    icon={<Share2 size={15} />}
                    label="Open source"
                    onClick={() => {
                      window.open(menuTrack.permalink_url!, "_blank", "noopener,noreferrer");
                      setMenuTrack(null);
                    }}
                  />
                )}
              </MenuGroup>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addMenuTrack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, background: "hsla(220, 40%, 4%, 0.55)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 45,
            }}
            onClick={() => setAddMenuTrack(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 280, background: S.surface, border: `1px solid ${S.border}`,
                borderRadius: 14, padding: 16, boxShadow: "0 20px 60px hsl(0 0% 0% / 0.45)",
                backdropFilter: "blur(16px)",
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 650, color: S.text, margin: "0 0 4px" }}>Add to playlist</p>
              <p style={{ fontSize: 10, color: S.textMuted, margin: "0 0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {addMenuTrack.title}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => addToPlaylist(pl.id, addMenuTrack)}
                    style={{
                      textAlign: "left", padding: "9px 11px", borderRadius: 8, cursor: "pointer",
                      background: S.elevated, border: `1px solid ${S.border}`, color: S.text, fontSize: 12,
                    }}
                  >
                    {pl.name}
                  </button>
                ))}
                {playlists.length === 0 && (
                  <p style={{ fontSize: 11, color: S.textMuted, textAlign: "center", padding: 12 }}>Create a playlist first</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", bottom: 110, left: "50%", transform: "translateX(-50%)",
              background: S.elevated, border: `1px solid ${S.borderFocus}`, borderRadius: 10,
              padding: "8px 14px", color: S.accent, fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6, zIndex: 50, maxWidth: "80%",
            }}
          >
            <Copy size={12} /> {shareMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrowseView({
  sections,
  trending,
  loading,
  currentId,
  playing,
  onPlay,
  onMenu,
}: {
  sections: BrowseSection[];
  trending: Track[];
  loading: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (track: Track, list: Track[]) => void;
  onMenu: (track: Track) => void;
}) {
  const rows = sections.length
    ? sections
    : trending.length
      ? [{ id: "top", title: "Top Hits", icon: "flame", tracks: trending }]
      : [];

  if (loading && !rows.length) {
    return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 48 }}>Loading shelves…</p>;
  }
  if (!rows.length) {
    return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 48 }}>Nothing to browse yet</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 12 }}>
      {rows.map((row, ri) => (
        <ShelfRow
          key={row.id}
          title={row.title}
          icon={sectionIcon(row.icon)}
          tracks={row.tracks}
          delay={0.18 + ri * 0.08}
          currentId={currentId}
          playing={playing}
          onPlay={onPlay}
          onMenu={onMenu}
        />
      ))}
    </div>
  );
}

function ShelfRow({
  title,
  icon,
  tracks,
  delay,
  currentId,
  playing,
  onPlay,
  onMenu,
}: {
  title: string;
  icon: ReactNode;
  tracks: Track[];
  delay: number;
  currentId?: string;
  playing: boolean;
  onPlay: (track: Track, list: Track[]) => void;
  onMenu: (track: Track) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const visibleTracks = tracks.filter((t) => !hiddenIds.has(t.id));

  const hideTrack = useCallback((id: string) => {
    setHiddenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const scrollBy = (dir: number) => {
    scrollerRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  };

  if (!visibleTracks.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.65, delay, ease }}
      style={{ paddingInline: 18 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: S.text }}>
          <span style={{ color: S.accent, display: "flex" }}>{icon}</span>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{title}</h3>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => scrollBy(-1)} style={chevBtn} aria-label="Scroll left">
            <ChevronLeft size={13} />
          </button>
          <button onClick={() => scrollBy(1)} style={chevBtn} aria-label="Scroll right">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="music-shelf"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        {visibleTracks.map((track, i) => {
          const active = currentId === track.id;
          return (
            <motion.button
              key={track.id}
              type="button"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, delay: delay + 0.05 + i * 0.03, ease }}
              onClick={() => onPlay(track, visibleTracks)}
              className="music-card"
              style={{
                flex: "0 0 128px",
                width: 128,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                color: S.text,
              }}
            >
              <div
                style={{
                  width: 128,
                  height: 128,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: S.elevated,
                  border: `1px solid ${active ? S.borderFocus : S.border}`,
                  position: "relative",
                  boxShadow: active ? `0 0 0 1px ${S.accentDim}` : "none",
                }}
              >
                {track.artwork ? (
                  <CoverImg
                    src={track.artwork}
                    alt=""
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={() => hideTrack(track.id)}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                    <Music2 size={20} />
                  </div>
                )}
                <div
                  className="music-card-overlay"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, hsla(220,40%,4%,0.55), transparent 55%)",
                    opacity: active ? 1 : 0,
                    transition: "opacity 0.2s ease",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    padding: 8,
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", background: S.accent,
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                  }}>
                    {active && playing ? <Pause size={11} fill="#fff" /> : <Play size={11} fill="#fff" style={{ marginLeft: 1 }} />}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); onMenu(track); }}
                    style={{
                      width: 24, height: 24, borderRadius: "50%", background: "hsla(0,0%,0%,0.45)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    }}
                  >
                    <MoreHorizontal size={13} />
                  </span>
                </div>
              </div>
              <p style={{
                margin: "7px 1px 0", fontSize: 11, fontWeight: 650, color: active ? S.accent : S.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {track.title}
              </p>
              <p style={{
                margin: "2px 1px 0", fontSize: 10, color: S.textMuted,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {track.artist}
              </p>
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}

function TrackListView({
  tracks,
  loading,
  emptyLabel,
  currentId,
  playing,
  isLiked,
  onPlay,
  onLike,
  onMenu,
  onRemove,
}: {
  tracks: Track[];
  loading: boolean;
  emptyLabel: string;
  currentId?: string;
  playing: boolean;
  isLiked: (id: string) => boolean;
  onPlay: (track: Track) => void;
  onLike: (track: Track) => void;
  onMenu: (track: Track) => void;
  onRemove?: (id: string) => void;
}) {
  if (loading) return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 40 }}>Searching…</p>;
  if (!tracks.length) return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 40 }}>{emptyLabel}</p>;

  return (
    <div style={{ padding: "0 14px" }}>
      <AnimatePresence>
        {tracks.map((track, i) => {
          const active = currentId === track.id;
          return (
            <motion.div
              key={`${track.id}-${i}`}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.02, 0.35), ease }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 12,
                background: active ? S.accentDim : "transparent",
                border: `1px solid ${active ? S.borderFocus : "transparent"}`,
                cursor: "pointer", marginBottom: 2,
              }}
              onClick={() => onPlay(track)}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLDivElement).style.background = S.elevated;
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10, overflow: "hidden",
                background: S.elevated, flexShrink: 0, position: "relative",
              }}>
                {track.artwork ? (
                  <CoverImg src={track.artwork} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                    <Music2 size={14} />
                  </div>
                )}
                {active && playing && (
                  <div style={{
                    position: "absolute", inset: 0, background: "hsla(220, 35%, 6%, 0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                  }}>
                    <Pause size={12} fill="#fff" />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: active ? S.accent : S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.title}
                </p>
                <p style={{ fontSize: 10, color: S.textMuted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.artist}
                </p>
              </div>
              <span style={{ fontSize: 10, color: S.textMuted, fontVariantNumeric: "tabular-nums" }}>
                {formatTime(track.duration)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onLike(track); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: isLiked(track.id) ? S.accent : S.textMuted, padding: 4, display: "flex" }}
              >
                <Heart size={13} fill={isLiked(track.id) ? "currentColor" : "none"} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMenu(track); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, padding: 4, display: "flex" }}
              >
                <MoreHorizontal size={14} />
              </button>
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(track.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, padding: 4, display: "flex" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function MenuGroup({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{children}</div>;
}

function MenuDivider() {
  return <div style={{ height: 1, background: S.border, margin: "6px 10px" }} />;
}

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "11px 14px",
        borderRadius: 10,
        border: "none",
        background: "transparent",
        color: S.text,
        fontSize: 13,
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = S.elevated; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <span style={{ width: 18, display: "flex", color: S.textSub }}>{icon}</span>
      {label}
    </button>
  );
}

const ctrlBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "hsla(210, 20%, 75%, 0.7)",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const chevBtn: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: `1px solid ${S.border}`,
  background: S.elevated,
  color: S.textSub,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function SideBtn({
  active, onClick, icon, label, delay = 0,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  delay?: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      onClick={onClick}
      className="music-side-btn"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px",
        borderRadius: 999, border: "none",
        background: active ? "hsla(210, 40%, 90%, 0.1)" : "transparent",
        color: active ? S.text : S.textSub, fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer",
        textAlign: "left", overflow: "hidden",
      }}
    >
      <span style={{ flexShrink: 0, display: "flex", color: active ? S.accent : "inherit" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </motion.button>
  );
}

function EqualiserPopover({
  on,
  gains,
  preset,
  onToggle,
  onGain,
  onPreset,
  onClose,
}: {
  on: boolean;
  gains: number[];
  preset: string;
  onToggle: (v: boolean) => void;
  onGain: (idx: number, val: number) => void;
  onPreset: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        zIndex: 40,
        width: 280,
        padding: "14px 14px 12px",
        borderRadius: 18,
        background: "hsla(222, 28%, 10%, 0.96)",
        border: `1px solid ${S.border}`,
        boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
        backdropFilter: "blur(16px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          position: "absolute",
          top: -6,
          right: 12,
          width: 12,
          height: 12,
          background: "hsla(222, 28%, 10%, 0.96)",
          borderLeft: `1px solid ${S.border}`,
          borderTop: `1px solid ${S.border}`,
          transform: "rotate(45deg)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: S.text }}>Equaliser</p>
        <button
          type="button"
          onClick={() => onToggle(!on)}
          aria-label="Toggle equaliser"
          style={{
            width: 38,
            height: 22,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: on ? EQ_ORANGE : "hsla(210, 20%, 30%, 0.7)",
            position: "relative",
            padding: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: on ? 18 : 2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: on ? "#1a120c" : "hsla(210, 20%, 78%, 0.95)",
              transition: "left 0.15s ease",
            }}
          />
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12, opacity: on ? 1 : 0.45, pointerEvents: on ? "auto" : "none" }}>
        {EQ_BANDS.map((band, idx) => (
          <div key={band.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: EQ_ORANGE, fontVariantNumeric: "tabular-nums", minHeight: 14 }}>
              {gains[idx] > 0 ? `+${gains[idx]}` : `${gains[idx]}`}
            </span>
            <div style={{ height: 100, width: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={gains[idx]}
                onChange={(e) => onGain(idx, Number(e.target.value))}
                style={{
                  width: 100,
                  height: 18,
                  transform: "rotate(-90deg)",
                  accentColor: EQ_ORANGE,
                  cursor: "pointer",
                }}
              />
            </div>
            <span style={{ fontSize: 10, color: S.textMuted }}>{band.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {["Flat", "Bass", "Vocal", "Treble"].map((name) => {
          const active = preset === name || (name === "Flat" && preset === "Custom" && gains.every((g) => g === 0));
          return (
            <button
              key={name}
              type="button"
              onClick={() => onPreset(name)}
              style={{
                flex: 1,
                padding: "7px 0",
                borderRadius: 999,
                border: active ? "none" : `1px solid ${S.border}`,
                background: active ? EQ_ORANGE : "transparent",
                color: active ? "#140e0a" : S.text,
                fontSize: 11,
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onClose} style={{ display: "none" }} />
    </motion.div>
  );
}
