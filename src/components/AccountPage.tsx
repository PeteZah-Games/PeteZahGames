import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Settings, LogOut, Eye, EyeOff, Check, AlertCircle, Loader2,
  Zap, ChevronRight, Lock, Mail, KeyRound, Download, Upload, Trash2,
  Megaphone, MessageSquare, Palette, Shield, Sliders, Camera,
  UserCog, Users, Ban, UserMinus, ShieldCheck, ShieldOff, Plus, ExternalLink, Image,
  Music2, MapPin, Link2, Heart, Globe2, Radio, Monitor, BarChart3, Copy, Trophy, Gamepad2, Pencil,
  LayoutDashboard, Cpu, Database, Activity, Power, ShieldAlert, Server, Network, Info, X as XIcon, Keyboard,
  TrendingUp, Bell,
} from "lucide-react";
import { MentionsText } from "@/lib/mentions";
import { BadgeChip, BadgeRow, type BadgeInfo } from "./BadgeChip";
import {
  reconcileSettings,
  pushSettings,
  pullSettings,
  schedulePushSettings,
} from "@/lib/settingsSync";
import { notifyAuthChanged } from "@/hooks/useAuth";
import { consumePendingAuth } from "@/lib/authPending";
import { CoverImg } from "@/lib/mediaCover";
import { defaultBrandSrc, hrefs, marks } from "@/lib/uiMarks";
import ObfuscatedText from "./ObfuscatedText";
import { applyVpnRegion } from "@/lib/vpn";
import { themeById, applyBrowserIdentity } from "@/lib/siteThemes";
import { AppearanceSettings, BehaviorSettings, ProxySettings, ShortcutsSettings } from "./SettingsPanels";
import { AdReportsPanel } from "./AdReportsPanel";
import { createPortal } from "react-dom";

interface AuthUser {
  id: string; email: string; username?: string; bio?: string;
  display_name?: string; status?: string; location?: string; website?: string;
  profile_color?: string; banner_url?: string | null;
  favorite_music?: FavTrack[]; profile_public?: boolean; show_activity?: boolean;
  avatar_url?: string; is_admin?: number; is_owner?: boolean; created_at?: number;
  email_verified?: boolean | number; totp_enabled?: boolean | number;
  must_setup_2fa?: boolean;
}
interface FavTrack {
  id: string; title: string; artist: string; artwork: string | null;
  duration?: number; permalink_url?: string | null;
}
interface AdminUser {
  id: string; username?: string; is_admin?: number;
  email_verified?: number; banned?: number; created_at?: number; is_owner?: boolean;
}
interface StaffMember extends AdminUser {
}
interface AdminUserDetail extends AdminUser {
  avatar_url?: string; bio?: string;
  achievements?: BadgeInfo[];
}

const SITE_PRESETS = [
  { id: "classroom", label: "Google Classroom", favicon: "https://ssl.gstatic.com/classroom/favicon.ico" },
  { id: "schoology",  label: "Schoology",        favicon: "https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico" },
  { id: "google",    label: "Google",            favicon: "https://www.google.com/favicon.ico" },
  { id: "petezah",   label: "PeteZah",           favicon: "/logo.png" },
];

type Section = "profile" | "proxy" | "get-links" | "achievements" | "appearance" | "cloaking" | "behavior" | "shortcuts" | "data" | "mentions" | "admin" | "users" | "live" | "firefox-vm" | "game-stats" | "link-stats" | "ad-reports" | "monitoring" | "updates" | "ai-prompts";

