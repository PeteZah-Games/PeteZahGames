import { motion } from "framer-motion";
import { Wifi, Battery, Shield, Flame } from "lucide-react";
import { openNativeWindow } from "@/lib/openTabBridge";

interface StatusBarProps {
  tabCount: number;
  onOpenTrending?: () => void;
}

const LEGAL_LINKS = [
  { key: "tos", label: "ToS", href: "/terms" },
  { key: "privacy", label: "Privacy", href: "/privacy-policy" },
  { key: "dmca", label: "DMCA", href: "/dmca" },
] as const;

const DISCORD_INVITE = "https://discord.gg/cYjHFDguxS";

function DiscordIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export default function StatusBar({ tabCount, onOpenTrending }: StatusBarProps) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 shell-row"
      style={{
        borderTop: "1px solid hsla(210, 40%, 80%, 0.08)",
        fontFamily: "plusjakartasans-obf, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[9px] tracking-wider" style={{ color: "hsla(0,0%,100%,0.45)", fontFamily: "plusjakartasans-obf, ui-sans-serif, system-ui, sans-serif" }}>
          {tabCount} tab{tabCount === 1 ? "" : "s"}
        </span>
        <div className="w-px h-2.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
        <button
          type="button"
          title="Discord"
          onClick={() => openNativeWindow(DISCORD_INVITE)}
          className="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer transition-colors"
          style={{ color: "hsla(0,0%,100%,0.4)", fontFamily: "plusjakartasans-obf, ui-sans-serif, system-ui, sans-serif" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "hsla(235, 86%, 72%, 0.95)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "hsla(0,0%,100%,0.4)"; }}
        >
          <DiscordIcon size={11} />
          <span className="text-[9px]">Discord</span>
        </button>
        <div className="w-px h-2.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
        <div className="flex items-center gap-2.5">
          {LEGAL_LINKS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] transition-colors capitalize"
              style={{ color: "hsla(0,0%,100%,0.32)", textDecoration: "none", fontFamily: "plusjakartasans-obf, ui-sans-serif, system-ui, sans-serif" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "hsla(0,0%,100%,0.7)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "hsla(0,0%,100%,0.32)"; }}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3" style={{ fontFamily: "plusjakartasans-obf, ui-sans-serif, system-ui, sans-serif" }}>
        <button
          type="button"
          title="Trending"
          onClick={() => onOpenTrending?.()}
          className="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer transition-colors"
          style={{ color: "hsla(0, 0%, 96%, 0.72)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "hsla(0, 0%, 100%, 0.95)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "hsla(0, 0%, 96%, 0.72)"; }}
        >
          <Flame size={9} />
          <span className="text-[9px] tracking-wider">Trending</span>
        </button>
        <div className="w-px h-2.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
        <div className="flex items-center gap-1.5">
          <Shield size={9} style={{ color: "hsla(210, 90%, 70%, 0.75)" }} />
          <span className="text-[9px] tracking-wider" style={{ color: "hsla(0,0%,100%,0.45)" }}>Secure</span>
        </div>
        <div className="w-px h-2.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
        <div className="flex items-center gap-2" style={{ color: "hsla(0,0%,100%,0.4)" }}>
          <Wifi size={9} />
          <Battery size={10} />
          <span className="text-[9px] tracking-wider" style={{ color: "hsla(0,0%,100%,0.45)" }}>{time}</span>
        </div>
      </div>
    </motion.div>
  );
}
