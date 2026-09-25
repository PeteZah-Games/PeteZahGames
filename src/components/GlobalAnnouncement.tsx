import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Megaphone } from "lucide-react";
import { MentionsText } from "@/lib/mentions";

const SEEN_KEY = "pz-announcement-seen-ids";
const LEGACY_SEEN_KEY = "pz-announcement-seen";
const IMPORTANT_WAIT_MS = 5000;

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at?: number;
  important?: number | boolean;
}

function readSeen(): Set<string> {
  const out = new Set<string>();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === "string" && id) out.add(id);
        }
      }
    }
    const legacy = localStorage.getItem(LEGACY_SEEN_KEY);
    if (legacy) out.add(legacy);
  } catch {}
  return out;
}

function writeSeen(ids: Set<string>) {
  try {
    const list = [...ids].slice(-80);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {}
}

function isImportant(a: Announcement | null): boolean {
  if (!a) return false;
  return a.important === 1 || a.important === true;
}

export default function GlobalAnnouncement({
  onNavigate,
}: {
  onNavigate?: (url: string) => void;
}) {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const item = queue[0] || null;
  const important = isImportant(item);
  const [waitLeft, setWaitLeft] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements/active", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const list: Announcement[] = Array.isArray(d.announcements)
          ? d.announcements
          : d.announcement
            ? [d.announcement]
            : [];
        const seen = readSeen();
        const pending = list
          .filter((a) => a?.id && !seen.has(a.id))
          .sort((a, b) => Number(isImportant(b)) - Number(isImportant(a)));
        if (pending.length) setQueue(pending);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!item || !important) {
      setWaitLeft(0);
      return;
    }
    setWaitLeft(Math.ceil(IMPORTANT_WAIT_MS / 1000));
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, IMPORTANT_WAIT_MS - (Date.now() - started));
      setWaitLeft(Math.ceil(left / 1000));
      if (left <= 0) window.clearInterval(tick);
    }, 200);
    return () => window.clearInterval(tick);
  }, [item?.id, important]);

  const canDismiss = !important || waitLeft <= 0;

  const dismiss = () => {
    if (!item || !canDismiss) return;
    const seen = readSeen();
    seen.add(item.id);
    writeSeen(seen);
    setQueue((prev) => prev.slice(1));
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pz-update-title"
        >
          <div
            className="absolute inset-0"
            style={{ background: "hsla(220, 40%, 4%, 0.72)", backdropFilter: "blur(10px)" }}
            onClick={() => {
              if (canDismiss) dismiss();
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative z-10 w-full max-w-sm flex flex-col items-center text-center"
            style={{ pointerEvents: "auto" }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "hsl(216 30% 10%)",
                border: "1px solid hsl(213 40% 32%)",
              }}
            >
              <Megaphone size={22} style={{ color: "hsl(213 80% 78%)" }} />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: "hsl(213 75% 68%)" }}
              >
                Update
              </p>
              {important ? (
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: "hsl(213 80% 78%)",
                    background: "hsla(213, 55%, 40%, 0.22)",
                    border: "1px solid hsla(213, 50%, 55%, 0.35)",
                  }}
                >
                  Important
                </span>
              ) : null}
            </div>

            <h2
              id="pz-update-title"
              className="text-2xl font-extrabold tracking-tight mb-2"
              style={{ color: "hsl(0 0% 100%)" }}
            >
              {item.title}
            </h2>
            <div
              className="text-sm leading-relaxed mb-6 max-w-[34ch]"
              style={{ color: "hsl(216 15% 72%)" }}
            >
              <MentionsText text={item.content} onNavigate={onNavigate} />
            </div>

            <div className="flex flex-col gap-2.5 w-full max-w-[280px]">
              <button
                type="button"
                disabled={!canDismiss}
                onClick={dismiss}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-[filter,opacity]"
                style={{
                  background: "hsl(213 55% 36%)",
                  border: "1px solid hsl(213 50% 48%)",
                  opacity: canDismiss ? 1 : 0.55,
                  cursor: canDismiss ? "pointer" : "not-allowed",
                }}
              >
                {canDismiss ? "Got it" : `Please wait ${waitLeft}s`}
              </button>
              {canDismiss ? (
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-0.5 py-2 text-[11px]"
                  style={{
                    background: "none",
                    border: "none",
                    color: "hsl(216 15% 55%)",
                    cursor: "pointer",
                  }}
                  aria-label="Close"
                >
                  <span className="inline-flex items-center gap-1">
                    <X size={12} /> Dismiss
                  </span>
                </button>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