function applySettingsNow(s: Record<string, string>) {
  if (s.theme) {
    document.body.className = document.body.className.replace(/theme-[\w-]+/g, "").trim();
    document.body.classList.add(`theme-${s.theme}`);
    const tc = themeById(s.theme);
    if (!s.backgroundColor && !s.backgroundImage) {
      document.body.style.color = tc.text;
    }
  }
  const bgImg = s.backgroundImage ?? localStorage.getItem("backgroundImage");
  const bgColor = s.backgroundColor ?? localStorage.getItem("backgroundColor");
  if (bgImg) {
    document.body.style.backgroundImage = `url(${bgImg})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundColor = "";
  } else {
    document.body.style.backgroundImage = "none";
    if (bgColor) document.body.style.backgroundColor = bgColor;
  }
  if (s.siteTitle) document.title = s.siteTitle;
  if (s.siteLogo) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = s.siteLogo;
  }
  const prevRC = (window as any).__rightClickHandler;
  if (prevRC) document.removeEventListener("contextmenu", prevRC);
  if (s.disableRightClick === "true") {
    const h = (e: MouseEvent) => e.preventDefault();
    (window as any).__rightClickHandler = h;
    document.addEventListener("contextmenu", h);
  }
  const prevUL = (window as any).__beforeUnloadHandler;
  if (prevUL) window.removeEventListener("beforeunload", prevUL);
  if (s.beforeUnload === "true") {
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    (window as any).__beforeUnloadHandler = h;
    window.addEventListener("beforeunload", h);
  }
  const prevPanic = (window as any).__panicKeyHandler;
  if (prevPanic) window.removeEventListener("keydown", prevPanic);
  if (s.panicKey && s.panicUrl) {
    const h = (e: KeyboardEvent) => { if (e.key === s.panicKey) window.location.href = s.panicUrl; };
    (window as any).__panicKeyHandler = h;
    window.addEventListener("keydown", h);
  }
  if (s.theme && !s.backgroundColor && !s.backgroundImage) {
    const tc = themeById(s.theme);
    localStorage.setItem("backgroundColor", tc.bg);
    document.body.style.backgroundColor = tc.bg;
      document.body.style.backgroundImage = "none";
    document.body.style.color = tc.text;
  }
  if (!s.backgroundImage) {
    localStorage.removeItem("backgroundImage");
  } else {
    localStorage.setItem("backgroundImage", s.backgroundImage);
  }
  Object.entries(s).forEach(([k, v]) => {
    if (k === "backgroundImage") return;
    if (v === "" || v === undefined || v === null) {
      if (k === "backgroundColor") return;
      localStorage.removeItem(k);
      return;
    }
    localStorage.setItem(k, v);
  });
  if (s.bgNetwork !== undefined) {
    localStorage.setItem("bgNetwork", s.bgNetwork === "true" ? "true" : "false");
  }
  applyBrowserIdentity();
  try {
    const t = themeById(s.theme || localStorage.getItem("theme"));
    document.documentElement.style.setProperty("--pz-accent", t.accent);
    document.documentElement.style.setProperty("--pz-theme-bg", t.bg);
    document.documentElement.style.setProperty("--pz-theme-text", t.text);
  } catch {}
  localStorage.setItem("settingsUpdated", Date.now().toString());
  window.dispatchEvent(new CustomEvent("petezah-settings-updated"));
  schedulePushSettings(900);
}

function FluidCanvas({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : canvas.offsetWidth;
      const h = parent ? parent.clientHeight : canvas.offsetHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random() * (canvas.offsetWidth || 800),
      y: Math.random() * (canvas.offsetHeight || 600),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 140 + Math.random() * 200,
      hue: 200 + i * 10,
      saturation: 60 + Math.random() * 25,
      lightness: 40 + Math.random() * 15,
      opacity: 0.15 + Math.random() * 0.12,
    }));

    let time = 0;
    const animate = () => {
      time += 0.003;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      blobs.forEach((b) => {
        b.x += b.vx + Math.sin(time + b.hue) * 0.15;
        b.y += b.vy + Math.cos(time * 0.7 + b.hue) * 0.15;

        if (enabled) {
          const dx = mouseRef.current.x - b.x;
          const dy = mouseRef.current.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 300) {
            b.x += dx * 0.003;
            b.y += dy * 0.003;
          }
        }

        if (b.x < -b.radius) b.x = w + b.radius;
        if (b.x > w + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = h + b.radius;
        if (b.y > h + b.radius) b.y = -b.radius;

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 2.2})`);
        grad.addColorStop(0.4, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 1.1})`);
        grad.addColorStop(1, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      for (let i = 0; i < 3; i++) {
        const wx = w * (0.2 + i * 0.3) + Math.sin(time * 0.5 + i) * 60;
        const wy = h * (0.3 + i * 0.2) + Math.cos(time * 0.4 + i * 2) * 40;
        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 120);
        wg.addColorStop(0, "hsla(210, 70%, 90%, 0.07)");
        wg.addColorStop(1, "hsla(210, 60%, 90%, 0)");
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, w, h);
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("mousemove", handleMouse);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouse);
      cancelAnimationFrame(animRef.current);
    };
  }, [enabled]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

const C = {
  bg:       "transparent",
  surface:  "hsla(220, 28%, 11%, 0.72)",
  elevated: "hsla(220, 24%, 15%, 0.78)",
  border:   "hsla(210, 30%, 80%, 0.16)",
  borderFocus: "hsla(210, 40%, 70%, 0.34)",
  accent:   "hsla(0, 0%, 96%, 0.92)",
  accentDim:"hsla(210, 40%, 55%, 0.2)",
  text:     "hsla(210, 20%, 97%, 0.96)",
  textSub:  "hsla(210, 14%, 78%, 0.88)",
  textMuted:"hsla(210, 12%, 68%, 0.72)",
  danger:   "hsl(0 60% 58%)",
  success:  "hsl(145 45% 52%)",
};

function Field({ label, type = "text", value, onChange, placeholder, icon: Icon, maxLength, readOnly }: any) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>{label}</label>}
      <div style={{
        position: "relative", display: "flex", alignItems: "center",
        background: "hsla(220, 28%, 11%, 0.68)",
        border: `1px solid ${focused ? C.borderFocus : C.border}`,
        borderRadius: "999px", transition: "border-color 0.15s",
        backdropFilter: "blur(12px)",
      }}>
        {Icon && <Icon size={12} style={{ position: "absolute", left: "12px", color: C.textMuted, flexShrink: 0 }} />}
        <input
          type={isPass && show ? "text" : type}
          value={value} onChange={onChange} placeholder={placeholder}
          maxLength={maxLength} readOnly={readOnly}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: "100%", background: "transparent", outline: "none",
            color: C.text, fontSize: "13px",
            padding: `9px ${isPass ? "36px" : "12px"} 9px ${Icon ? "34px" : "12px"}`,
            fontFamily: "inherit",
          }}
        />
        {isPass && (
          <button type="button" onClick={() => setShow(!show)} style={{ position: "absolute", right: "12px", color: C.textMuted, background: "none", border: "none", cursor: "pointer" }}>
            {show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", gap: "16px" }}>
      <div>
        <p style={{ fontSize: "13px", color: C.text, margin: 0, fontWeight: 400 }}>{label}</p>
        {desc && <p style={{ fontSize: "11px", color: C.textMuted, margin: "2px 0 0" }}>{desc}</p>}
      </div>
      <button onClick={onChange} style={{
        width: "34px", height: "18px", borderRadius: "9px", position: "relative", flexShrink: 0,
        background: checked ? C.accentDim : C.elevated,
        border: `1px solid ${checked ? C.borderFocus : C.border}`,
        cursor: "pointer", transition: "background 0.2s, border-color 0.2s",
      }}>
        <span style={{
          position: "absolute", top: "2px", width: "12px", height: "12px", borderRadius: "50%",
          background: checked ? C.accent : C.textMuted,
          left: checked ? "calc(100% - 15px)" : "2px", transition: "left 0.2s, background 0.2s",
        }} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ height: "1px", background: C.border, margin: "2px 0" }} />;
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "hsla(220, 28%, 11%, 0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "0 16px", backdropFilter: "blur(14px)" }}>
      {children}
    </div>
  );
}

function ApplyBtn({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "7px", padding: "8px 16px", borderRadius: "999px", marginTop: "18px",
      background: saved ? "transparent" : "hsla(210, 40%, 70%, 0.12)",
      border: `1px solid ${saved ? C.success : C.borderFocus}`,
      color: saved ? C.success : C.text,
      fontSize: "12px", fontWeight: 560, cursor: "pointer", transition: "all 0.2s",
      fontFamily: "inherit", letterSpacing: "-0.01em",
    }}>
      {saved ? <Check size={13} /> : <Zap size={13} />}
      {saved ? "Applied!" : "Apply Settings"}
    </button>
  );
}

const NAV: { id: Section; label: string; icon: any; adminOnly?: boolean }[] = [
  { id: "profile",    label: "Profile",     icon: User },
  { id: hrefs.modeP() as Section, label: marks.b(), icon: Network },
  { id: "get-links",  label: "Get Links",   icon: Link2 },
  { id: "achievements", label: "Achievements", icon: Trophy },
  { id: "appearance", label: "Appearance",  icon: Palette },
  { id: "cloaking",   label: marks.cloak(),    icon: Shield },
  { id: "behavior",   label: "Behavior",    icon: Sliders },
  { id: "shortcuts",  label: "Shortcuts",   icon: Keyboard },
  { id: "data",       label: "Data",        icon: Download },
  { id: "mentions",   label: "Mentions",    icon: Bell },
  { id: "admin",      label: "Admin",       icon: LayoutDashboard, adminOnly: true },
  { id: "users",      label: "Users",       icon: UserCog, adminOnly: true },
  { id: "live",       label: "Live Sites",  icon: Radio, adminOnly: true },
  { id: "firefox-vm", label: "Firefox VM",  icon: Monitor, adminOnly: true },
  { id: hrefs.gsSec() as Section, label: marks.c(),  icon: Gamepad2, adminOnly: true },
  { id: "link-stats", label: "Link Stats",  icon: BarChart3, adminOnly: true },
  { id: "ai-prompts", label: "AI Prompts", icon: MessageSquare, adminOnly: true },
  { id: "ad-reports", label: "Ad reports", icon: TrendingUp, adminOnly: true },
  { id: "monitoring", label: "Monitoring", icon: Activity, adminOnly: true },
  { id: "updates",    label: "Updates", icon: Megaphone, adminOnly: true },
];

export default function AccountPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("profile");

  const [authMode, setAuthMode]   = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(() => {
    try {
      if (localStorage.getItem("pz-remember-email") === "1") {
        return localStorage.getItem("pz-remembered-email") || "";
      }
    } catch {}
    return "";
  });
  const [signupUsername, setSignupUsername] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try { return localStorage.getItem("pz-remember-email") === "1"; } catch { return false; }
  });
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [password, setPassword]   = useState("");
  const [authErr, setAuthErr]     = useState("");
  const [authOk, setAuthOk]       = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [login2fa, setLogin2fa] = useState<{ email?: string } | null>(null);
  const [login2faCode, setLogin2faCode] = useState("");
  const [force2faSetup, setForce2faSetup] = useState(false);
  const [force2faQr, setForce2faQr] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [force2faCode, setForce2faCode] = useState("");
  const [force2faBusy, setForce2faBusy] = useState(false);

  const [username, setUsername]   = useState("");
  const [bio, setBio]             = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [profileColor, setProfileColor] = useState("#4d8dff");
  const [profilePublic, setProfilePublic] = useState(true);
  const [favoriteMusic, setFavoriteMusic] = useState<FavTrack[]>([]);
  const [showcaseBadges, setShowcaseBadges] = useState<string[] | null>(null);
  const [unlockedForShowcase, setUnlockedForShowcase] = useState<BadgeInfo[]>([]);
  const [likedPool, setLikedPool] = useState<FavTrack[]>([]);
  const [profSaving, setProfSaving] = useState(false);
  const [profMsg, setProfMsg]     = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");

  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bgImgRef = useRef<HTMLInputElement>(null);

  function openAboutBlank() {
    const mode = localStorage.getItem("linkCloaking") === "about:blank" ? "about:blank" : "blob:";
    const title = localStorage.getItem("siteTitle") || "Home - Classroom";
    let icon = localStorage.getItem("siteLogo") || defaultBrandSrc();
    if (icon.startsWith("/")) icon = window.location.origin + icon;
    const appUrl = window.location.origin + "/";
    const html = `<!doctype html><html><head><title>${title.replace(/</g, "")}</title><link rel="icon" href="${icon}"></head><body style="margin:0;overflow:hidden"><iframe style="height:100%;width:100%;border:0;position:fixed;inset:0" src="${appUrl}" allow="fullscreen; clipboard-read; clipboard-write; display-capture"></iframe></body></html>`;
    let w: Window | null = null;
    if (mode === "blob:") {
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      w = window.open(blobUrl, "_blank");
      if (w && !w.closed) w.addEventListener("load", () => URL.revokeObjectURL(blobUrl), { once: true });
      else URL.revokeObjectURL(blobUrl);
    } else {
      w = window.open("about:blank", "_blank");
      if (w && !w.closed) {
        try {
          w.document.open();
          w.document.write(html);
          w.document.close();
        } catch {
          w.document.title = title;
          const link = w.document.createElement("link");
          link.rel = "icon";
          link.href = icon;
          w.document.head.appendChild(link);
          const iframe = w.document.createElement("iframe");
          iframe.src = appUrl;
          iframe.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write; display-capture");
          iframe.style.cssText = "width:100vw;height:100vh;border:none;";
          w.document.body.style.margin = "0";
          w.document.body.style.overflow = "hidden";
          w.document.body.appendChild(iframe);
        }
      }
    }
    if (!w || w.closed) {
      alert("Please allow popups for cloaking to work.");
      return;
    }
    window.location.href = localStorage.getItem("panicUrl") || "https://classroom.google.com";
  }

  const [s, setS] = useState<Record<string, string>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminSearchActive, setAdminSearchActive] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revealMap, setRevealMap] = useState<Record<string, string>>({});
  const [revealBusy, setRevealBusy] = useState("");
  const [revealTrunc, setRevealTrunc] = useState(false);
  const [adminTab, setAdminTab] = useState<"users" | "staff" | "rarity">("users");
  const [rarityBoard, setRarityBoard] = useState<{
    rank: number;
    userId: string;
    username?: string;
    email?: string;
    avatar_url?: string | null;
    score: number;
    badgeCount: number;
    topRarity: string;
    badges: { id: string; name: string; rarity: string; color?: string; icon?: string }[];
  }[]>([]);
  const [rarityLoading, setRarityLoading] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewErr, setOverviewErr] = useState("");
  const [secBusy, setSecBusy] = useState(false);
  const [secErr, setSecErr] = useState("");
  const [secModal, setSecModal] = useState<null | { action: "attack-on" | "attack-off" | "kill-on" | "kill-off" }>(null);
  const [secPassword, setSecPassword] = useState("");
  const [liveSites, setLiveSites] = useState<{ url: string; username?: string | null; viewers?: number; updatedAt: number }[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveClients, setLiveClients] = useState(0);
  const [liveUnique, setLiveUnique] = useState(0);
  const [ffLive, setFfLive] = useState<{ sessionId: string; userId: string; username?: string | null; startedAt: number; lastSeen: number }[]>([]);
  const [ffLiveCount, setFfLiveCount] = useState(0);
  const [ffDay, setFfDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [ffQuery, setFfQuery] = useState("");
  const [ffHistory, setFfHistory] = useState<{ sessionId: string; userId: string; username?: string | null; startedAt: number; lastSeen: number; endedAt?: number | null; active?: boolean }[]>([]);
  const [ffHistoryTotal, setFfHistoryTotal] = useState(0);
  const [ffHistoryLoading, setFfHistoryLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; content: string; active: number; important?: number; created_at: number; target_user_id?: string | null; target_username?: string | null; target_ips?: string[] }[]>([]);
  const [aiPrompts, setAiPrompts] = useState<{ id: string; preview: string; createdAt: number }[]>([]);
  const [mentions, setMentions] = useState<{ id: string; kind: string; refType: string; refId: string; body: string; createdAt: number; read: boolean; actorUsername: string | null }[]>([]);
  const [mentionsUnread, setMentionsUnread] = useState(0);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [routeMetrics, setRouteMetrics] = useState<{
    routes: { route: string; count: number; totalMs: number; avgMs: number }[];
    cpuPercent?: number;
    memory?: { heapUsedMb: number; rssMb: number };
    uptimeSec?: number;
    sampled?: number;
  } | null>(null);
  const [routeMetricsLoading, setRouteMetricsLoading] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [annTarget, setAnnTarget] = useState("");
  const [annIps, setAnnIps] = useState("");
  const [annImportant, setAnnImportant] = useState(false);
  const [annBusy, setAnnBusy] = useState(false);
  const [annMsg, setAnnMsg] = useState("");
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeInfo[]>([]);
  const [badgeManageOpen, setBadgeManageOpen] = useState(false);
  const [badgeBusy, setBadgeBusy] = useState(false);

  const [linksStatus, setLinksStatus] = useState<{
    emailVerified: boolean;
    totpEnabled: boolean;
    weeklyLimit: number;
    remaining: number;
    weekEndsAt: number;
    claims: { id: string; blocker: string; link: string; claimedAt: number }[];
    blockers: string[];
    availableBlockers: string[];
  } | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksErr, setLinksErr] = useState("");
  const [linksMsg, setLinksMsg] = useState("");
  const [selectedBlocker, setSelectedBlocker] = useState("securly");
  const [claimCode, setClaimCode] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [linkStats, setLinkStats] = useState<any>(null);
  const [linkStatsLoading, setLinkStatsLoading] = useState(false);
  const [achievementsData, setAchievementsData] = useState<{
    achievements: BadgeInfo[];
    unlockedCount: number;
    total: number;
    stats?: { timeMs: number; gamesPlayed: number; uniqueGames: number; vmSessions: number };
  } | null>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [gameStats, setGameStats] = useState<any>(null);
  const [gameStatsLoading, setGameStatsLoading] = useState(false);
  const [gameSearch, setGameSearch] = useState("");
  const [gameSearchDebounced, setGameSearchDebounced] = useState("");
  const [gameLive, setGameLive] = useState<any>(null);
  const [excludedGames, setExcludedGames] = useState<any[]>([]);
  const [excludedLoading, setExcludedLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  function hydrateProfile(u: AuthUser) {
    setUsername(u.username || "");
    setBio(u.bio || "");
    setDisplayName(u.display_name || "");
    setStatus(u.status || "");
    setLocation(u.location || "");
    setWebsite(u.website || "");
    setProfileColor(u.profile_color || "#4d8dff");
    setProfilePublic(u.profile_public !== false);
    setFavoriteMusic(u.favorite_music || []);
    setShowcaseBadges(Array.isArray((u as any).showcase_badges) ? (u as any).showcase_badges : null);
    setIsOwner(!!u.is_owner);
    try {
      const liked = JSON.parse(localStorage.getItem("petezah-music-liked") || "[]");
      if (Array.isArray(liked)) setLikedPool(liked);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401 && d.code === "REQUIRES_2FA") {
          setLogin2fa({ email: d.email });
          setUser(null);
          return;
        }
        if (d.user) {
          setUser(d.user);
          hydrateProfile(d.user);
          if (d.user.must_setup_2fa) setForce2faSetup(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!force2faSetup || force2faQr || !user?.must_setup_2fa) return;
    let cancelled = false;
    (async () => {
      setForce2faBusy(true);
      try {
        const r = await fetch("/api/auth/2fa/setup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({}),
        });
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && d.qrDataUrl) {
          setForce2faQr({ secret: d.secret, qrDataUrl: d.qrDataUrl });
        } else {
          setAuthErr(d.error || "Could not start 2FA setup");
        }
      } catch {
        if (!cancelled) setAuthErr("Network error starting 2FA setup");
      } finally {
        if (!cancelled) setForce2faBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [force2faSetup, force2faQr, user?.must_setup_2fa]);

  async function rotateForce2faQr() {
    setAuthErr("");
    setAuthOk("");
    setForce2faBusy(true);
    setForce2faCode("");
    try {
      const r = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ rotate: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.qrDataUrl) {
        setAuthErr(d.error || "Could not regenerate QR");
        return;
      }
      setForce2faQr({ secret: d.secret, qrDataUrl: d.qrDataUrl });
      setAuthOk("New QR ready — rescan with your authenticator app.");
    } catch {
      setAuthErr("Network error regenerating QR");
    } finally {
      setForce2faBusy(false);
    }
  }

  useEffect(() => {
    try {
      const wanted = sessionStorage.getItem("pz-account-section");
      if (wanted === "get-links" || wanted === "profile" || wanted === "appearance") {
        sessionStorage.removeItem("pz-account-section");
        setSection(wanted as Section);
      }
    } catch {}
  }, []);

  const loadLocalSettings = useCallback(() => {
    const keys = [
      "theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","autocloak","focusCloaking","linkCloaking",
      "backgroundColor","backgroundImage","bgNetwork","debugHud","searchEdgeGlow","horizontalTabs","trendingHomescreen",hrefs.gf(),"quickRelaunch",hrefs.rp(),"lowPowerBg","rainBackdrop","rainScene","rainOnHomepage","bgEffect",
      "searchEngine","browserIdentity","uaPreset","customUserAgent","proxServer","extensionsEnabled","stripTrackers","preferHttps",
    ];
    const loaded: Record<string,string> = {};
    keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) loaded[k] = v; });
    if (!loaded.theme) loaded.theme = "default";
    if (!loaded.backgroundColor) loaded.backgroundColor = themeById(loaded.theme).bg;
    if (loaded.bgNetwork === undefined) loaded.bgNetwork = "false";
    if (!loaded.searchEngine) loaded.searchEngine = "ddg";
    if (!loaded.browserIdentity) loaded.browserIdentity = "mirror";
    if (!loaded.uaPreset) loaded.uaPreset = "auto";
    if (!loaded.extensionsEnabled) loaded.extensionsEnabled = "true";
    if (loaded.searchEdgeGlow === undefined) loaded.searchEdgeGlow = "true";
    if (loaded.focusCloaking === undefined) loaded.focusCloaking = "false";
    setS(loaded);
  }, []);

  useEffect(() => {
    loadLocalSettings();
  }, [loadLocalSettings]);

  useEffect(() => {
    if (!user) return;
    const onUpdated = () => loadLocalSettings();
    window.addEventListener("petezah-settings-updated", onUpdated);
    return () => window.removeEventListener("petezah-settings-updated", onUpdated);
  }, [user, loadLocalSettings]);

  const loadAdminUsers = useCallback((p: number, search?: string) => {
    setAdminLoading(true);
    const q = search?.trim();
    const url = q
      ? `/api/admin/users?search=${encodeURIComponent(q)}`
      : `/api/admin/users?page=${p}`;
    return fetch(url, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setAdminUsers(d.users || []);
        setAdminSearchActive(!!d.search);
        if (!d.search) {
          setAdminPage(d.page || p);
          setAdminTotalPages(d.totalPages || 1);
          setAdminTotal(d.total || 0);
        }
      })
      .finally(() => setAdminLoading(false));
  }, []);

  const loadStaff = useCallback(() => {
    setStaffLoading(true);
    return fetch("/api/admin/staff", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setStaffList(d.staff || []);
        setIsOwner(!!d.is_owner);
      })
      .finally(() => setStaffLoading(false));
  }, []);

  const loadRarityBoard = useCallback(() => {
    setRarityLoading(true);
    return fetch("/api/admin/badge-rarity?limit=50", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setRarityBoard(d.leaderboard || []);
      })
      .finally(() => setRarityLoading(false));
  }, []);

  useEffect(() => {
    if (section === "users" && user && (user.is_admin ?? 0) >= 1) {
      loadAdminUsers(1);
      loadStaff();
    }
  }, [section, user, loadAdminUsers, loadStaff]);

  useEffect(() => {
    if (section === "users" && adminTab === "rarity" && user && (user.is_admin ?? 0) >= 1) {
      loadRarityBoard();
    }
  }, [section, adminTab, user, loadRarityBoard]);

  useEffect(() => {
    if (section !== "admin" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    let timer: number | undefined;

    const load = (initial = false) => {
      if (document.hidden) return;
      if (initial) setOverviewLoading(true);
      fetch("/api/admin/overview", { credentials: "include" })
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (cancelled) return;
          if (!ok) {
            setOverviewErr(d.error || "Failed to load overview");
            return;
          }
          setOverviewErr("");
          setOverview(d);
          if (typeof d.isOwner === "boolean") setIsOwner(d.isOwner);
        })
        .catch(() => {
          if (!cancelled) setOverviewErr("Network error");
        })
        .finally(() => {
          if (!cancelled && initial) setOverviewLoading(false);
        });
    };

    load(true);
    timer = window.setInterval(() => load(false), 15000);
    const onVis = () => {
      if (!document.hidden) load(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [section, user]);

  useEffect(() => {
    if (section !== "live" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      setLiveLoading(true);
      fetch("/api/admin/live-sites", { credentials: "include" })
        .then((r) => r.json())
        .then((sites) => {
          if (cancelled) return;
          setLiveSites(sites.sites || []);
          setLiveClients(sites.clients || 0);
          setLiveUnique(sites.unique || 0);
        })
        .finally(() => {
          if (!cancelled) setLiveLoading(false);
        });
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [section, user]);

  const loadFfHistory = useCallback(() => {
    if (!(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    setFfHistoryLoading(true);
    const params = new URLSearchParams({ day: ffDay, limit: "100" });
    if (ffQuery.trim()) params.set("q", ffQuery.trim());
    fetch(`/api/admin/firefox-vm/history?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setFfHistory(d.sessions || []);
        setFfHistoryTotal(d.total || 0);
      })
      .catch(() => {
        setFfHistory([]);
        setFfHistoryTotal(0);
      })
      .finally(() => setFfHistoryLoading(false));
  }, [user, ffDay, ffQuery]);

  useEffect(() => {
    if (section !== "firefox-vm" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      fetch("/api/admin/firefox-vm/live", { credentials: "include" })
        .then((r) => r.json())
        .then((ff) => {
          if (cancelled) return;
          setFfLive(ff.sessions || []);
          setFfLiveCount(ff.active || 0);
        })
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [section, user]);

  useEffect(() => {
    if (section !== "firefox-vm" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    loadFfHistory();
  }, [section, user, loadFfHistory]);

  const loadLinksStatus = useCallback(() => {
    if (!user) return;
    setLinksLoading(true);
    setLinksErr("");
    fetch("/api/links/status", { credentials: "include" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setLinksErr(d.error || "Failed to load");
          return;
        }
        setLinksStatus(d);
        setSelectedBlocker((prev) => {
          if (d.availableBlockers?.length && !d.availableBlockers.includes(prev)) {
            return d.availableBlockers[0];
          }
          return prev;
        });
      })
      .catch(() => setLinksErr("Network error"))
      .finally(() => setLinksLoading(false));
  }, [user]);

  useEffect(() => {
    if (section === "get-links" && user) loadLinksStatus();
  }, [section, user, loadLinksStatus]);

  useEffect(() => {
    if (section !== "link-stats" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      setLinkStatsLoading(true);
      fetch("/api/admin/link-stats", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setLinkStats(d);
        })
        .catch(() => {
          if (!cancelled) setLinkStats(null);
        })
        .finally(() => {
          if (!cancelled) setLinkStatsLoading(false);
        });
    };
    load();
    const t = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [section, user]);

  useEffect(() => {
    if (section !== "achievements" || !user) return;
    let cancelled = false;
    setAchievementsLoading(true);
    fetch("/api/achievements", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setAchievementsData(d);
          const unlocked = (d.achievements || []).filter((a: BadgeInfo) => a.unlocked);
          setUnlockedForShowcase(unlocked);
        }
      })
      .catch(() => {
        if (!cancelled) setAchievementsData(null);
      })
      .finally(() => {
        if (!cancelled) setAchievementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, user]);

  useEffect(() => {
    if (section !== "profile" || !user) return;
    if (unlockedForShowcase.length) return;
    let cancelled = false;
    fetch("/api/achievements", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const unlocked = (d.achievements || []).filter((a: BadgeInfo) => a.unlocked);
        setUnlockedForShowcase(unlocked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [section, user, unlockedForShowcase.length]);

  useEffect(() => {
    const t = window.setTimeout(() => setGameSearchDebounced(gameSearch), 250);
    return () => window.clearTimeout(t);
  }, [gameSearch]);

  useEffect(() => {
    if (section !== hrefs.gsSec() || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      setGameStatsLoading(true);
      const q = gameSearchDebounced.trim();
      const url = q
        ? `${hrefs.admSt()}?q=${encodeURIComponent(q)}`
        : hrefs.admSt();
      Promise.all([
        fetch(url, { credentials: "include" }).then((r) => r.json()),
        fetch(hrefs.admLv(), { credentials: "include" }).then((r) => r.json()),
        fetch(hrefs.admExd(), { credentials: "include" }).then((r) => r.json()),
      ])
        .then(([stats, live, excl]) => {
          if (cancelled) return;
          setGameStats(stats);
          setGameLive(live);
          setExcludedGames(Array.isArray(excl?.excluded) ? excl.excluded : []);
        })
        .catch(() => {
          if (!cancelled) {
            setGameStats(null);
            setGameLive(null);
          }
        })
        .finally(() => {
          if (!cancelled) setGameStatsLoading(false);
        });
    };
    load();
    const t = window.setInterval(load, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [section, user, gameSearchDebounced]);

  async function unsuspendGame(gameId: string) {
    setExcludedLoading(true);
    try {
      const r = await fetch(`${hrefs.admEx()}/${encodeURIComponent(gameId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("fail");
      setExcludedGames((prev) => prev.filter((g) => g.gameId !== gameId));
    } catch {
      alert("Could not restore.");
    } finally {
      setExcludedLoading(false);
    }
  }

  useEffect(() => {
    if (section !== "updates" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    fetch("/api/admin/announcements", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .catch(() => {});
  }, [section, user]);

  useEffect(() => {
    if (section !== "monitoring" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    let cancelled = false;
    const load = () => {
      setRouteMetricsLoading(true);
      fetch("/api/admin/route-metrics", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d?.ok !== false) setRouteMetrics(d);
        })
        .catch(() => {
          if (!cancelled) setRouteMetrics(null);
        })
        .finally(() => {
          if (!cancelled) setRouteMetricsLoading(false);
        });
    };
    load();
    const iv = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [section, user]);

  useEffect(() => {
    if (section !== "ai-prompts" || !(user && ((user.is_admin ?? 0) >= 1 || user.is_owner))) return;
    fetch("/api/admin/ai-prompts?limit=60", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setAiPrompts(d.prompts || []))
      .catch(() => setAiPrompts([]));
  }, [section, user]);

  useEffect(() => {
    if (section !== "mentions" || !user) return;
    let gone = false;
    setMentionsLoading(true);
    fetch("/api/notifications", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (gone) return;
        setMentions(d.notifications || []);
        setMentionsUnread(Number(d.unread) || 0);
      })
      .catch(() => {
        if (!gone) {
          setMentions([]);
          setMentionsUnread(0);
        }
      })
      .finally(() => {
        if (!gone) setMentionsLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [section, user]);

  async function markMentionsRead() {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setMentions((prev) => prev.map((n) => ({ ...n, read: true })));
      setMentionsUnread(0);
    } catch {}
  }

  async function createAnnouncement() {
    if (!annTitle.trim() || !annContent.trim()) return;
    setAnnBusy(true);
    setAnnMsg("");
    try {
      const r = await fetch("/api/admin/announcements", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: annTitle.trim(),
          content: annContent.trim(),
          targetUsername: annTarget.trim() || undefined,
          targetIps: annIps.trim() || undefined,
          important: annImportant,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setAnnMsg(d.error || "Failed");
        return;
      }
      setAnnouncements((prev) => [d.announcement, ...prev]);
      setAnnTitle("");
      setAnnContent("");
      setAnnTarget("");
      setAnnIps("");
      setAnnImportant(false);      const ips = d.announcement?.target_ips;
      setAnnMsg(
        d.announcement?.target_user_id
          ? "Sent to user"
          : Array.isArray(ips) && ips.length
            ? `Sent to ${ips.length} IP${ips.length === 1 ? "" : "s"}`
            : "Posted globally",
      );
    } finally {
      setAnnBusy(false);
      setTimeout(() => setAnnMsg(""), 2500);
    }
  }

  async function openBadgeManager() {
    if (!selectedUser) return;
    setBadgeManageOpen(true);
    if (!badgeCatalog.length) {
      try {
        const r = await fetch("/api/admin/badges", { credentials: "include" });
        const d = await r.json();
        if (r.ok) setBadgeCatalog(d.badges || []);
      } catch {}
    }
  }

  async function toggleUserBadge(badgeId: string, grant: boolean) {
    if (!selectedUser) return;
    setBadgeBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${selectedUser.id}/badges`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeId, grant }),
      });
      const d = await r.json();
      if (r.ok && d.achievements) {
        setSelectedUser((prev) =>
          prev ? { ...prev, achievements: d.achievements.filter((a: BadgeInfo) => a.unlocked) } : prev
        );
      }
    } catch {}
    setBadgeBusy(false);
  }

  async function toggleAnnouncement(id: string, active: boolean) {
    const r = await fetch(`/api/admin/announcements/${id}/active`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const d = await r.json();
    if (r.ok && d.announcement) {
      setAnnouncements((prev) => prev.map((a) => (a.id === id ? d.announcement : a)));
    }
  }

  useEffect(() => {
    if (section !== "users" || !(user && (user.is_admin ?? 0) >= 1)) return;
    const q = adminSearch.trim();
    if (!q) return;
    const t = setTimeout(() => loadAdminUsers(1, q), 300);
    return () => clearTimeout(t);
  }, [adminSearch, section, user, loadAdminUsers]);

  async function openUserDetail(userId: string) {
    setDetailLoading(true);
    setSelectedUser(null);
    setRevealMap({});
    setRevealBusy("");
    setRevealTrunc(false);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setSelectedUser(d.user);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function revealField(field: string) {
    if (!selectedUser) return;
    setRevealBusy(field);
    try {
      const r = await fetch(
        `/api/admin/users/${encodeURIComponent(selectedUser.id)}/reveal?field=${encodeURIComponent(field)}`,
        { credentials: "include" }
      );
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || "Failed");
        return;
      }
      setRevealMap((prev) => ({ ...prev, [field]: d.value ?? "" }));
      if (field === "settings") setRevealTrunc(!!d.truncated);
    } finally {
      setRevealBusy("");
    }
  }

  async function finishAuthSuccess(u: AuthUser) {
    setUser(u);
    hydrateProfile(u);
    notifyAuthChanged();
    const result = await reconcileSettings();
    loadLocalSettings();
    if (result === "pulled") setSyncNote("Synced from your account");
    else if (result === "pushed") setSyncNote("Local settings uploaded");
    setTimeout(() => setSyncNote(""), 3000);
    const pending = consumePendingAuth();
    if (pending?.type === "tor") {
      await applyVpnRegion("tor");
      onNavigate("petezah://newtab");
    } else if (pending?.type === "movies") {
      onNavigate(hrefs.mo());
    } else if (pending?.type === "feedback") {
      onNavigate("petezah://feedback");
    } else if (pending?.type === "firefox" || pending?.type === "vm") {
      onNavigate("petezah://vm");
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(""); setAuthOk("");
    if (authMode === "signup" && !acceptedLegal) {
      setAuthErr("Agree to the Terms, Privacy Policy, and DMCA Policy to create an account.");
      return;
    }
    if (authMode === "signup") {
      const u = signupUsername.trim();
      if (u.length < 3) {
        setAuthErr("Choose a username with at least 3 characters.");
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(u)) {
        setAuthErr("Username can only use letters, numbers, and underscores.");
        return;
      }
    }
    setAuthLoading(true);
    try {
      const payload: Record<string, unknown> = { email, password };
      if (authMode === "signup") {
        payload.acceptedLegal = true;
        payload.username = signupUsername.trim();
      }
      try {
        if (rememberMe && email) {
          localStorage.setItem("pz-remember-email", "1");
          localStorage.setItem("pz-remembered-email", email);
        } else {
          localStorage.removeItem("pz-remember-email");
          localStorage.removeItem("pz-remembered-email");
        }
      } catch {}
      const r = await fetch(`/api/${authMode}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload), credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) setAuthErr(d.error || "Something went wrong");
      else if (authMode === "signup") {
        setAuthOk(d.message || "Account created! You can sign in now.");
        setAuthMode("signin");
        setPassword("");
        setSignupUsername("");
        setAcceptedLegal(false);
      }
      else if (d.requires2fa) {
        setLogin2fa({ email: d.email });
        setLogin2faCode("");
        setPassword("");
        setAuthOk(d.message || "Enter your authenticator code.");
      } else if (d.requires2faSetup) {
        setForce2faSetup(true);
        setForce2faQr(null);
        setForce2faCode("");
        setUser(d.user);
        hydrateProfile(d.user);
        setPassword("");
        setAuthOk("Staff accounts must enable 2FA before continuing.");
      } else {
        await finishAuthSuccess(d.user);
      }
    } catch { setAuthErr("Network error. Please try again."); }
    finally { setAuthLoading(false); }
  }

  async function handleLogin2fa(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr("");
    setAuthLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code: login2faCode.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAuthErr(d.error || "Invalid code");
        if (d.code === "REQUIRES_SIGNIN") {
          setLogin2fa(null);
        }
        return;
      }
      setLogin2fa(null);
      setLogin2faCode("");
      await finishAuthSuccess(d.user);
    } catch {
      setAuthErr("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForce2faEnable(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr("");
    setAuthOk("");
    setForce2faBusy(true);
    try {
      const r = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code: force2faCode.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAuthErr(d.error || "Could not enable 2FA");
        return;
      }
      setForce2faSetup(false);
      setForce2faQr(null);
      setForce2faCode("");
      await finishAuthSuccess(d.user);
    } catch {
      setAuthErr("Network error. Please try again.");
    } finally {
      setForce2faBusy(false);
    }
  }

  async function resendVerification(overrideEmail?: string) {
    const target = (overrideEmail || email || user?.email || "").trim();
    if (!target) {
      setAuthErr("Enter your email first.");
      setVerifyMsg("No email on file.");
      return;
    }
    setResendBusy(true);
    setAuthErr("");
    setAuthOk("");
    setVerifyMsg("");
    try {
      const r = await fetch("/api/verify-email/resend", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const d = await r.json();
      if (!r.ok) {
        setAuthErr(d.error || "Could not resend");
        setVerifyMsg(d.error || "Could not resend");
      } else {
        setAuthOk(d.message || "Check your inbox.");
        setVerifyMsg("Verification email sent — check your inbox.");
        setTimeout(() => setVerifyMsg(""), 4000);
      }
    } catch {
      setAuthErr("Network error.");
      setVerifyMsg("Network error.");
    } finally {
      setResendBusy(false);
    }
  }

  async function startTotpSetup() {
    setTotpBusy(true);
    setLinksErr("");
    setLinksMsg("");
    try {
      const r = await fetch("/api/links/2fa/setup", { method: "POST", credentials: "include" });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Setup failed");
        return;
      }
      setTotpSetup({ secret: d.secret, qrDataUrl: d.qrDataUrl });
      setTotpCode("");
    } catch {
      setLinksErr("Network error");
    } finally {
      setTotpBusy(false);
    }
  }

  async function enableTotp() {
    setTotpBusy(true);
    setLinksErr("");
    try {
      const r = await fetch("/api/links/2fa/enable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Invalid code");
        return;
      }
      setTotpSetup(null);
      setTotpCode("");
      setLinksMsg("2FA enabled");
      setUser((u) => (u ? { ...u, totp_enabled: true } : u));
      loadLinksStatus();
      setTimeout(() => setLinksMsg(""), 2500);
    } catch {
      setLinksErr("Network error");
    } finally {
      setTotpBusy(false);
    }
  }

  async function disableTotp() {
    setTotpBusy(true);
    setLinksErr("");
    try {
      const r = await fetch("/api/links/2fa/disable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode.trim(), password: disablePassword }),
      });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Could not disable 2FA");
        return;
      }
      setDisableCode("");
      setDisablePassword("");
      setLinksMsg("2FA disabled");
      setUser((u) => (u ? { ...u, totp_enabled: false } : u));
      loadLinksStatus();
      setTimeout(() => setLinksMsg(""), 2500);
    } catch {
      setLinksErr("Network error");
    } finally {
      setTotpBusy(false);
    }
  }

  async function claimLink() {
    setClaimBusy(true);
    setLinksErr("");
    setLinksMsg("");
    try {
      const body: Record<string, string> = { blocker: selectedBlocker };
      if (linksStatus?.totpEnabled) body.code = claimCode.trim();
      const r = await fetch("/api/links/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        setLinksErr(d.error || "Claim failed");
        return;
      }
      setClaimCode("");
      setLinksMsg(`Got link: ${d.claim?.link}`);
      loadLinksStatus();
    } catch {
      setLinksErr("Network error");
    } finally {
      setClaimBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setLinksMsg("Copied");
      setTimeout(() => setLinksMsg(""), 1500);
    } catch {}
  }

  async function saveProfile() {
    setProfSaving(true); setProfMsg("");
    try {
      const r = await fetch("/api/me", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          username,
          bio,
          display_name: displayName,
          status,
          location,
          website,
          profile_color: profileColor,
          profile_public: profilePublic,
          favorite_music: favoriteMusic,
          showcase_badges: showcaseBadges,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        const saved = d.user || {
          username,
          bio,
          display_name: displayName,
          status,
          location,
          website,
          profile_color: profileColor,
          profile_public: profilePublic,
          favorite_music: favoriteMusic,
          showcase_badges: showcaseBadges,
        };
        setUser(u => u ? { ...u, ...saved } : u);
        hydrateProfile({ ...(user as AuthUser), ...saved });
        setProfMsg("Saved!");
        notifyAuthChanged();
        window.dispatchEvent(new CustomEvent("petezah-profile-updated", { detail: saved }));
      } else setProfMsg(d.error || "Failed to save.");
    } finally { setProfSaving(false); setTimeout(() => setProfMsg(""), 2500); }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarUploading(true);
    try {
      const r = await fetch("/api/me/avatar", {
        method: "POST", headers: { "Content-Type": file.type }, credentials: "include", body: file,
      });
      if (r.ok) { const d = await r.json(); setUser(u => u ? { ...u, avatar_url: d.avatar_url } : u); }
    } finally { setAvatarUploading(false); e.target.value = ""; }
  }

  async function uploadBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBannerUploading(true);
    try {
      const r = await fetch("/api/me/banner", {
        method: "POST", headers: { "Content-Type": file.type }, credentials: "include", body: file,
      });
      if (r.ok) { const d = await r.json(); setUser(u => u ? { ...u, banner_url: d.banner_url } : u); }
    } finally { setBannerUploading(false); e.target.value = ""; }
  }

  function toggleFavoriteTrack(track: FavTrack) {
    setFavoriteMusic(prev => {
      if (prev.some(t => t.id === track.id)) return prev.filter(t => t.id !== track.id);
      if (prev.length >= 12) return prev;
      return [...prev, track];
    });
  }

  async function signout() {
    await fetch("/api/signout", { method: "POST", credentials: "include" });
    setUser(null); setEmail(""); setPassword("");
    notifyAuthChanged();
  }

  const setVal = (k: string, v: string) => setS(prev => ({ ...prev, [k]: v }));
  const toggle = (k: string) => setS(prev => ({ ...prev, [k]: prev[k] === "true" ? "false" : "true" }));

  async function applySettings() {
    applySettingsNow(s);
    setSettingsSaved(true);
    if (user) {
      const ok = await pushSettings();
      setSyncNote(ok ? "Saved to account" : "Saved locally only");
      setTimeout(() => setSyncNote(""), 2500);
    }
    setTimeout(() => setSettingsSaved(false), 1500);
  }

  async function runManualSync(direction: "pull" | "push") {
    setSyncBusy(true);
    setSyncNote("");
    try {
      if (direction === "pull") {
        const ok = await pullSettings();
        loadLocalSettings();
        const loaded: Record<string, string> = {};
        [
          "theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","autocloak","focusCloaking","linkCloaking",
          "backgroundColor","backgroundImage","bgNetwork","debugHud","searchEdgeGlow","horizontalTabs","trendingHomescreen",hrefs.gf(),"quickRelaunch",hrefs.rp(),"lowPowerBg","rainBackdrop","rainScene","rainOnHomepage","bgEffect",
          "searchEngine","browserIdentity","uaPreset","customUserAgent","proxServer","extensionsEnabled","stripTrackers","preferHttps",
        ].forEach(k => {
          const v = localStorage.getItem(k);
          if (v !== null) loaded[k] = v;
        });
        applySettingsNow(loaded);
        setSyncNote(ok ? "Downloaded from account" : "Could not download");
      } else {
        const ok = await pushSettings();
        setSyncNote(ok ? "Uploaded to account" : "Could not upload");
      }
    } finally {
      setSyncBusy(false);
      setTimeout(() => setSyncNote(""), 3000);
    }
  }

  function exportData() {
    const data = { localStorage: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "petezah-data.json"; a.click();
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.localStorage) {
          Object.entries(data.localStorage).forEach(([k, v]) => localStorage.setItem(k, String(v)));
          const keys = ["theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","disableParticles","autocloak","focusCloaking","linkCloaking"];
          const loaded: Record<string,string> = {};
          keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) loaded[k] = v; });
          setS(loaded); applySettingsNow(loaded);
          if (user) schedulePushSettings(800);
        }
      } catch {}
    };
    reader.readAsText(file); e.target.value = "";
  }

  function resetData() {
    if (!confirm("Reset all local settings? This cannot be undone.")) return;
    localStorage.clear(); setS({}); document.title = "PeteZah";
  }

  async function confirmSecurityAction() {
    if (!secModal || !secPassword) return;
    setSecBusy(true);
    setSecErr("");
    try {
      const enabled = secModal.action === "attack-on" || secModal.action === "kill-on";
      const path =
        secModal.action === "attack-on" || secModal.action === "attack-off"
          ? "/api/admin/security/attack-mode"
          : "/api/admin/security/kill-switch";
      const r = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ enabled, password: secPassword }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSecErr(d.error || "Action failed");
        return;
      }
      setSecModal(null);
      setSecPassword("");
      const ov = await fetch("/api/admin/overview", { credentials: "include" });
      if (ov.ok) setOverview(await ov.json());
    } catch {
      setSecErr("Network error");
    } finally {
      setSecBusy(false);
    }
  }

  async function adminAction(userId: string, action: string) {
    const r = await fetch("/api/admin/user-action", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ userId, action }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Action failed");
      return;
    }
    const patchRole = (is_admin: number) => {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin } : u));
      setStaffList(prev => prev.map(u => u.id === userId ? { ...u, is_admin } : u)
        .filter(u => action === "demote_admin" && is_admin === 0 ? u.id !== userId : true));
    };
    if (action === "ban") {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: 1, email_verified: 0 } : u));
      setStaffList(prev => prev.map(u => u.id === userId ? { ...u, banned: 1 } : u));
    } else if (action === "unban") {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: 0 } : u));
      setStaffList(prev => prev.map(u => u.id === userId ? { ...u, banned: 0 } : u));
    } else if (action === "suspend") {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, email_verified: 0 } : u));
    } else if (action === "verify_email") {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, email_verified: 1 } : u));
      setStaffList(prev => prev.map(u => u.id === userId ? { ...u, email_verified: 1 } : u));
      setSelectedUser(prev => prev && prev.id === userId ? { ...prev, email_verified: 1 } : prev);
    } else if (action === "promote_admin") patchRole(3);
    else if (action === "staff") patchRole(2);
    else if (action === "promote_mod") patchRole(1);
    else if (action === "demote_admin") patchRole(0);
    else if (action === "delete") {
      setAdminUsers(prev => prev.filter(u => u.id !== userId));
      setStaffList(prev => prev.filter(u => u.id !== userId));
    }
    if (selectedUser?.id === userId) {
      const detail = await fetch(`/api/admin/users/${userId}`, { credentials: "include" });
      if (detail.ok) {
        const data = await detail.json();
        setSelectedUser(data.user);
      } else if (action === "delete") {
        setSelectedUser(null);
      }
    }
    if (adminTab === "staff" || action.includes("promote") || action.includes("demote") || action === "staff") {
      loadStaff();
    }
  }

  const roleLabel = (n: number, owner = false) => owner ? "Owner" : n >= 3 ? "Admin" : n >= 2 ? "Staff" : n >= 1 ? "Mod" : "User";
  const roleColor = (n: number, owner = false) => owner ? "hsl(38 90% 58%)" : n >= 3 ? C.accent : n >= 2 ? "hsl(270 55% 65%)" : n >= 1 ? "hsl(165 50% 52%)" : C.textMuted;

  const isAdmin = (user?.is_admin ?? 0) >= 1 || !!user?.is_owner;
  const visibleSections = NAV.filter(s => !s.adminOnly || isAdmin);

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <Loader2 size={20} className="animate-spin" style={{ color: C.accent }} />
    </div>
  );

  if (login2fa) {
    return (
      <div
        data-no-obfuscate="true"
        className="no-obfuscate"
        style={{ height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", overflow: "hidden" }}
      >
      <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "320px", padding: "0 20px" }}
      >
        <div style={{
          background: "hsla(216, 32%, 7%, 0.75)", backdropFilter: "blur(20px)",
          border: `1px solid ${C.border}`, borderRadius: "14px", padding: "28px 24px",
          boxShadow: "0 24px 48px hsla(216, 50%, 4%, 0.5)",
        }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px", margin: "0 auto 12px",
              background: C.accentDim, border: `1px solid ${C.borderFocus}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
                <ShieldCheck size={18} color={C.accent} />
            </div>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>
                Two-factor authentication
            </h2>
            <p style={{ fontSize: "11px", color: C.textSub, margin: 0 }}>
                Staff accounts require an authenticator code
                {login2fa.email ? ` for ${login2fa.email}` : ""}.
            </p>
          </div>
            {authErr && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "7px", marginBottom: "14px",
                background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)", color: "hsl(0 60% 68%)", fontSize: "11px" }}>
                <AlertCircle size={11} style={{ flexShrink: 0 }} />{authErr}
              </div>
            )}
            <form onSubmit={handleLogin2fa} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Field value={login2faCode} onChange={(e: any) => setLogin2faCode(e.target.value)} placeholder="6-digit code" icon={KeyRound} maxLength={6} />
              <button type="submit" disabled={authLoading || login2faCode.trim().length !== 6} style={{
                marginTop: "4px", width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${C.borderFocus}`,
                background: C.accentDim, color: C.text, fontSize: "13px", fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                cursor: authLoading || login2faCode.trim().length !== 6 ? "not-allowed" : "pointer",
                opacity: authLoading || login2faCode.trim().length !== 6 ? 0.7 : 1,
              }}>
                {authLoading && <Loader2 size={13} className="animate-spin" />}
                Verify & continue
              </button>
            </form>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/signout", { method: "POST", credentials: "include" });
                setLogin2fa(null);
                setLogin2faCode("");
                setAuthErr("");
              }}
              style={{ width: "100%", marginTop: "14px", background: "none", border: "none", cursor: "pointer",
                fontSize: "11px", color: C.textSub, textAlign: "center" }}
            >
              Back to sign in
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (user && (force2faSetup || user.must_setup_2fa)) {
    return (
      <div
        data-no-obfuscate="true"
        className="no-obfuscate"
        style={{ height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", overflow: "auto" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "320px", padding: "12px 16px" }}
        >
          <div style={{
            background: "hsla(216, 32%, 7%, 0.75)", backdropFilter: "blur(20px)",
            border: `1px solid ${C.border}`, borderRadius: "14px", padding: "18px 18px 14px",
            boxShadow: "0 24px 48px hsla(216, 50%, 4%, 0.5)",
          }}>
            <div style={{ textAlign: "center", marginBottom: "12px" }}>
              <div style={{
                width: "34px", height: "34px", borderRadius: "9px", margin: "0 auto 8px",
                background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Lock size={15} color={C.accent} />
              </div>
              <h2 style={{ fontSize: "14px", fontWeight: 700, color: C.text, margin: "0 0 2px" }}>
                Set up 2FA to continue
              </h2>
              <p style={{ fontSize: "11px", color: C.textSub, margin: 0, lineHeight: 1.4 }}>
                Staff accounts require an authenticator app.
              </p>
            </div>
            {authErr && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 9px", borderRadius: "7px", marginBottom: "10px",
                background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)", color: "hsl(0 60% 68%)", fontSize: "11px" }}>
                <AlertCircle size={11} style={{ flexShrink: 0 }} />{authErr}
              </div>
            )}
            {authOk && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 9px", borderRadius: "7px", marginBottom: "10px",
                background: "hsl(142 50% 40% / 0.1)", border: "1px solid hsl(142 50% 40% / 0.25)", color: "hsl(142 45% 70%)", fontSize: "11px" }}>
                {authOk}
              </div>
            )}
            {force2faBusy && !force2faQr ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                <Loader2 className="animate-spin" size={18} color={C.accent} />
              </div>
            ) : force2faQr ? (
              <form onSubmit={handleForce2faEnable} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <img src={force2faQr.qrDataUrl} alt="2FA QR" style={{ width: 132, height: 132, borderRadius: 8, alignSelf: "center", background: "#fff" }} />
                <p
                  data-no-obfuscate="true"
                  style={{
                    fontSize: 10,
                    color: C.textSub,
                    margin: 0,
                    textAlign: "center",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    wordBreak: "break-all",
                    lineHeight: 1.35,
                  }}
                >
                  {force2faQr.secret}
                </p>
                <Field
                  value={force2faCode}
                  onChange={(e: any) => setForce2faCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  icon={KeyRound}
                  maxLength={6}
                />
                <button type="submit" disabled={force2faBusy || force2faCode.trim().length !== 6} style={{
                  width: "100%", padding: "9px", borderRadius: "8px", border: `1px solid ${C.borderFocus}`,
                  background: C.accentDim, color: C.text, fontSize: "13px", fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                  cursor: force2faBusy || force2faCode.trim().length !== 6 ? "not-allowed" : "pointer",
                  opacity: force2faBusy || force2faCode.trim().length !== 6 ? 0.7 : 1,
                }}>
                  {force2faBusy && <Loader2 size={13} className="animate-spin" />}
                  Enable 2FA & continue
                </button>
                <button
                  type="button"
                  onClick={rotateForce2faQr}
                  disabled={force2faBusy}
                  style={{
                    background: "none", border: "none", color: C.textSub, fontSize: "11px",
                    cursor: force2faBusy ? "not-allowed" : "pointer", padding: "2px 0 0",
                    textAlign: "center",
                  }}
                >
                  New QR
                </button>
              </form>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/signout", { method: "POST", credentials: "include" });
                setUser(null);
                setForce2faSetup(false);
                setForce2faQr(null);
                notifyAuthChanged();
              }}
              style={{ width: "100%", marginTop: "10px", background: "none", border: "none", cursor: "pointer",
                fontSize: "11px", color: C.textSub, textAlign: "center" }}
            >
              Sign out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) return (
    <div
      className="no-obfuscate"
      data-no-obfuscate="true"
      style={{
      height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
      background: "transparent", overflow: "hidden", padding: "28px 22px",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="no-obfuscate"
        data-no-obfuscate="true"
        style={{
          position: "relative", zIndex: 10, width: "100%", maxWidth: 320,
          padding: "28px 26px 24px",
          borderRadius: 18,
          background: "hsla(220, 28%, 8%, 0.72)",
          border: "1px solid hsla(210, 40%, 80%, 0.12)",
          backdropFilter: "blur(18px)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.26)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.35 }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}
        >
          <img src={defaultBrandSrc()} alt="" style={{ width: 22, height: 22, objectFit: "contain", borderRadius: 6 }} />
          <span style={{ fontSize: 13, fontWeight: 650, color: C.text, letterSpacing: "-0.02em" }}>PeteZah</span>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={authMode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
          >
            <h2 style={{
              margin: "0 0 4px", textAlign: "center", fontSize: 22, fontWeight: 750,
              color: C.text, letterSpacing: "-0.03em", lineHeight: 1.15,
            }}>
              {authMode === "signin" ? "Welcome back!" : "Create account"}
            </h2>
            <p style={{ margin: "0 0 18px", textAlign: "center", fontSize: 12, color: C.textSub }}>
              {authMode === "signin" ? "Sign in to PeteZah below" : "Pick a username to get started"}
            </p>
          </motion.div>
        </AnimatePresence>

          <AnimatePresence mode="wait">
            {authErr && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, marginBottom: 12,
                background: "hsl(0 60% 50% / 0.1)", border: "1px solid hsl(0 60% 50% / 0.22)", color: "hsl(0 60% 70%)", fontSize: 11 }}>
                <AlertCircle size={11} style={{ flexShrink: 0 }} />{authErr}
              </motion.div>
            )}
            {authOk && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, marginBottom: 12,
                background: "hsl(145 50% 42% / 0.1)", border: "1px solid hsl(145 50% 42% / 0.25)", color: "hsl(145 50% 60%)", fontSize: 11 }}>
                <Check size={11} style={{ flexShrink: 0 }} />{authOk}
              </motion.div>
            )}
          </AnimatePresence>

        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {authMode === "signup" && (
            <label style={{ display: "block" }}>
              <input
                type="text"
                value={signupUsername}
                onChange={(e) => setSignupUsername(e.target.value)}
                placeholder="Username"
                maxLength={32}
                autoComplete="username"
                data-no-obfuscate="true"
                style={{
                  width: "100%", background: "transparent", border: "none", outline: "none",
                  borderBottom: "1px solid hsla(210, 30%, 70%, 0.28)",
                  padding: "8px 2px", color: C.text, fontSize: 13, fontFamily: "inherit",
                }}
              />
            </label>
          )}
          <label style={{ display: "block" }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              data-no-obfuscate="true"
              style={{
                width: "100%", background: "transparent", border: "none", outline: "none",
                borderBottom: "1px solid hsla(210, 30%, 70%, 0.28)",
                padding: "8px 2px", color: C.text, fontSize: 13, fontFamily: "inherit",
              }}
            />
          </label>
          <label style={{ display: "block", position: "relative" }}>
            <input
              type={showAuthPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={authMode === "signin" ? "current-password" : "new-password"}
              data-no-obfuscate="true"
              style={{
                width: "100%", background: "transparent", border: "none", outline: "none",
                borderBottom: "1px solid hsla(210, 30%, 70%, 0.28)",
                padding: "8px 28px 8px 2px", color: C.text, fontSize: 13, fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() => setShowAuthPassword((v) => !v)}
              tabIndex={-1}
              style={{
                position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", padding: 4,
                color: C.textMuted, display: "flex", alignItems: "center",
              }}
              aria-label={showAuthPassword ? "Hide password" : "Show password"}
            >
              {showAuthPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </label>

          {authMode === "signin" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: -2 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11, color: C.textSub }}>
                <span
                  onClick={() => setRememberMe((v) => !v)}
                  style={{
                    width: 14, height: 14, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: rememberMe ? "hsla(0,0%,96%,0.92)" : "transparent",
                    border: rememberMe ? "none" : "1px solid hsla(210, 30%, 70%, 0.35)",
                    color: "#0a0c10",
                  }}
                >
                  {rememberMe ? <Check size={9} strokeWidth={3} /> : null}
                </span>
                Remember me
              </label>
              <button
                type="button"
                onClick={() => resendVerification(email)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.textMuted, padding: 0 }}
              >
                Resend verification
              </button>
            </div>
          ) : (
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 7, cursor: "pointer",
              fontSize: 10, lineHeight: 1.4, color: C.textSub,
            }}>
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                style={{ marginTop: 2, accentColor: C.accent, flexShrink: 0 }}
              />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: C.text }} onClick={(e) => e.stopPropagation()}>Terms</a>,{" "}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: C.text }} onClick={(e) => e.stopPropagation()}>Privacy</a>, and{" "}
                <a href="/dmca" target="_blank" rel="noopener noreferrer" style={{ color: C.text }} onClick={(e) => e.stopPropagation()}>DMCA</a>.
              </span>
            </label>
          )}

          <motion.button
            type="submit"
            disabled={authLoading || (authMode === "signup" && !acceptedLegal)}
            whileHover={{ scale: authLoading ? 1 : 1.01 }}
            whileTap={{ scale: authLoading ? 1 : 0.985 }}
            style={{
              marginTop: 2, width: "100%", padding: "10px 14px", borderRadius: 999, border: "none",
              background: "hsla(0, 0%, 92%, 0.92)", color: "#0b0e14",
              fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              cursor: authLoading || (authMode === "signup" && !acceptedLegal) ? "not-allowed" : "pointer",
              opacity: authLoading || (authMode === "signup" && !acceptedLegal) ? 0.65 : 1,
            }}
          >
              {authLoading && <Loader2 size={13} className="animate-spin" />}
              {authMode === "signin" ? "Sign In" : "Create Account"}
          </motion.button>
          </form>

        <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 12, color: C.textSub }}>
          {authMode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => { setAuthMode((m) => (m === "signin" ? "signup" : "signin")); setAuthErr(""); setAuthOk(""); setAcceptedLegal(false); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.text, fontWeight: 700, fontSize: 12, padding: 0 }}
          >
            {authMode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </motion.div>
    </div>
  );

  const avatarLetter = (user.username || user.email)[0].toUpperCase();

  const panelProps = {
    C,
    s,
    setS,
    setVal,
    toggle,
    applySettings,
    settingsSaved,
    applySettingsNow,
    bgImgRef,
    openAboutBlank,
  };

  return (
    <div
      className="account-settings-shell"
      style={{
        height: "100%",
        display: "flex",
        overflow: "hidden",
        background: "transparent",
        fontFamily: "plusjakartasans-obf, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <motion.div
        initial={{ x: -28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: "188px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${C.border}`,
          padding: "14px 8px",
          background: "hsla(220, 30%, 8%, 0.72)",
          backdropFilter: "blur(18px) saturate(1.2)",
          WebkitBackdropFilter: "blur(18px) saturate(1.2)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginBottom: "16px", paddingBottom: "14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: "46px", height: "46px", borderRadius: "13px", overflow: "hidden",
              background: C.elevated, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "17px", fontWeight: 700, color: C.text,
              boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
            }}>
              {user.avatar_url
                ? <img src={user.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : avatarLetter}
            </div>
            <button onClick={() => avatarRef.current?.click()} style={{
              position: "absolute", bottom: "-3px", right: "-3px", width: "18px", height: "18px", borderRadius: "50%",
              background: C.elevated, border: `2px solid ${C.bg}`, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {avatarUploading ? <Loader2 size={8} color={C.text} className="animate-spin" /> : <Camera size={8} color={C.textSub} />}
            </button>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={uploadAvatar} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{user.username || user.email.split("@")[0]}</span>
              {((user.is_admin ?? 0) > 0 || user.is_owner) && (
                <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                  background: `${roleColor(user.is_admin ?? 0, user.is_owner)}18`, color: roleColor(user.is_admin ?? 0, user.is_owner), border: `1px solid ${roleColor(user.is_admin ?? 0, user.is_owner)}30` }}>
                  {roleLabel(user.is_admin ?? 0, user.is_owner)}
                </span>
              )}
            </div>
            <p style={{ fontSize: "9px", color: C.textMuted, margin: "2px 0 0" }}>{user.email}</p>
          </div>
        </div>

        <nav style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px", scrollbarWidth: "thin" }}>
          {visibleSections.map(({ id, label, icon: Icon }, idx) => {
            const active = section === id;
            return (
              <motion.button
                key={id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 + idx * 0.028, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setSection(id)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "999px", width: "100%",
                  background: active ? "hsla(210, 40%, 80%, 0.1)" : "transparent",
                  border: `1px solid ${active ? "hsla(210, 40%, 80%, 0.18)" : "transparent"}`,
                  color: active ? C.text : C.textSub,
                  fontSize: "12px", fontWeight: active ? 560 : 450, cursor: "pointer", textAlign: "left",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "hsla(210, 40%, 80%, 0.06)"; e.currentTarget.style.color = C.text; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSub; } }}
              >
                <Icon size={12} />
                <ObfuscatedText as="span">{label}</ObfuscatedText>
              </motion.button>
            );
          })}
        </nav>

        <button onClick={signout} style={{
          display: "flex", alignItems: "center", gap: "7px", padding: "8px 10px", borderRadius: "7px",
          background: "transparent", border: `1px solid transparent`,
          color: C.textMuted, fontSize: "11px", fontWeight: 500, cursor: "pointer", marginTop: "6px", transition: "all 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "hsl(0 60% 50% / 0.08)"; e.currentTarget.style.color = C.danger; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = "transparent"; }}>
          <LogOut size={11} />Sign out
        </button>
      </motion.div>

      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "26px 30px",
        scrollbarWidth: "thin",
        scrollbarColor: `${C.border} transparent`,
        background: "transparent",
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 10, filter: "blur(5px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >

            {section === "profile" && (
              <div style={{ maxWidth: "520px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
                  <div>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Profile</h2>
                    <p style={{ fontSize: "11px", color: C.textSub, margin: 0 }}>
                  {user.created_at ? `Member since ${new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}` : "Manage your profile"}
                </p>
                  </div>
                  <button
                    type="button"
                    title="About PeteZah"
                    onClick={() => setAboutOpen(true)}
                    style={{
                      width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                      background: C.elevated, border: `1px solid ${C.border}`, color: C.textSub, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <Info size={14} />
                  </button>
                </div>
                <div style={{ height: 16 }} />

                {(user.email_verified === false || user.email_verified === 0) ? (
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 10, marginBottom: 16,
                    background: "hsl(32 80% 45% / 0.1)", border: "1px solid hsl(32 80% 45% / 0.28)",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <AlertCircle size={13} style={{ color: "hsl(32 90% 62%)", flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "hsl(32 90% 68%)" }}>Email not verified</p>
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: C.textSub, lineHeight: 1.45 }}>
                          Your account works for movies, VM, and everything else. Verify <span style={{ color: C.text }}>{user.email}</span> to unlock Get Links.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => resendVerification(user.email)}
                      disabled={resendBusy}
                      style={{
                        alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: resendBusy ? "not-allowed" : "pointer",
                        background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                        opacity: resendBusy ? 0.6 : 1,
                      }}
                    >
                      {resendBusy ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                      {resendBusy ? "Sending…" : "Send verification email"}
                    </button>
                    {verifyMsg && (
                      <p style={{ margin: 0, fontSize: 11, color: verifyMsg.includes("sent") || verifyMsg.includes("inbox") ? C.success : C.danger }}>
                        {verifyMsg}
                      </p>
                    )}
                  </div>
                ) : (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, marginBottom: 16,
                    background: "hsl(145 50% 42% / 0.1)", border: "1px solid hsl(145 50% 42% / 0.22)",
                    color: C.success, fontSize: 11, fontWeight: 600,
                  }}>
                    <Check size={11} /> Email verified
                  </div>
                )}

                <div style={{
                  position: "relative", height: 90, borderRadius: 12, overflow: "hidden",
                  background: `linear-gradient(135deg, ${profileColor}55, hsl(216 22% 12%))`,
                  border: `1px solid ${C.border}`, marginBottom: 18,
                }}>
                  {user.banner_url && (
                    <img src={user.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  <button onClick={() => bannerRef.current?.click()} style={{
                    position: "absolute", right: 10, bottom: 10, display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 7, background: "hsl(216 32% 6% / 0.75)",
                    border: `1px solid ${C.border}`, color: C.textSub, fontSize: 10, cursor: "pointer",
                  }}>
                    {bannerUploading ? <Loader2 size={10} className="animate-spin" /> : <Image size={10} />}
                    Banner
                  </button>
                  <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={uploadBanner} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <Field label="Username" value={username} onChange={(e: any) => setUsername(e.target.value)} placeholder="petezah" maxLength={32} icon={User} />
                  {username && (
                    <button
                      onClick={() => onNavigate(`petezah://user/@${username}`)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8,
                        background: C.surface, border: `1px solid ${C.border}`, color: C.accent,
                        fontSize: 11, fontWeight: 600, cursor: "pointer", width: "fit-content",
                      }}
                    >
                      <ExternalLink size={11} /> /user/@{username}
                    </button>
                  )}
                  <Field label="Display name" value={displayName} onChange={(e: any) => setDisplayName(e.target.value)} placeholder="How you appear" maxLength={48} icon={User} />
                  <Field label="Status" value={status} onChange={(e: any) => setStatus(e.target.value)} placeholder="What you're up to" maxLength={80} icon={Zap} />
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Bio</label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="A short bio..." maxLength={280} rows={3}
                      style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px",
                        color: C.text, fontSize: "13px", padding: "9px 12px", outline: "none", resize: "none",
                        fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
                      onFocus={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                      onBlur={e => (e.currentTarget.style.borderColor = C.border)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Location" value={location} onChange={(e: any) => setLocation(e.target.value)} placeholder="City" maxLength={64} icon={MapPin} />
                    <Field label="Website" value={website} onChange={(e: any) => setWebsite(e.target.value)} placeholder="https://" maxLength={200} icon={Link2} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Profile color</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="color" value={profileColor} onChange={e => setProfileColor(e.target.value)}
                        style={{ width: 36, height: 36, border: "none", background: "none", cursor: "pointer" }} />
                      <input type="text" value={profileColor} onChange={e => setProfileColor(e.target.value)}
                        style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 10px", fontFamily: "monospace", outline: "none" }} />
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 12, color: C.textSub }}>
                    <input type="checkbox" checked={profilePublic} onChange={e => setProfilePublic(e.target.checked)} />
                    Public profile visible at /user/@{username || "you"}
                  </label>

                  <Divider />
                  <div>
                    <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      <Trophy size={11} /> Showcase badges on profile
                    </p>
                    <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 10px" }}>
                      Choose which unlocked badges appear next to your @username. Leave all on to show everything.
                    </p>
                    {unlockedForShowcase.length === 0 ? (
                      <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Unlock badges to showcase them</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                        {unlockedForShowcase.map((b) => {
                          const shown = showcaseBadges === null || showcaseBadges.includes(b.id);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setShowcaseBadges((prev) => {
                                  const allIds = unlockedForShowcase.map((x) => x.id);
                                  if (prev === null) {
                                    return shown ? allIds.filter((id) => id !== b.id) : allIds;
                                  }
                                  if (shown) return prev.filter((id) => id !== b.id);
                                  if (prev.length >= 12) return prev;
                                  return [...prev, b.id];
                                });
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8,
                                background: shown ? C.accentDim : C.elevated,
                                border: `1px solid ${shown ? C.borderFocus : C.border}`,
                                cursor: "pointer", textAlign: "left", color: C.text,
                              }}
                            >
                              <BadgeChip badge={b} size={22} subtle />
                              <span style={{ flex: 1, fontSize: 11, fontWeight: 600 }}>{b.name}</span>
                              <span style={{ fontSize: 10, color: shown ? C.accent : C.textMuted }}>{shown ? "Shown" : "Hidden"}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Divider />
                  <div>
                    <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      <Music2 size={11} /> Favorite music on profile ({favoriteMusic.length}/12)
                    </p>
                    <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 10px" }}>
                      Pick from tracks you've liked in Music. They show on your public profile.
                    </p>
                    {favoriteMusic.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                        {favoriteMusic.map(t => (
                          <div key={t.id} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                            background: C.surface, border: `1px solid ${C.border}`,
                          }}>
                            {t.artwork ? <CoverImg src={t.artwork} alt="" style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover" }} /> : null}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: C.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</p>
                              <p style={{ fontSize: 9, color: C.textMuted, margin: 0 }}>{t.artist}</p>
                            </div>
                            <button onClick={() => toggleFavoriteTrack(t)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "flex" }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {likedPool.length === 0 ? (
                      <button onClick={() => onNavigate(hrefs.mu())} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
                        background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>
                        <Heart size={11} /> Like songs in Music first
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto" }}>
                        {likedPool.map(t => {
                          const on = favoriteMusic.some(f => f.id === t.id);
                          return (
                            <button key={t.id} onClick={() => toggleFavoriteTrack(t)} style={{
                              display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                              background: on ? C.accentDim : C.elevated, border: `1px solid ${on ? C.borderFocus : C.border}`,
                              cursor: "pointer", textAlign: "left", color: C.text,
                            }}>
                              {t.artwork ? <CoverImg src={t.artwork} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} /> : null}
                              <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                              {on ? <Check size={11} color={C.accent} /> : <Plus size={11} color={C.textMuted} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: 4 }}>
                    <button onClick={saveProfile} disabled={profSaving} style={{
                      display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px",
                      background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                      color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: profSaving ? 0.6 : 1, transition: "opacity 0.2s",
                    }}>
                      {profSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Save profile
                    </button>
                    {profMsg && <span style={{ fontSize: "11px", color: profMsg === "Saved!" ? C.success : C.danger }}>{profMsg}</span>}
                  </div>
                </div>

                <Divider />
                <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 6px" }}>Community</p>
                  {[
                    { label: "Changelog", desc: "See what's new", url: "petezah://changelog", icon: Megaphone },
                    { label: "Feedback", desc: "Share your thoughts", url: "petezah://feedback", icon: MessageSquare },
                    { label: "Music", desc: "Find songs for your profile", url: hrefs.mu(), icon: Music2 },
                  ].map(({ label, desc, url, icon: Icon }) => (
                    <button key={url} onClick={() => onNavigate(url)} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "9px",
                      background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", width: "100%", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Icon size={12} style={{ color: C.accent }} />
                        <div style={{ textAlign: "left" }}>
                          <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>{label}</p>
                          <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>{desc}</p>
                        </div>
                      </div>
                      <ChevronRight size={11} style={{ color: C.textMuted }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {section === "achievements" && (
              <div style={{ maxWidth: "620px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Trophy size={14} style={{ color: C.accent }} />
                  Achievements
                </h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px" }}>
                  Badges unlock as you use PeteZah · {achievementsData?.unlockedCount ?? 0}/{achievementsData?.total ?? 0} unlocked
                </p>
                {achievementsLoading && !achievementsData ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : !achievementsData ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>Sign in to track achievements</p>
                ) : (
                  <>
                    {achievementsData.stats && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 16 }}>
                        {[
                          ["Time", `${Math.floor((achievementsData.stats.timeMs || 0) / 3600000)}h`],
                          ["Launches", achievementsData.stats.gamesPlayed],
                          ["Unique", achievementsData.stats.uniqueGames],
                          ["VM", achievementsData.stats.vmSessions],
                        ].map(([label, val]) => (
                          <div key={String(label)} style={{
                            padding: "10px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`,
                          }}>
                            <p style={{ margin: 0, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                            <p style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 700, color: C.text }}>{val}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(achievementsData.achievements || []).map((a) => {
                        const locked = a.unlocked === false;
                        const progress = a.progress;
                        const pct = progress && progress.target > 0
                          ? Math.min(100, Math.round((progress.current / progress.target) * 100))
                          : locked ? 0 : 100;
                    return (
                          <div key={a.id} style={{
                            display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 10,
                            background: C.surface, border: `1px solid ${C.border}`, opacity: locked ? 0.78 : 1,
                          }}>
                            <BadgeChip badge={a} size={36} locked={locked} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 13, fontWeight: 650, color: C.text }}>{a.name}</span>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                                  padding: "2px 6px", borderRadius: 5,
                                  background: locked ? C.elevated : `${a.color}22`,
                                  color: locked ? C.textMuted : a.color,
                                  border: `1px solid ${locked ? C.border : `${a.color}44`}`,
                                }}>
                                  {a.rarity}
                                </span>
                              </div>
                              {progress ? (
                                <div style={{ marginTop: 6 }}>
                                  <p style={{ margin: 0, fontSize: 11, color: C.textSub }}>
                                    {progress.current}/{progress.target} {progress.unit}
                                  </p>
                                  <div style={{
                                    marginTop: 5, height: 6, borderRadius: 99, overflow: "hidden",
                                    background: "hsla(210, 30%, 16%, 0.9)", border: `1px solid ${C.border}`,
                                  }}>
                                    <div style={{
                                      width: `${pct}%`, height: "100%", borderRadius: 99,
                                      background: locked
                                        ? `linear-gradient(90deg, ${a.color}66, ${a.color}99)`
                                        : `linear-gradient(90deg, ${a.color}88, ${a.color})`,
                                      transition: "width 0.25s ease",
                                    }} />
                                  </div>
                                  <p style={{ margin: "3px 0 0", fontSize: 9, color: C.textMuted }}>{pct}%</p>
                                </div>
                              ) : (
                                <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textSub }}>{a.desc}</p>
                              )}
                              {a.unlockedAt ? (
                                <p style={{ margin: "4px 0 0", fontSize: 9, color: C.textMuted }}>
                                  Unlocked {new Date(a.unlockedAt).toLocaleDateString()}
                                </p>
                              ) : null}
                            </div>
                          </div>
                    );
                  })}
                </div>
                  </>
                )}
              </div>
            )}

            {section === "get-links" && (
              <div style={{ maxWidth: "520px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Get Links</h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 18px" }}>
                  Verified accounts get {linksStatus?.weeklyLimit ?? 2} links per week. This week&apos;s claims stay visible until the week resets.
                </p>

                {linksLoading && !linksStatus ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                        </div>
                ) : (
                  <>
                    <div style={{
                      display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 10,
                      background: C.surface, border: `1px solid ${C.border}`, marginBottom: 16,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: C.textSub }}>Email</span>
                        <span style={{ color: linksStatus?.emailVerified ? C.success : C.danger, fontWeight: 600 }}>
                          {linksStatus?.emailVerified ? "Verified" : "Not verified"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: C.textSub }}>Remaining this week</span>
                        <span style={{ color: C.text, fontWeight: 600 }}>
                          {linksStatus?.remaining ?? 0} / {linksStatus?.weeklyLimit ?? 2}
                        </span>
                    </div>
                      {linksStatus?.weekEndsAt ? (
                        <p style={{ margin: 0, fontSize: 10, color: C.textMuted }}>
                          Week resets {new Date(linksStatus.weekEndsAt).toLocaleString()}
                        </p>
                      ) : null}
                  </div>

                    {!linksStatus?.emailVerified && (
                      <div style={{
                        padding: "12px 14px", borderRadius: 10, marginBottom: 16,
                        background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)",
                        color: "hsl(0 60% 68%)", fontSize: 12, lineHeight: 1.45,
                      }}>
                        Verify your email to request links. You can still use the rest of the site. Check your inbox, or send a new verification email from Profile.
                      </div>
                    )}

                    {!linksStatus?.emailVerified && user?.email && (
                      <button
                        type="button"
                        onClick={() => resendVerification(user.email)}
                        disabled={resendBusy}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                          padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: resendBusy ? "not-allowed" : "pointer",
                          background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                          opacity: resendBusy ? 0.6 : 1,
                        }}
                      >
                        {resendBusy ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                        Send verification email
                      </button>
                    )}
                    {verifyMsg && section === "get-links" && (
                      <p style={{ fontSize: 11, margin: "0 0 14px", color: verifyMsg.includes("sent") || verifyMsg.includes("inbox") ? C.success : C.danger }}>
                        {verifyMsg}
                      </p>
                    )}

                    <Divider />
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                      <ShieldCheck size={11} /> Two-factor authentication
                    </p>
                    <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 12px" }}>
                      Optional but recommended. When enabled, claiming a link requires your authenticator code.
                    </p>

                    {linksStatus?.totpEnabled ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8,
                          background: "hsl(145 50% 42% / 0.1)", border: "1px solid hsl(145 50% 42% / 0.25)",
                          color: C.success, fontSize: 12, fontWeight: 600,
                        }}>
                          <ShieldCheck size={12} /> 2FA is on
                        </div>
                        <Field type="password" value={disablePassword} onChange={(e: any) => setDisablePassword(e.target.value)} placeholder="Account password" icon={Lock} />
                        <Field value={disableCode} onChange={(e: any) => setDisableCode(e.target.value)} placeholder="6-digit code" icon={KeyRound} maxLength={6} />
                        <button
                          onClick={disableTotp}
                          disabled={totpBusy}
                          style={{
                            alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            background: "hsl(0 60% 50% / 0.1)", border: "1px solid hsl(0 60% 50% / 0.25)", color: C.danger,
                            opacity: totpBusy ? 0.6 : 1,
                          }}
                        >
                          Disable 2FA
                        </button>
                    </div>
                    ) : totpSetup ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                        <img src={totpSetup.qrDataUrl} alt="2FA QR" style={{ width: 160, height: 160, borderRadius: 10, alignSelf: "flex-start", background: "#fff" }} />
                        <p style={{ margin: 0, fontSize: 11, color: C.textSub, wordBreak: "break-all" }}>
                          Secret: <span style={{ color: C.text, fontFamily: "monospace" }}>{totpSetup.secret}</span>
                        </p>
                        <Field value={totpCode} onChange={(e: any) => setTotpCode(e.target.value)} placeholder="Enter code from app" icon={KeyRound} maxLength={6} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={enableTotp}
                            disabled={totpBusy || totpCode.trim().length !== 6}
                            style={{
                              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                              background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                              opacity: totpBusy ? 0.6 : 1,
                            }}
                          >
                            Confirm & enable
                          </button>
                          <button
                            onClick={() => { setTotpSetup(null); setTotpCode(""); }}
                            style={{
                              padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                              background: C.elevated, border: `1px solid ${C.border}`, color: C.textSub,
                            }}
                          >
                            Cancel
                          </button>
                      </div>
                      </div>
                    ) : (
                      <button
                        onClick={startTotpSetup}
                        disabled={totpBusy || !linksStatus?.emailVerified}
                        style={{
                          display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 8, marginBottom: 16,
                          background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                          fontSize: 12, fontWeight: 600, cursor: linksStatus?.emailVerified ? "pointer" : "not-allowed",
                          opacity: !linksStatus?.emailVerified || totpBusy ? 0.55 : 1,
                        }}
                      >
                        <Shield size={12} /> Set up 2FA
                      </button>
                    )}

                    <Divider />
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 10px" }}>
                      Request a link
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>Blocker</label>
                      <select
                        value={selectedBlocker}
                        onChange={(e) => setSelectedBlocker(e.target.value)}
                        style={{
                          width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                          color: C.text, fontSize: 12, padding: "9px 11px", outline: "none",
                        }}
                      >
                        {(linksStatus?.blockers || []).map((b) => (
                          <option key={b} value={b} disabled={linksStatus?.availableBlockers && !linksStatus.availableBlockers.includes(b)}>
                            {b.replace(/_/g, " ")}
                            {linksStatus?.availableBlockers && !linksStatus.availableBlockers.includes(b) ? " (empty)" : ""}
                          </option>
                        ))}
                      </select>
                      {linksStatus?.totpEnabled && (
                        <Field value={claimCode} onChange={(e: any) => setClaimCode(e.target.value)} placeholder="Authenticator code" icon={KeyRound} maxLength={6} />
                      )}
                      <button
                        onClick={claimLink}
                        disabled={
                          claimBusy ||
                          !linksStatus?.emailVerified ||
                          (linksStatus?.remaining ?? 0) <= 0 ||
                          (linksStatus?.totpEnabled && claimCode.trim().length !== 6)
                        }
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                          padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                          opacity: claimBusy || !linksStatus?.emailVerified || (linksStatus?.remaining ?? 0) <= 0 ? 0.55 : 1,
                        }}
                      >
                        {claimBusy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                        Get link
                      </button>
                </div>

                    {(linksErr || linksMsg) && (
                      <p style={{ fontSize: 11, margin: "0 0 14px", color: linksErr ? C.danger : C.success }}>
                        {linksErr || linksMsg}
                      </p>
                    )}

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      This week&apos;s links
                    </p>
                    {!linksStatus?.claims?.length ? (
                      <p style={{ fontSize: 12, color: C.textMuted }}>No links claimed this week yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {linksStatus.claims.map((c) => (
                          <div
                            key={c.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
                              background: C.surface, border: `1px solid ${C.border}`,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 12, color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.link}
                              </p>
                              <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                                {c.blocker.replace(/_/g, " ")} · {new Date(c.claimedAt).toLocaleString()}
                              </p>
                            </div>
                            <button
                              onClick={() => copyText(c.link)}
                              title="Copy"
                              style={{
                                width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                                background: C.elevated, border: `1px solid ${C.border}`, color: C.textSub, cursor: "pointer",
                              }}
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {section === "appearance" && <AppearanceSettings {...panelProps} />}

            {section === hrefs.modeP() && <ProxySettings {...panelProps} />}

            {section === "cloaking" && (
              <div style={{ maxWidth: "440px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Cloaking</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Disguise the tab to look like another site</p>

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>Quick Presets</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "18px" }}>
                  {SITE_PRESETS.map(p => {
                    const active = s.siteTitle === p.label;
                    return (
                      <button key={p.id} onClick={() => { setVal("siteTitle", p.label); setVal("siteLogo", p.favicon); }}
                        style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 11px", borderRadius: "8px", cursor: "pointer",
                          background: active ? `${C.accentDim}40` : C.surface,
                          border: `1px solid ${active ? C.borderFocus : C.border}`,
                          color: active ? C.accent : C.textSub, fontSize: "11px", transition: "all 0.15s" }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = C.accentDim; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = C.border; }}>
                        <img src={p.favicon} style={{ width: "12px", height: "12px" }} alt=""
                          onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                  <Field label="Custom tab title" value={s.siteTitle || ""} onChange={(e: any) => setVal("siteTitle", e.target.value)} placeholder="e.g. Google Classroom" />
                  <Field label="Custom favicon URL" value={s.siteLogo || ""} onChange={(e: any) => setVal("siteLogo", e.target.value)} placeholder="https://..." icon={Lock} />
                </div>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>About:blank / blob cloak</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>
                  Use Behavior → Autocloak for the Classroom leftover-tab trick. Focus-based title swapping is off.
                </p>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>About:Blank</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>
                  Open the site disguised inside an about:blank popup. Any PeteZah link ending in <code style={{ fontSize: 10 }}>/#blank</code> does this automatically.
                </p>
                <button onClick={openAboutBlank} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "8px", marginBottom: "18px",
                  background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                  color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                }}>
                  <ExternalLink size={12} />
                  Open in about:blank
                </button>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>Panic Key</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>Press a key to instantly redirect the browser</p>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "10px", marginBottom: "4px" }}>
                  <Field label="Key" value={s.panicKey || ""} onChange={(e: any) => setVal("panicKey", e.target.value)} placeholder="q" maxLength={1} icon={KeyRound} />
                  <Field label="Redirect URL" value={s.panicUrl || ""} onChange={(e: any) => setVal("panicUrl", e.target.value)} placeholder="https://google.com" icon={Lock} />
                </div>
                <ApplyBtn saved={settingsSaved} onClick={applySettings} />
              </div>
            )}

            {section === "behavior" && <BehaviorSettings {...panelProps} />}

            {section === "shortcuts" && <ShortcutsSettings C={C} />}

            {section === "mentions" && (
              <div style={{ maxWidth: "560px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Mentions</h2>
                    <p style={{ fontSize: 11, color: C.textSub, margin: 0 }}>
                      When someone @mentions you in updates, changelogs, or comments.
                      {mentionsUnread ? ` · ${mentionsUnread} unread` : ""}
                    </p>
                  </div>
                  {mentionsUnread > 0 ? (
                    <button
                      type="button"
                      onClick={() => void markMentionsRead()}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        color: C.textSub,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Mark all read
                    </button>
                  ) : null}
                </div>
                {mentionsLoading ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>Loading…</p>
                ) : mentions.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>No mentions yet. Try @username in a post.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {mentions.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (n.refType === "changelog") onNavigate("petezah://changelog");
                          else if (n.refType === "feedback" || n.refType === "comment") onNavigate("petezah://feedback");
                          else if (n.actorUsername) onNavigate(`petezah://user/@${n.actorUsername}`);
                          void markMentionsRead();
                        }}
                        style={{
                          textAlign: "left",
                          padding: "12px 14px",
                          borderRadius: 10,
                          background: n.read ? C.surface : C.accentDim,
                          border: `1px solid ${n.read ? C.border : C.borderFocus}`,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 650, color: C.accent }}>
                            @{n.actorUsername || "someone"}
                          </span>
                          <span style={{ fontSize: 10, color: C.textMuted }}>mentioned you</span>
                          {!n.read ? (
                            <span
                              style={{
                                marginLeft: "auto",
                                width: 7,
                                height: 7,
                                borderRadius: 99,
                                background: C.accent,
                              }}
                            />
                          ) : null}
                        </div>
                        <MentionsText
                          text={n.body || ""}
                          onNavigate={onNavigate}
                          style={{ fontSize: 11, color: C.textSub, display: "block" }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "data" && (
              <div style={{ maxWidth: "400px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Data</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Import, export, or reset your local data</p>

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>Account sync</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>
                  Themes, games, bookmarks, and other prefs sync when you are signed in.
                </p>
                <div style={{ display: "flex", gap: "6px", marginBottom: syncNote ? "8px" : "16px", flexWrap: "wrap" }}>
                  <button disabled={syncBusy} onClick={() => runManualSync("pull")} style={{
                    flex: 1, minWidth: "120px", padding: "9px 12px", borderRadius: "8px",
                    background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                    fontSize: "11px", fontWeight: 600, cursor: syncBusy ? "wait" : "pointer", opacity: syncBusy ? 0.6 : 1,
                  }}>
                    {syncBusy ? "Working…" : "Download"}
                  </button>
                  <button disabled={syncBusy} onClick={() => runManualSync("push")} style={{
                    flex: 1, minWidth: "120px", padding: "9px 12px", borderRadius: "8px",
                    background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                    fontSize: "11px", fontWeight: 600, cursor: syncBusy ? "wait" : "pointer", opacity: syncBusy ? 0.6 : 1,
                  }}>
                    Upload
                  </button>
                </div>
                {syncNote && (
                  <p style={{ fontSize: "11px", color: C.success, margin: "0 0 14px" }}>{syncNote}</p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { label: "Export Data", desc: "Download settings as JSON", icon: Download, onClick: exportData },
                  ].map(item => (
                    <button key={item.label} onClick={item.onClick} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                      background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", width: "100%", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <item.icon size={13} style={{ color: C.accent }} />
                      <div style={{ textAlign: "left" }}>
                        <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>{item.label}</p>
                        <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>{item.desc}</p>
                      </div>
                    </button>
                  ))}

                  <label style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                    background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                    <Upload size={13} style={{ color: C.accent }} />
                    <div>
                      <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>Import Data</p>
                      <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>Restore settings from a JSON file</p>
                    </div>
                    <input type="file" accept=".json" style={{ display: "none" }} onChange={importData} />
                  </label>

                  <Divider />

                  <button onClick={resetData} style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                    background: "transparent", border: `1px solid hsl(0 60% 50% / 0.15)`, cursor: "pointer", width: "100%", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "hsl(0 60% 50% / 0.07)"; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.15)"; }}>
                    <Trash2 size={13} style={{ color: C.danger }} />
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: "12px", fontWeight: 500, color: C.danger, margin: 0 }}>Reset All Data</p>
                      <p style={{ fontSize: "10px", color: "hsl(0 60% 40%)", margin: 0 }}>Clear all local settings — cannot be undone</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {section === "admin" && isAdmin && (
              <div style={{ maxWidth: "720px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div>
                    <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: 0 }}>Mission Control</h2>
                    <p style={{ fontSize: "11px", color: C.textSub, margin: "2px 0 0" }}>
                      Live snapshot · refreshes every 15s
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {overview?.security?.systemState && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                        padding: "3px 8px", borderRadius: 6,
                        background: overview.security.systemState === "ATTACK" || overview.security.killSwitch
                          ? "hsl(0 65% 45% / 0.15)"
                          : overview.security.systemState === "BUSY"
                            ? "hsl(38 80% 45% / 0.15)"
                            : "hsl(152 45% 40% / 0.15)",
                        color: overview.security.systemState === "ATTACK" || overview.security.killSwitch
                          ? "hsl(0 70% 68%)"
                          : overview.security.systemState === "BUSY"
                            ? "hsl(38 80% 62%)"
                            : "hsl(152 50% 62%)",
                        border: `1px solid ${overview.security.systemState === "ATTACK" || overview.security.killSwitch
                          ? "hsl(0 65% 50% / 0.35)"
                          : overview.security.systemState === "BUSY"
                            ? "hsl(38 80% 50% / 0.35)"
                            : "hsl(152 45% 45% / 0.35)"}`,
                      }}>
                        {overview.security.killSwitch ? "KILL" : overview.security.systemState}
                      </span>
                    )}
                    {overviewLoading && <Loader2 size={12} className="animate-spin" style={{ color: C.accent }} />}
                  </div>
                </div>

                {overviewErr && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, marginBottom: 10,
                    background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)", color: "hsl(0 60% 68%)", fontSize: 11 }}>
                    <AlertCircle size={12} />{overviewErr}
                  </div>
                )}

                {!overview && overviewLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : overview ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="admin-overview-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                      {[
                        {
                          title: "Users",
                          icon: Users,
                          rows: [
                            ["Total", overview.users?.total ?? 0],
                            ["Today", overview.users?.newToday ?? 0],
                            ["Week", overview.users?.newWeek ?? 0],
                            ["Month", overview.users?.newMonth ?? 0],
                            ["Verified", overview.users?.verified ?? 0],
                            ["Unverified", overview.users?.unverified ?? 0],
                          ],
                        },
                        {
                          title: "Usage today",
                          icon: Activity,
                          rows: [
                            [marks.a(), overview.usage?.[hrefs.kindG()] ?? 0],
                            [marks.b(), overview.usage?.[hrefs.modeP()] ?? 0],
                            ["AI", overview.usage?.ai ?? 0],
                            ["Movies", overview.usage?.movies ?? 0],
                            ["Music", overview.usage?.music ?? 0],
                            ["Chat", overview.usage?.chat ?? 0],
                            ["Firefox VM", overview.usage?.firefox_vm ?? 0],
                          ],
                        },
                        {
                          title: "System",
                          icon: Server,
                          rows: [
                            ["CPU", `${overview.system?.cpuPercent ?? 0}%`],
                            ["RAM", `${overview.system?.memory?.rssMb ?? 0} MB`],
                            ["Sys mem", `${overview.system?.memory?.systemUsedPct ?? 0}%`],
                            ["API avg", overview.system?.latency?.avgMs != null ? `${overview.system.latency.avgMs} ms` : "—"],
                            ["API p95", overview.system?.latency?.p95Ms != null ? `${overview.system.latency.p95Ms} ms` : "—"],
                            ["DB", overview.system?.db?.ok ? `${overview.system.db.latencyMs} ms` : "down"],
                            ["WS", overview.security?.totalWS ?? 0],
                          ],
                        },
                      ].map((col) => (
                        <div key={col.title} style={{
                          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 11px",
                          minHeight: 0,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <col.icon size={12} style={{ color: C.accent }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{col.title}</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {col.rows.map(([label, value]) => (
                              <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                                <span style={{ fontSize: 10, color: C.textMuted }}>{label}</span>
                                <span style={{ fontSize: 12, fontWeight: 650, color: C.text, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="admin-overview-pair" style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                    }}>
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <Cpu size={12} style={{ color: C.accent }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Pressure</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
                          {[
                            ["Req/min", overview.security?.requestRatePerMinute ?? 0],
                            ["Blocks", overview.security?.mitigatedCount ?? 0],
                            ["PoW", overview.security?.powDifficulty ?? 0],
                            ["Uptime", `${Math.floor((overview.uptimeSec || 0) / 3600)}h`],
                          ].map(([l, v]) => (
                            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                              <span style={{ fontSize: 10, color: C.textMuted }}>{l}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <Database size={12} style={{ color: C.accent }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Cache / edge</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 10, color: C.textMuted }}>Status</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{overview.system?.cache?.status || "—"}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 10, color: C.textMuted }}>Compression</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{overview.system?.cache?.compression ? "on" : "off"}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 10, color: C.textMuted }}>XDP blocks</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{overview.system?.cache?.xdpBlocks ?? 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{
                      background: "hsla(216, 28%, 8%, 0.9)",
                      border: `1px solid ${overview.security?.killSwitch || overview.security?.forceAttackMode ? "hsl(0 60% 45% / 0.35)" : C.border}`,
                      borderRadius: 10, padding: "11px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <ShieldAlert size={13} style={{ color: overview.security?.killSwitch ? "hsl(0 70% 62%)" : C.accent }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Security controls</span>
                        </div>
                        {!isOwner && (
                          <span style={{ fontSize: 10, color: C.textMuted }}>Owner only</span>
                        )}
                      </div>
                      <div className="admin-overview-pair" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <button
                          type="button"
                          disabled={!isOwner || secBusy}
                          onClick={() => {
                            setSecErr("");
                            setSecPassword("");
                            setSecModal({ action: overview.security?.forceAttackMode ? "attack-off" : "attack-on" });
                          }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                            padding: "10px 11px", borderRadius: 8, cursor: !isOwner || secBusy ? "not-allowed" : "pointer",
                            opacity: !isOwner ? 0.55 : 1,
                            background: overview.security?.forceAttackMode ? "hsl(0 60% 45% / 0.12)" : C.surface,
                            border: `1px solid ${overview.security?.forceAttackMode ? "hsl(0 60% 50% / 0.35)" : C.border}`,
                            color: C.text, textAlign: "left",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 650 }}>Attack mode</div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                              {overview.security?.forceAttackMode ? "Forced on" : "Auto / off"}
                            </div>
                          </div>
                          <Power size={14} style={{ color: overview.security?.forceAttackMode ? "hsl(0 70% 62%)" : C.textMuted }} />
                        </button>
                        <button
                          type="button"
                          disabled={!isOwner || secBusy}
                          onClick={() => {
                            setSecErr("");
                            setSecPassword("");
                            setSecModal({ action: overview.security?.killSwitch ? "kill-off" : "kill-on" });
                          }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                            padding: "10px 11px", borderRadius: 8, cursor: !isOwner || secBusy ? "not-allowed" : "pointer",
                            opacity: !isOwner ? 0.55 : 1,
                            background: overview.security?.killSwitch ? "hsl(0 60% 45% / 0.12)" : C.surface,
                            border: `1px solid ${overview.security?.killSwitch ? "hsl(0 60% 50% / 0.35)" : C.border}`,
                            color: C.text, textAlign: "left",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 650 }}>Kill switch</div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                              {overview.security?.killSwitch ? "Active" : "Standby"}
                            </div>
                          </div>
                          <Zap size={14} style={{ color: overview.security?.killSwitch ? "hsl(0 70% 62%)" : C.textMuted }} />
                        </button>
                      </div>
                      {secErr && (
                        <p style={{ fontSize: 11, color: "hsl(0 60% 68%)", margin: "8px 0 0" }}>{secErr}</p>
                      )}
                    </div>

                    {secModal && (
                      <div style={{
                        position: "fixed", inset: 0, zIndex: 80, background: "hsla(216, 40%, 4%, 0.55)",
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
                      }} onClick={() => !secBusy && setSecModal(null)}>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "100%", maxWidth: 320, background: "hsla(216, 32%, 8%, 0.96)",
                            border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
                            boxShadow: "0 24px 48px hsla(216, 50%, 4%, 0.55)",
                          }}
                        >
                          <h3 style={{ margin: "0 0 4px", fontSize: 14, color: C.text, fontWeight: 700 }}>
                            Confirm with password
                          </h3>
                          <p style={{ margin: "0 0 12px", fontSize: 11, color: C.textSub, lineHeight: 1.4 }}>
                            {secModal.action === "attack-on" && "Turn on attack mode. Untrusted traffic will be rejected."}
                            {secModal.action === "attack-off" && "Turn off forced attack mode."}
                            {secModal.action === "kill-on" && "Activate kill switch. Proxy and most APIs will stop until you disable it."}
                            {secModal.action === "kill-off" && "Deactivate kill switch and restore service."}
                          </p>
                          <input
                            type="password"
                            autoFocus
                            value={secPassword}
                            onChange={(e) => setSecPassword(e.target.value)}
                            placeholder="Account password"
                            style={{
                              width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8,
                              border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13,
                              outline: "none", marginBottom: 10,
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void confirmSecurityAction();
                            }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              disabled={secBusy}
                              onClick={() => setSecModal(null)}
                              style={{
                                flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`,
                                background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={secBusy || !secPassword}
                              onClick={() => void confirmSecurityAction()}
                              style={{
                                flex: 1, padding: "8px", borderRadius: 8, border: `1px solid hsl(0 60% 50% / 0.4)`,
                                background: "hsl(0 60% 45% / 0.18)", color: C.text, fontSize: 12, fontWeight: 650,
                                cursor: secBusy || !secPassword ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                              }}
                            >
                              {secBusy && <Loader2 size={12} className="animate-spin" />}
                              Confirm
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <style>{`
                  @media (max-width: 640px) {
                    .admin-overview-grid { grid-template-columns: 1fr !important; }
                    .admin-overview-pair { grid-template-columns: 1fr !important; }
                  }
                `}</style>
              </div>
            )}

            {section === "users" && isAdmin && (
              <div style={{ maxWidth: "600px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: 0 }}>Users</h2>
                  <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                    {adminTab === "staff" ? `${staffList.length} team` : adminTab === "rarity" ? `Top ${rarityBoard.length}` : adminSearchActive ? `${adminUsers.length} results` : `${adminTotal} users`}
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>
                  {isOwner ? "Owner — manage team roles and users" : "Manage users and moderate content"}
                </p>
                <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                  {(["users", "staff", "rarity"] as const).map(tab => (
                    <button key={tab} onClick={() => setAdminTab(tab)} style={{
                      padding: "6px 12px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${adminTab === tab ? C.borderFocus : C.border}`,
                      background: adminTab === tab ? C.accentDim : C.surface,
                      color: adminTab === tab ? C.text : C.textMuted,
                    }}>
                      {tab === "users" ? "Users" : tab === "staff" ? "Staff" : "Rarest"}
                    </button>
                  ))}
                </div>
                {adminTab === "rarity" ? (
                  rarityLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                      <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                    </div>
                  ) : rarityBoard.length === 0 ? (
                    <p style={{ fontSize: "11px", color: C.textMuted, textAlign: "center", padding: "24px" }}>No badge unlocks yet</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {rarityBoard.map((row) => (
                        <button
                          key={row.userId}
                          type="button"
                          onClick={() => openUserDetail(row.userId)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
                            background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left",
                          }}
                        >
                          <span style={{
                            width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, background: C.accentDim, color: C.accent, flexShrink: 0,
                          }}>
                            #{row.rank}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 650, color: C.text }}>
                              {row.username || "User"}
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                              score {row.score} · {row.badgeCount} badges · top {row.topRarity}
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            {row.badges.slice(0, 3).map((b) => (
                              <BadgeChip key={b.id} badge={{ ...b, unlocked: true }} size={20} />
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : adminTab === "staff" ? (
                  staffLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                      <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                    </div>
                  ) : staffList.length === 0 ? (
                    <p style={{ fontSize: "11px", color: C.textMuted, textAlign: "center", padding: "24px" }}>No team members yet</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "16px" }}>
                      {staffList.map(u => (
                        <div key={u.id} onClick={() => openUserDetail(u.id)} style={{
                          display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "9px",
                          background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer",
                        }}>
                          <div style={{
                            width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0,
                            background: C.accentDim, border: `1px solid ${C.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: C.accent,
                          }}>
                            {(u.username || "?")[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{u.username || "No username"}</span>
                              <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                                background: `${roleColor(u.is_admin ?? 0, u.is_owner)}18`, color: roleColor(u.is_admin ?? 0, u.is_owner), border: `1px solid ${roleColor(u.is_admin ?? 0, u.is_owner)}30` }}>
                                {roleLabel(u.is_admin ?? 0, u.is_owner)}
                              </span>
                              {u.banned ? <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "4px", background: "hsl(0 60% 50% / 0.1)", color: C.danger }}>Banned</span> : null}
                            </div>
                          </div>
                          {isOwner && u.id !== user.id && !u.is_owner && (
                            <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              {(u.is_admin ?? 0) < 1 && (
                                <button title="Promote to Mod" onClick={() => adminAction(u.id, "promote_mod")} style={iconBtn}>
                                  <Shield size={11} style={{ color: "hsl(165 50% 52%)" }} />
                                </button>
                              )}
                              {(u.is_admin ?? 0) < 2 && (
                                <button title="Promote to Staff" onClick={() => adminAction(u.id, "staff")} style={iconBtn}>
                                  <Users size={11} style={{ color: "hsl(270 55% 65%)" }} />
                                </button>
                              )}
                              {(u.is_admin ?? 0) < 3 && (
                                <button title="Promote to Admin" onClick={() => adminAction(u.id, "promote_admin")} style={iconBtn}>
                                  <ShieldCheck size={11} style={{ color: C.accent }} />
                                </button>
                              )}
                              {(u.is_admin ?? 0) >= 1 && (
                                <button title="Remove role" onClick={() => adminAction(u.id, "demote_admin")} style={iconBtn}>
                                  <ShieldOff size={11} style={{ color: "hsl(38 75% 58%)" }} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                <>
                <input
                  value={adminSearch} onChange={e => {
                    const v = e.target.value;
                    setAdminSearch(v);
                    if (!v.trim() && adminSearchActive) loadAdminUsers(1);
                  }} placeholder="Search by name or email..."
                  style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.text, fontSize: "12px", padding: "8px 12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "16px", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.border)}
                />
                {adminLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {adminUsers.map(u => (
                      <div key={u.id} onClick={() => openUserDetail(u.id)} style={{
                        display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "9px",
                        background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer",
                      }}>
                        <div style={{
                          width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0, overflow: "hidden",
                          background: C.accentDim, border: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: C.accent,
                        }}>
                          {(u.username || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{u.username || "No username"}</span>
                            <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                              background: `${roleColor(u.is_admin ?? 0, u.is_owner)}18`, color: roleColor(u.is_admin ?? 0, u.is_owner), border: `1px solid ${roleColor(u.is_admin ?? 0, u.is_owner)}30` }}>
                              {roleLabel(u.is_admin ?? 0, u.is_owner)}
                            </span>
                            {u.banned ? <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "4px", background: "hsl(0 60% 50% / 0.1)", color: C.danger, border: "1px solid hsl(0 60% 50% / 0.2)" }}>Banned</span> : null}
                          </div>
                          <p style={{ fontSize: "10px", color: C.textMuted, margin: "1px 0 0" }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}
                          </p>
                        </div>
                        {u.id !== user.id && !u.is_owner && (
                          <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            {isOwner && (u.is_admin ?? 0) < 1 && (
                              <button title="Promote to Mod" onClick={() => adminAction(u.id, "promote_mod")} style={iconBtn}>
                                <Shield size={11} style={{ color: "hsl(165 50% 52%)" }} />
                              </button>
                            )}
                            {isOwner && (u.is_admin ?? 0) < 2 && (
                              <button title="Promote to Staff" onClick={() => adminAction(u.id, "staff")} style={iconBtn}>
                                <Users size={11} style={{ color: "hsl(270 55% 65%)" }} />
                              </button>
                            )}
                            {isOwner && (u.is_admin ?? 0) < 3 && (
                              <button title="Promote to Admin" onClick={() => adminAction(u.id, "promote_admin")} style={iconBtn}>
                                <ShieldCheck size={11} style={{ color: C.accent }} />
                              </button>
                            )}
                            {isOwner && (u.is_admin ?? 0) >= 1 && (
                              <button title="Remove role" onClick={() => adminAction(u.id, "demote_admin")} style={iconBtn}>
                                <ShieldOff size={11} style={{ color: "hsl(38 75% 58%)" }} />
                              </button>
                            )}
                            {(u.email_verified ?? 1) !== 1 && !u.banned && (
                              <button title="Verify email" onClick={() => adminAction(u.id, "verify_email")} style={iconBtn}>
                                <Mail size={11} style={{ color: "hsl(145 50% 55%)" }} />
                              </button>
                            )}
                            {(u.email_verified ?? 1) === 1 && !u.banned && (
                              <button title="Suspend" onClick={() => adminAction(u.id, "suspend")} style={iconBtn}>
                                <UserMinus size={11} style={{ color: "hsl(38 75% 58%)" }} />
                              </button>
                            )}
                            {!u.banned ? (
                              <button title="Ban user + IP" onClick={() => adminAction(u.id, "ban")} style={iconBtn}>
                                <Ban size={11} style={{ color: C.danger }} />
                              </button>
                            ) : (
                              <button title="Unban" onClick={() => adminAction(u.id, "unban")} style={iconBtn}>
                                <Check size={11} style={{ color: "hsl(145 50% 55%)" }} />
                              </button>
                            )}
                            <button title="Delete user" onClick={() => { if (confirm(`Delete ${u.username || "this user"}?`)) adminAction(u.id, "delete"); }} style={iconBtn}>
                              <Trash2 size={11} style={{ color: C.danger }} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {adminTab === "users" && !adminSearchActive && adminTotalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "14px" }}>
                    <button disabled={adminPage <= 1 || adminLoading} onClick={() => loadAdminUsers(adminPage - 1)}
                      style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: "11px", cursor: adminPage <= 1 ? "not-allowed" : "pointer", opacity: adminPage <= 1 ? 0.4 : 1 }}>
                      Previous
                    </button>
                    <span style={{ fontSize: "10px", color: C.textMuted }}>{adminPage} / {adminTotalPages}</span>
                    <button disabled={adminPage >= adminTotalPages || adminLoading} onClick={() => loadAdminUsers(adminPage + 1)}
                      style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: "11px", cursor: adminPage >= adminTotalPages ? "not-allowed" : "pointer", opacity: adminPage >= adminTotalPages ? 0.4 : 1 }}>
                      Next
                    </button>
                  </div>
                )}
                </>
                )}
                {typeof document !== "undefined" && createPortal(
                <AnimatePresence>
                  {(selectedUser || detailLoading) && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => { if (!detailLoading) { setSelectedUser(null); setBadgeManageOpen(false); } }}
                        style={{
                          position: "fixed", inset: 0, zIndex: 10000,
                          background: "hsla(216, 45%, 4%, 0.72)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: "max(16px, 4vh) 16px",
                          backdropFilter: "blur(6px)",
                        }}
                      >
                        <motion.div
                          initial={{ scale: 0.96, opacity: 0, y: 10 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={{ scale: 0.97, opacity: 0, y: 6 }}
                          transition={{ duration: 0.2 }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "100%",
                            maxWidth: badgeManageOpen ? 480 : 420,
                            maxHeight: "min(86vh, 720px)",
                            overflowY: "auto",
                            background: "linear-gradient(165deg, hsla(216, 28%, 11%, 0.98), hsla(220, 30%, 7%, 0.98))",
                            border: `1px solid ${C.border}`,
                            borderRadius: 18,
                            padding: 22,
                            boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
                          }}
                        >
                        {detailLoading ? (
                            <div style={{ display: "flex", justifyContent: "center", padding: 28 }}>
                            <Loader2 size={20} className="animate-spin" style={{ color: C.accent }} />
                          </div>
                        ) : selectedUser && (
                          <>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                                <div>
                                  <h3 style={{ fontSize: 16, fontWeight: 720, color: C.text, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                                    Account
                                  </h3>
                                  <p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>Reveal fields on demand</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => { setSelectedUser(null); setBadgeManageOpen(false); }}
                                  style={{
                                    width: 30, height: 30, borderRadius: 9, border: `1px solid ${C.border}`,
                                    background: C.elevated, color: C.textSub, cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}
                                >
                                  <XIcon size={14} />
                                </button>
                              </div>
                              <div style={{
                                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14,
                              }}>
                                {[
                                ["Role", roleLabel(selectedUser.is_admin ?? 0, selectedUser.is_owner)],
                                ["Verified", selectedUser.email_verified ? "Yes" : "No"],
                                ["Banned", selectedUser.banned ? "Yes" : "No"],
                                  ["Joined", selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : "—"],
                              ].map(([label, val]) => (
                                  <div key={label} style={{
                                    padding: "10px 11px", borderRadius: 11, background: C.elevated, border: `1px solid ${C.border}`,
                                  }}>
                                    <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>{label}</p>
                                    <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 600, color: C.text }}>{val}</p>
                                </div>
                              ))}
                            </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 11 }}>
                                {([
                                  ["username", "Name"],
                                  ["email", "Email"],
                                  ["ip", "IP"],
                                  ["school", "School"],
                                  ["age", "Age"],
                                  ["bio", "Bio"],
                                  ["id", "ID"],
                                  ["settings", "Local storage"],
                                ] as const).map(([field, label]) => (
                                  <div key={field} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ color: C.textMuted, minWidth: 88, flexShrink: 0, paddingTop: 4 }}>{label}</span>
                                    {revealMap[field] != null ? (
                                      <span style={{ color: C.text, wordBreak: "break-all", whiteSpace: "pre-wrap", flex: 1, fontFamily: field === "settings" ? "ui-monospace, monospace" : "inherit", fontSize: field === "settings" ? 10 : 11 }}>
                                        {revealMap[field] || "—"}
                                        {field === "settings" && revealTrunc ? " (truncated)" : ""}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={revealBusy === field}
                                        onClick={() => revealField(field)}
                                        style={{
                                          padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.borderFocus}`,
                                          background: C.accentDim, color: C.accent, fontSize: 10, fontWeight: 650,
                                          cursor: revealBusy === field ? "wait" : "pointer",
                                        }}
                                      >
                                        {revealBusy === field ? "Loading" : "Reveal"}
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {(selectedUser.email_verified ?? 1) !== 1 && selectedUser.id !== user.id && !selectedUser.is_owner && (
                                <button
                                  type="button"
                                  onClick={() => adminAction(selectedUser.id, "verify_email")}
                                  style={{
                                    marginTop: 12, width: "100%", padding: "8px", borderRadius: 10,
                                    border: `1px solid ${C.borderFocus}`, background: C.accentDim, color: C.accent,
                                    fontSize: 12, fontWeight: 650, cursor: "pointer",
                                  }}
                                >
                                  Verify email
                                </button>
                              )}
                              {!!selectedUser.achievements?.length && (
                                <div style={{ marginTop: 16 }}>
                                  <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted }}>
                                    Badges
                                  </p>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 140, overflowY: "auto" }}>
                                    {selectedUser.achievements.map((b) => (
                                      <BadgeChip key={b.id} badge={b} size={26} showName />
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                                <button onClick={openBadgeManager}
                                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.borderFocus}`, background: C.accentDim, color: C.accent, fontSize: 12, fontWeight: 650, cursor: "pointer" }}>
                                  Manage badges
                                </button>
                                <button onClick={() => { setSelectedUser(null); setBadgeManageOpen(false); }}
                                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.elevated, color: C.text, fontSize: 12, cursor: "pointer" }}>
                              Close
                            </button>
                              </div>
                              {badgeManageOpen && (
                                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                                  <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted }}>
                                    Grant / revoke
                                  </p>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 220, overflowY: "auto" }}>
                                    {(badgeCatalog.length ? badgeCatalog : selectedUser.achievements || []).map((b) => {
                                      const owned = !!selectedUser.achievements?.some((x) => x.id === b.id);
                                      return (
                                        <div key={b.id} style={{
                                          display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8,
                                          background: C.elevated, border: `1px solid ${C.border}`,
                                        }}>
                                          <BadgeChip badge={{ ...b, unlocked: owned }} size={22} locked={!owned} />
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: 11, fontWeight: 650, color: C.text }}>{b.name}</p>
                                            <p style={{ margin: 0, fontSize: 9, color: C.textMuted, textTransform: "capitalize" }}>{b.rarity}{b.manual ? " · manual" : ""}</p>
                                          </div>
                                          <button
                                            disabled={badgeBusy}
                                            onClick={() => toggleUserBadge(b.id, !owned)}
                                            style={{
                                              padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 650, cursor: "pointer",
                                              border: `1px solid ${owned ? "hsl(0 60% 50% / 0.35)" : C.borderFocus}`,
                                              background: owned ? "hsl(0 60% 50% / 0.12)" : C.accentDim,
                                              color: owned ? C.danger : C.accent,
                                            }}
                                          >
                                            {owned ? "Revoke" : "Grant"}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                          </>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>
            )}

            {section === "live" && isAdmin && (
              <div style={{ maxWidth: "620px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Live Sites</h2>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                    {liveClients} online · {liveUnique} unique
                  </span>
                </div>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px" }}>
                  Aggregated proxied URLs by active viewers — top {liveSites.length || 250}, live refresh
                </p>
                {liveLoading && liveSites.length === 0 ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : liveSites.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: 28 }}>No active proxied sites right now</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "70vh", overflowY: "auto" }}>
                    {liveSites.map((site) => (
                      <div key={site.url} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
                        background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <Globe2 size={12} style={{ color: C.accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {site.url}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            {site.viewers || 1} viewer{(site.viewers || 1) === 1 ? "" : "s"}
                            {site.username ? ` · @${site.username}` : ""}
                            {" · "}
                            {Math.max(0, Math.round((Date.now() - site.updatedAt) / 1000))}s ago
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "firefox-vm" && isAdmin && (
              <div style={{ maxWidth: "620px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Monitor size={14} style={{ color: C.accent }} />
                    Firefox VM
                  </h2>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                    {ffLiveCount} active
                  </span>
                </div>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px" }}>
                  Live sessions (heartbeat) · history searchable by day
                </p>
                {ffLive.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 14px" }}>No active Firefox VM sessions</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "28vh", overflowY: "auto", marginBottom: 14 }}>
                    {ffLive.map((s) => (
                      <div key={s.sessionId} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
                        background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <Monitor size={12} style={{ color: C.accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, color: C.text }}>
                            {s.username ? `@${s.username}` : s.userId.slice(0, 8)}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            opened {new Date(s.startedAt).toLocaleString()} · last seen {Math.max(0, Math.round((Date.now() - s.lastSeen) / 1000))}s ago
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <input
                    type="date"
                    value={ffDay}
                    onChange={(e) => setFfDay(e.target.value)}
                    style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                      color: C.text, fontSize: 12, padding: "7px 10px", outline: "none",
                    }}
                  />
                  <input
                    value={ffQuery}
                    onChange={(e) => setFfQuery(e.target.value)}
                    placeholder="Search user / id"
                    style={{
                      flex: 1, minWidth: 120, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                      color: C.text, fontSize: 12, padding: "7px 10px", outline: "none",
                    }}
                  />
                  <button
                    onClick={loadFfHistory}
                    disabled={ffHistoryLoading}
                    style={{
                      padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${C.borderFocus}`, background: C.accentDim, color: C.accent,
                      opacity: ffHistoryLoading ? 0.6 : 1,
                    }}
                  >
                    {ffHistoryLoading ? "…" : "Search"}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: C.textMuted, margin: "0 0 8px" }}>
                  {ffHistoryTotal} session{ffHistoryTotal === 1 ? "" : "s"} on {ffDay}
                </p>
                {ffHistory.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>No sessions for this day</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "42vh", overflowY: "auto" }}>
                    {ffHistory.map((s) => (
                      <div key={s.sessionId} style={{
                        padding: "9px 12px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <p style={{ margin: 0, fontSize: 12, color: C.text }}>
                          {s.username ? `@${s.username}` : s.userId.slice(0, 8)}
                          {s.active ? (
                            <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: C.success }}>LIVE</span>
                          ) : null}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                          {new Date(s.startedAt).toLocaleString()}
                          {" → "}
                          {s.endedAt ? new Date(s.endedAt).toLocaleString() : "open"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === hrefs.gsSec() && isAdmin && (
              <div style={{ maxWidth: "680px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 10, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Gamepad2 size={14} style={{ color: C.accent }} />
                    {marks.c()}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate(hrefs.g() + "?adminEdit=1")}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontSize: 11, fontWeight: 650, padding: "6px 10px", borderRadius: 8,
                        background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent, cursor: "pointer",
                      }}
                    >
                      <Pencil size={11} /> {hrefs.editG()}
                    </button>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                      {(gameLive?.clients ?? 0)} live · {(gameStats?.totals?.totalPlays ?? 0)} plays
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px" }}>
                  Top 50 most played · search any title · live list/viewer presence · {hrefs.editG()} for global add/suspend
                </p>

                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 14,
                }}>
                  {[
                    ["On games list", gameLive?.onList ?? 0],
                    ["In game viewer", gameLive?.onViewer ?? 0],
                    ["Tracked games", gameStats?.totals?.trackedGames ?? 0],
                  ].map(([label, val]) => (
                    <div key={String(label)} style={{
                      padding: "10px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`,
                    }}>
                      <p style={{ margin: 0, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 16, fontWeight: 700, color: C.text }}>{val}</p>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                  Live on games
                </p>
                {!gameLive?.active?.length ? (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 14px" }}>Nobody on games right now</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "22vh", overflowY: "auto", marginBottom: 14 }}>
                    {gameLive.active.map((row: any) => (
                      <div key={`${row.gameId || row.label}-${row.surface}`} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        padding: "8px 12px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.label || row.gameId || "Unknown"}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            {row.surface === "list" ? "Games list" : "Game page"}
                            {row.username ? ` · @${row.username}` : ""}
                          </p>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, flexShrink: 0 }}>{row.viewers}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                  Top 50
                </p>
                {gameStatsLoading && !gameStats ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 28 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "36vh", overflowY: "auto", marginBottom: 16 }}>
                    {(gameStats?.top || []).map((g: any, i: number) => (
                      <div key={g.gameId} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                        background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <span style={{ width: 18, fontSize: 10, color: C.textMuted, flexShrink: 0 }}>{i + 1}</span>
                        {g.imageUrl ? (
                          <img src={g.imageUrl} alt="" loading="lazy" decoding="async" style={{ width: 28, height: 22, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 28, height: 22, borderRadius: 5, background: C.elevated, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label || g.gameId}</p>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{g.plays}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                  Search a game
                </p>
                <input
                  value={gameSearch}
                  onChange={(e) => setGameSearch(e.target.value)}
                  placeholder="Game name…"
                  style={{
                    width: "100%", boxSizing: "border-box", marginBottom: 10,
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 10px", outline: "none",
                  }}
                />
                {gameSearch.trim() && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "28vh", overflowY: "auto" }}>
                    {(gameStats?.search || []).length === 0 ? (
                      <p style={{ fontSize: 12, color: C.textMuted }}>No matches</p>
                    ) : (
                      (gameStats.search || []).map((g: any) => (
                        <div key={g.gameId} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          padding: "8px 12px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                        }}>
                          <span style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label || g.gameId}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, flexShrink: 0 }}>{g.plays} plays</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "18px 0 8px" }}>
                  Suspended games ({excludedGames.length})
                </p>
                {!excludedGames.length ? (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>No globally suspended games</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "28vh", overflowY: "auto" }}>
                    {excludedGames.map((g: any) => (
                      <div key={g.gameId} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                        background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        {g.imageUrl ? (
                          <img src={g.imageUrl} alt="" loading="lazy" decoding="async" style={{ width: 28, height: 22, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 28, height: 22, borderRadius: 5, background: C.elevated, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label || g.gameId}</p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            {g.excludedAt ? new Date(g.excludedAt).toLocaleString() : "Suspended"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={excludedLoading}
                          onClick={() => unsuspendGame(g.gameId)}
                          style={{
                            fontSize: 11, fontWeight: 650, padding: "5px 9px", borderRadius: 7, cursor: "pointer",
                            background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent, flexShrink: 0,
                            opacity: excludedLoading ? 0.6 : 1,
                          }}
                        >
                          Unsuspend
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "link-stats" && isAdmin && (
              <div style={{ maxWidth: "680px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}>
                  <BarChart3 size={14} style={{ color: C.accent }} />
                  Link Stats
                </h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 16px" }}>
                  Distribution across blockers · refreshes every 15s
                </p>
                {linkStatsLoading && !linkStats ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : !linkStats ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>Could not load stats</p>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
                      {[
                        ["Today", linkStats.totals?.today],
                        ["This week", linkStats.totals?.thisWeek],
                        ["Last week", linkStats.totals?.lastWeek],
                        ["All time", linkStats.totals?.allTime],
                        ["Users (week)", linkStats.uniqueUsers?.thisWeek],
                        ["At weekly limit", linkStats.usersAtWeeklyLimit],
                      ].map(([label, val]) => (
                        <div key={String(label)} style={{
                          padding: "12px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`,
                        }}>
                          <p style={{ margin: 0, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: C.text }}>{val ?? 0}</p>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Per blocker (this week)
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16, maxHeight: "28vh", overflowY: "auto" }}>
                      {Object.entries(linkStats.perBlocker?.week || {}).map(([blocker, count]) => (
                        <div key={blocker} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                        }}>
                          <span style={{ fontSize: 12, color: C.text }}>{String(blocker).replace(/_/g, " ")}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{count as number}</span>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Pool sizes
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6, marginBottom: 16 }}>
                      {Object.entries(linkStats.poolSizes || {}).map(([blocker, size]) => (
                        <div key={blocker} style={{
                          padding: "8px 10px", borderRadius: 8, background: C.elevated, border: `1px solid ${C.border}`,
                          display: "flex", justifyContent: "space-between", gap: 8,
                        }}>
                          <span style={{ fontSize: 10, color: C.textSub }}>{String(blocker).replace(/_/g, " ")}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{size as number}</span>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Top users this week
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                      {(linkStats.topUsersWeek || []).length === 0 ? (
                        <p style={{ fontSize: 12, color: C.textMuted }}>None yet</p>
                      ) : (
                        (linkStats.topUsersWeek || []).map((u: any) => (
                          <div key={u.userId} style={{
                            display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8,
                            background: C.surface, border: `1px solid ${C.border}`, fontSize: 12,
                          }}>
                            <span style={{ color: C.text }}>{u.username ? `@${u.username}` : (u.email || u.userId.slice(0, 8))}</span>
                            <span style={{ color: C.accent, fontWeight: 700 }}>{u.count}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Recent claims
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "32vh", overflowY: "auto" }}>
                      {(linkStats.recent || []).map((r: any) => (
                        <div key={r.id} style={{
                          padding: "8px 12px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                        }}>
                          <p style={{ margin: 0, fontSize: 11, color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.link}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                            {r.blocker?.replace(/_/g, " ")} · {r.username ? `@${r.username}` : r.userId?.slice(0, 8)} · {new Date(r.claimedAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {section === "ad-reports" && isAdmin && <AdReportsPanel C={C} />}

            {section === "monitoring" && isAdmin && (
              <div style={{ maxWidth: "560px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Activity size={14} style={{ color: C.accent }} />
                  Monitoring
                </h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 16px" }}>
                  Samples 1 in 4 API requests. Paths are collapsed (ids redacted). Auto-refreshes every 15s.
                </p>
                {routeMetricsLoading && !routeMetrics ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : !routeMetrics ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>No metrics yet</p>
                ) : (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 8,
                        marginBottom: 14,
                      }}
                    >
                      {[
                        ["CPU", `${Number(routeMetrics.cpuPercent || 0).toFixed(1)}%`],
                        ["Heap", `${routeMetrics.memory?.heapUsedMb ?? "—"} MB`],
                        ["RSS", `${routeMetrics.memory?.rssMb ?? "—"} MB`],
                      ].map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 9,
                            background: C.surface,
                            border: `1px solid ${C.border}`,
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            {k}
                          </p>
                          <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: C.text }}>{v}</p>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                      Top routes by time
                    </p>
                    {!routeMetrics.routes?.length ? (
                      <p style={{ fontSize: 12, color: C.textMuted }}>Waiting for API traffic…</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {routeMetrics.routes.map((row) => {
                          const max = routeMetrics.routes[0]?.totalMs || 1;
                          const pct = Math.min(100, Math.round((row.totalMs / max) * 100));
                          return (
                            <div
                              key={row.route}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 9,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 650, color: C.text, wordBreak: "break-all" }}>
                                  {row.route}
                                </span>
                                <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
                                  {row.avgMs} ms avg · {row.count} hits
                                </span>
                              </div>
                              <div style={{ height: 4, borderRadius: 99, background: C.elevated, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: C.accent, opacity: 0.7 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p style={{ marginTop: 10, fontSize: 10, color: C.textMuted }}>
                      Uptime {Math.floor((routeMetrics.uptimeSec || 0) / 3600)}h · samples {routeMetrics.sampled ?? 0}
                    </p>
                  </>
                )}
              </div>
            )}

            {section === "updates" && isAdmin && (
              <div style={{ maxWidth: "560px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Updates</h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 16px" }}>
                  Global popup, specific user, or school IP(s). Each browser dismisses in localStorage — shared IPs still reach everyone. Use @username in the message to mention.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                  <Field label="Title" value={annTitle} onChange={(e: any) => setAnnTitle(e.target.value)} placeholder="What's new" maxLength={120} icon={Megaphone} />
                  <Field label="Target user (optional)" value={annTarget} onChange={(e: any) => setAnnTarget(e.target.value)} placeholder="Leave blank · @username or email" maxLength={64} icon={User} />
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, color: C.textMuted }}>Target IPs (optional)</label>
                    <textarea
                      value={annIps}
                      onChange={(e) => setAnnIps(e.target.value)}
                      placeholder={"One or more IPs, comma or line separated\nExample: 1.2.3.4, 5.6.7.8"}
                      maxLength={800}
                      rows={2}
                      style={{
                        width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "9px 12px", outline: "none", resize: "vertical",
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, color: C.textMuted }}>Message</label>
                    <textarea
                      value={annContent}
                      onChange={(e) => setAnnContent(e.target.value)}
                      placeholder="Update content… @username to mention"
                      maxLength={4000}
                      rows={4}
                      style={{
                        width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                        color: C.text, fontSize: 13, padding: "9px 12px", outline: "none", resize: "vertical",
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      cursor: "pointer",
                      userSelect: "none",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={annImportant}
                      onChange={(e) => setAnnImportant(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 650, color: C.text }}>Important</span>
                      <span style={{ display: "block", fontSize: 10, color: C.textSub, marginTop: 2 }}>
                        Shows an Important tag and requires a 5s wait before dismiss
                      </span>
                    </span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={createAnnouncement} disabled={annBusy} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
                      background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: annBusy ? 0.6 : 1,
                    }}>
                      {annBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      {annTarget.trim()
                        ? "Send to user"
                        : annIps.trim()
                          ? "Send to IPs"
                          : "Publish globally"}
                    </button>
                    {annMsg && <span style={{ fontSize: 11, color: C.success }}>{annMsg}</span>}
                  </div>
                </div>

                <Divider />
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 10px" }}>
                  Posts
                </p>
                {announcements.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>No updates yet</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {announcements.map((a) => (
                      <div key={a.id} style={{
                        padding: "12px 14px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 650, color: C.text }}>{a.title}</span>
                          {a.important ? (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                              background: "hsl(213 55% 40% / 0.2)",
                              color: "hsl(213 80% 78%)",
                            }}>
                              Important
                            </span>
                          ) : null}
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                            background: a.target_user_id
                              ? "hsl(280 50% 45% / 0.18)"
                              : Array.isArray(a.target_ips) && a.target_ips.length
                                ? "hsl(32 60% 40% / 0.2)"
                                : "hsl(210 50% 45% / 0.18)",
                            color: a.target_user_id
                              ? "hsl(280 70% 75%)"
                              : Array.isArray(a.target_ips) && a.target_ips.length
                                ? "hsl(32 80% 70%)"
                                : C.accent,
                          }}>
                            {a.target_user_id
                              ? `@${a.target_username || "user"}`
                              : Array.isArray(a.target_ips) && a.target_ips.length
                                ? `${a.target_ips.length} IP${a.target_ips.length === 1 ? "" : "s"}`
                                : "Global"}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                            background: a.active ? "hsl(145 50% 40% / 0.15)" : "hsl(0 0% 40% / 0.15)",
                            color: a.active ? C.success : C.textMuted,
                          }}>
                            {a.active ? "Active" : "Suspended"}
                          </span>
                        </div>
                        <p style={{ margin: "0 0 10px", fontSize: 11, color: C.textSub, whiteSpace: "pre-wrap" }}>{a.content}</p>
                        <button
                          onClick={() => toggleAnnouncement(a.id, !a.active)}
                          style={{
                            padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            border: `1px solid ${C.border}`, background: C.elevated, color: C.textSub,
                          }}
                        >
                          {a.active ? "Suspend" : "Reactivate"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "ai-prompts" && isAdmin && (
              <div style={{ maxWidth: "560px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 3px" }}>AI Prompts</h2>
                <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 16px" }}>
                  Anonymous first questions only — no usernames, emails, or account links.
                </p>
                {aiPrompts.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted }}>No samples yet</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {aiPrompts.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 9,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 12, color: C.text, lineHeight: 1.45 }}>
                          {p.preview}
                        </p>
                        <p style={{ margin: "6px 0 0", fontSize: 10, color: C.textMuted }}>
                          {new Date(p.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {aboutOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAboutOpen(false)}
              className="no-obfuscate"
              data-no-obfuscate="true"
              style={{
                position: "fixed", inset: 0, zIndex: 10000,
                background: "hsla(216, 45%, 4%, 0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 20, backdropFilter: "blur(8px)",
                fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
              }}
            >
              <motion.div
                initial={{ scale: 0.96, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.97, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="no-obfuscate"
                data-no-obfuscate="true"
                style={{
                  width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto",
                  borderRadius: 20, padding: 24,
                  background: "linear-gradient(165deg, hsla(216, 28%, 11%, 0.98), hsla(220, 30%, 7%, 0.98))",
                  border: `1px solid ${C.border}`,
                  boxShadow: "0 28px 80px rgba(0,0,0,0.5)",
                  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ minWidth: 0, paddingRight: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 720, color: C.text, overflowWrap: "anywhere" }}>About PeteZah</h3>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: C.textSub }}>Credits & legal</p>
                  </div>
                  <button type="button" onClick={() => setAboutOpen(false)} style={{
                    width: 30, height: 30, borderRadius: 9, border: `1px solid ${C.border}`, background: C.elevated,
                    color: C.textSub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <XIcon size={14} />
                  </button>
                </div>
                <p style={{ margin: "0 0 14px", fontSize: 12, color: C.textSub, lineHeight: 1.55, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  PeteZah is a glass browser built for school-friendly browsing, games, music, and more.
                  Huge thanks to the open projects that make the stack possible.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {[
                    ["Mercury Workshop", "Page rewrite engine"],
                    ["Waves Proxy / Mochi", "Proxy transport & networking"],
                    ["Puter", "Firefox WASM virtual machine"],
                    ["Selenite", "HTML5 catalog contributions (third-party / community)"],
                    ["CrazyGames & partners", "Embedded catalog providers"],
                    ["SoundCloud / YouTube", "Official music embed & API surfaces"],
                    ["TMDB", "Movie/TV metadata (not video hosting)"],
                    ["Lucide", "Icon system"],
                    ["Vanta / Three.js", "Atmospheric backgrounds"],
                  ].map(([title, desc]) => (
                    <div key={title} style={{
                      padding: "10px 12px", borderRadius: 12, background: C.elevated, border: `1px solid ${C.border}`,
                    }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 650, color: C.text, overflowWrap: "anywhere" }}>{title}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: C.textMuted, overflowWrap: "anywhere", wordBreak: "break-word" }}>{desc}</p>
                    </div>
                  ))}
                </div>
                <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>Legal</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    ["/terms", "Terms of Service"],
                    ["/privacy-policy", "Privacy Policy"],
                    ["/dmca", "DMCA"],
                  ].map(([href, label]) => (
                    <a
                      key={href}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: "7px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600, textDecoration: "none",
                        background: C.accentDim, border: `1px solid ${C.borderFocus}`, color: C.accent,
                      }}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: "26px", height: "26px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center",
  background: C.elevated, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s",
};