import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Square,
  Image,
  X,
  RotateCcw,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  Pencil,
  ChevronDown,
  Monitor,
  MessageSquare,
  Plus,
  Trash2,
  Check,
  Search,
  Sparkles,
  Code2,
  Lightbulb,
  Atom,
  PanelLeft,
  History,
  Share2,
  ArrowUp,
  LogIn,
  UserRound,
} from "lucide-react";
import { AdNativeBarAlt } from "@/components/ads/Adsterra";
import { setPendingAuth } from "@/lib/authPending";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  imageBase64?: string;
  imageMime?: string;
}

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  image?: { base64: string; mime: string };
}

interface ConvoMeta {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
}

const LOCAL_CONVOS_KEY = "petezah-ai-convos-lite";
const WELCOME = "Hey! I'm PeteAI. What can I help you with?";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAiResponse(text: string) {
  // escape everything first, then layer our own markup on top. otherwise raw
  // html in the model output (or a reloaded convo) executes via the
  // dangerouslySetInnerHTML sink below.
  let out = escapeHtml(text.trim());
  out = out.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_: string, _lang: string, code: string) =>
      `<pre style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:11px;margin:8px 0;font-family:'Courier New',monospace;color:rgba(255,255,255,0.85);white-space:pre-wrap;"><code>${code}</code></pre>`,
  );
  out = out.replace(
    /`([^`]+)`/g,
    "<code style=\"background:rgba(0,0,0,0.2);padding:1px 6px;border-radius:4px;font-size:0.88em;font-family:'Courier New',monospace;color:rgba(255,255,255,0.8);\">$1</code>",
  );
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" style="color:var(--foreground);opacity:0.7;text-decoration:underline;text-underline-offset:2px;">$1</a>',
  );
  out = out.replace(/\n/g, "<br>");
  return out;
}

function loadLocalConvos(): { meta: ConvoMeta; messages: { role: string; content: string }[] }[] {
  try {
    const raw = localStorage.getItem(LOCAL_CONVOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 20);
  } catch {
    return [];
  }
}

function saveLocalConvos(
  items: { meta: ConvoMeta; messages: { role: string; content: string }[] }[],
) {
  try {
    const slim = items.slice(0, 20).map((c) => ({
      meta: c.meta,
      messages: (c.messages || [])
        .filter((m) => m.content && m.role)
        .slice(-40)
        .map((m) => ({
          role: m.role === "assistant" || m.role === "ai" ? "assistant" : "user",
          content: String(m.content).slice(0, 4000),
        })),
    }));
    localStorage.setItem(LOCAL_CONVOS_KEY, JSON.stringify(slim));
  } catch {}
}

const DEFAULT_MODEL = "openai/gpt-oss-20b";

const MODELS = [
  { value: DEFAULT_MODEL, label: "GPT-OSS 20B (Fast)" },
  { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
];

const VISION_MODEL = "qwen/qwen3.6-27b";

const ALLOWED_MODELS = new Set(MODELS.map((m) => m.value));

const MODEL_ALIASES: Record<string, string> = {
  "llama-3.1-8b-instant": DEFAULT_MODEL,
  "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  "llama3-8b-8192": DEFAULT_MODEL,
  "llama3-70b-8192": "openai/gpt-oss-120b",
  "qwen/qwen3-32b": "openai/gpt-oss-120b",
};

function resolveStoredModel() {
  try {
    const raw = localStorage.getItem("selectedModel") || "";
    const mapped = MODEL_ALIASES[raw] || raw;
    if (ALLOWED_MODELS.has(mapped)) return mapped;
  } catch {}
  return DEFAULT_MODEL;
}

const SUGGESTIONS = [
  { icon: Atom, text: "Explain quantum computing in simple terms" },
  { icon: Code2, text: "Python JSON parser from an API endpoint" },
  { icon: Lightbulb, text: "Creative startup ideas in the AI space" },
  { icon: Sparkles, text: "Dark sci-fi story about a rogue AI" },
];

const SYSTEM_PROMPT = `You are PeteAI, a helpful and friendly AI assistant developed by PeteZah. Keep responses concise and natural. When answering educational or factual questions, format your response as:
Answer: [direct answer]
[brief explanation if needed]
For casual conversation, just respond naturally and briefly. Never reference the conversation format or mention "previous messages". Just respond naturally as if in a real conversation.`;

function TypingDots() {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 3,
        alignItems: "center",
        marginLeft: 4,
      }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.3)",
            display: "inline-block",
          }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}

function ScreenWidget({ onClose }: { onClose: () => void }) {
  const pipWinRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      try {
        pipWinRef.current?.close();
      } catch {}
    };
  }, []);

  const openPiP = async () => {
    const pip = (window as any).documentPictureInPicture;
    if (!pip?.requestWindow) {
      alert(
        "Picture-in-Picture is not supported in this browser. Try Chrome 116+.",
      );
      onClose();
      return;
    }
    try {
      const pipWin = await pip.requestWindow({
        width: 340,
        height: 520,
        disallowReturnToOpener: false,
        preferInitialWindowPlacement: true,
      });
      pipWinRef.current = pipWin;
      const doc = pipWin.document;

      doc.documentElement.style.cssText =
        "height:100%;margin:0;padding:0;box-sizing:border-box;";
      doc.body.style.cssText =
        "margin:0;padding:0;height:100%;background:#080d1a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;overflow:hidden;";

      const style = doc.createElement("style");
      style.textContent = `
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1);border-radius:4px; }

        .header {
          display:flex;align-items:center;justify-content:space-between;
          padding:10px 12px;flex-shrink:0;
          background:rgba(255,255,255,0.02);
          border-bottom:1px solid rgba(255,255,255,0.05);
        }
        .header-left { display:flex;align-items:center;gap:8px; }
        .status-dot {
          width:7px;height:7px;border-radius:50%;
          background:rgba(255,255,255,0.2);flex-shrink:0;
          transition:background 0.3s,box-shadow 0.3s;
        }
        .status-dot.on { background:#4ade80;box-shadow:0 0 8px #4ade80; }
        .header-title { font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.7); }
        .header-right { display:flex;align-items:center;gap:4px; }
        .icon-btn {
          width:26px;height:26px;border-radius:7px;border:none;
          background:transparent;color:rgba(255,255,255,0.35);
          cursor:pointer;display:flex;align-items:center;justify-content:center;
          transition:background 0.15s,color 0.15s;padding:0;
        }
        .icon-btn:hover { background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.8); }
        .icon-btn.danger:hover { background:rgba(239,68,68,0.15);color:rgba(255,100,100,0.9); }

        .body { flex:1;display:flex;flex-direction:column;gap:8px;padding:10px;overflow:hidden;min-height:0; }

        .preview-wrap {
          border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);
          background:#000;flex-shrink:0;position:relative;
        }
        .preview-wrap video { width:100%;max-height:150px;object-fit:cover;display:block; }
        .preview-label {
          position:absolute;bottom:6px;left:8px;
          font-size:9px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;
          color:rgba(255,255,255,0.4);background:rgba(0,0,0,0.5);
          padding:2px 6px;border-radius:4px;
        }

        .placeholder {
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:8px;padding:20px 12px;text-align:center;flex-shrink:0;
          border-radius:10px;border:1px dashed rgba(255,255,255,0.08);
          background:rgba(255,255,255,0.02);
        }
        .placeholder-icon { color:rgba(255,255,255,0.15); }
        .placeholder p { font-size:11px;color:rgba(255,255,255,0.3);margin:0;line-height:1.4; }

        .input-wrap {
          position:relative;flex-shrink:0;
        }
        textarea {
          width:100%;padding:9px 36px 9px 11px;border-radius:10px;
          border:1px solid rgba(255,255,255,0.08);
          background:rgba(255,255,255,0.04);
          color:rgba(255,255,255,0.85);font-size:12px;outline:none;resize:none;
          font-family:inherit;line-height:1.4;min-height:56px;max-height:100px;
          transition:border-color 0.15s;
        }
        textarea:focus { border-color:rgba(100,160,255,0.35); }
        textarea::placeholder { color:rgba(255,255,255,0.2); }
        .send-icon-btn {
          position:absolute;bottom:8px;right:8px;
          width:22px;height:22px;border-radius:6px;border:none;
          background:rgba(80,140,255,0.25);color:rgba(160,200,255,0.9);
          cursor:pointer;display:flex;align-items:center;justify-content:center;
          transition:background 0.15s;padding:0;
        }
        .send-icon-btn:hover { background:rgba(80,140,255,0.45); }
        .send-icon-btn:disabled { opacity:0.3;cursor:not-allowed; }

        .action-row { display:flex;gap:7px;flex-shrink:0; }
        .btn {
          flex:1;padding:8px 10px;border-radius:9px;font-size:11px;font-weight:600;
          cursor:pointer;font-family:inherit;transition:all 0.15s;
          display:flex;align-items:center;justify-content:center;gap:5px;border:none;
        }
        .btn:disabled { opacity:0.35;cursor:not-allowed; }
        .btn-share {
          background:rgba(255,255,255,0.05);
          border:1px solid rgba(255,255,255,0.09)!important;
          color:rgba(255,255,255,0.7);
        }
        .btn-share:hover:not(:disabled) { background:rgba(255,255,255,0.09); }
        .btn-share.active {
          background:rgba(239,68,68,0.12);
          border-color:rgba(239,68,68,0.25)!important;
          color:rgba(255,110,110,0.9);
        }

        .response-wrap {
          flex:1;overflow-y:auto;border-radius:10px;
          border:1px solid rgba(255,255,255,0.06);
          background:rgba(255,255,255,0.025);
          padding:10px 11px;min-height:0;
        }
        .response-text {
          font-size:12px;color:rgba(255,255,255,0.75);line-height:1.65;white-space:pre-wrap;
        }
        .response-error { color:rgba(255,110,110,0.8); }

        .thinking-row {
          display:flex;align-items:center;gap:6px;
          font-size:11px;color:rgba(255,255,255,0.3);flex-shrink:0;
          padding:2px 0;
        }
        .dot-pulse span {
          display:inline-block;width:3px;height:3px;border-radius:50%;
          background:rgba(255,255,255,0.3);animation:dp 1s infinite;
        }
        .dot-pulse span:nth-child(2){animation-delay:0.18s}
        .dot-pulse span:nth-child(3){animation-delay:0.36s}
        @keyframes dp{0%,100%{opacity:0.15;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}

        .hint { font-size:9px;color:rgba(255,255,255,0.15);text-align:center;flex-shrink:0;padding:2px 0; }
      `;
      doc.head.appendChild(style);

      // SVG icons as strings cause why not
      const monitorSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`;
      const stopSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
      const sendSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>`;
      const xSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
      const screenSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;

      doc.body.innerHTML = `
        <div class="header">
          <div class="header-left">
            <div class="status-dot" id="pip-dot"></div>
            <span class="header-title">AI Screen Assistant</span>
          </div>
          <div class="header-right">
            <button class="icon-btn danger" id="pip-close" title="Close">${xSvg}</button>
          </div>
        </div>
        <div class="body">
          <div id="pip-placeholder" class="placeholder">
            <div class="placeholder-icon">${monitorSvg.replace('width="13"', 'width="28"').replace('height="13"', 'height="28"')}</div>
            <p>Share your screen<br>so AI can see it</p>
          </div>
          <div class="preview-wrap" id="pip-preview" style="display:none">
            <video id="pip-video" muted autoplay playsinline></video>
            <span class="preview-label">Live Preview</span>
          </div>
          <div class="action-row">
            <button class="btn btn-share" id="pip-share-btn">${screenSvg} Share Screen</button>
          </div>
          <div class="input-wrap">
            <textarea id="pip-input" placeholder="Ask about your screen... (Enter to send)" disabled></textarea>
            <button class="send-icon-btn" id="pip-send-btn" disabled title="Ask AI">${sendSvg}</button>
          </div>
          <div class="thinking-row" id="pip-thinking" style="display:none">
            Thinking <span class="dot-pulse"><span></span><span></span><span></span></span>
          </div>
          <div class="response-wrap" id="pip-response-wrap" style="display:none">
            <div class="response-text" id="pip-response"></div>
          </div>
          <p class="hint" id="pip-hint" style="display:none">Window stays open while you browse other tabs</p>
        </div>
      `;

      let pipStream: MediaStream | null = null;
      let pipCaptureVideo: HTMLVideoElement | null = null;

      const dot = doc.getElementById("pip-dot")!;
      const placeholder = doc.getElementById("pip-placeholder")!;
      const preview = doc.getElementById("pip-preview")!;
      const video = doc.getElementById("pip-video") as HTMLVideoElement;
      const shareBtn = doc.getElementById("pip-share-btn")!;
      const input = doc.getElementById("pip-input") as HTMLTextAreaElement;
      const sendBtn = doc.getElementById("pip-send-btn") as HTMLButtonElement;
      const responseWrap = doc.getElementById("pip-response-wrap")!;
      const responseEl = doc.getElementById("pip-response")!;
      const thinkingEl = doc.getElementById("pip-thinking")!;
      const hintEl = doc.getElementById("pip-hint")!;
      const closeBtn = doc.getElementById("pip-close")!;

      closeBtn.addEventListener("click", () => {
        pipStream?.getTracks().forEach((t) => t.stop());
        pipWin.close();
        onClose();
      });

      const setSharing = (active: boolean) => {
        dot.className = active ? "status-dot on" : "status-dot";
        placeholder.style.display = active ? "none" : "flex";
        preview.style.display = active ? "block" : "none";
        shareBtn.innerHTML = active
          ? `${stopSvg} Stop Sharing`
          : `${screenSvg} Share Screen`;
        shareBtn.className = active ? "btn btn-share active" : "btn btn-share";
        input.disabled = !active;
        sendBtn.disabled = !active;
        hintEl.style.display = active ? "block" : "none";
      };

      shareBtn.addEventListener("click", async () => {
        if (pipStream) {
          pipStream.getTracks().forEach((t) => t.stop());
          pipStream = null;
          pipCaptureVideo = null;
          setSharing(false);
          return;
        }
        try {
          pipStream = await pipWin.navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 5 },
          });
          const cv = doc.createElement("video") as HTMLVideoElement;
          cv.muted = true;
          cv.autoplay = true;
          cv.playsInline = true;
          cv.srcObject = pipStream;
          await cv.play().catch(() => {});
          pipCaptureVideo = cv;
          video.srcObject = pipStream;
          await video.play().catch(() => {});
          pipStream!.getVideoTracks()[0].addEventListener("ended", () => {
            pipStream = null;
            pipCaptureVideo = null;
            setSharing(false);
          });
          setSharing(true);
        } catch {}
      });

      const doAsk = async () => {
        if (!pipStream || !pipCaptureVideo) return;
        const q =
          input.value.trim() || "What do you see on my screen? Be concise.";
        const cv = pipCaptureVideo;
        if (!cv.videoWidth) return;

        const maxW = 1280;
        const scale = cv.videoWidth > maxW ? maxW / cv.videoWidth : 1;
        const w = Math.round(cv.videoWidth * scale);
        const h = Math.round(cv.videoHeight * scale);
        const canvas = doc.createElement("canvas") as HTMLCanvasElement;
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(cv, 0, 0, w, h);
        const frame = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];

        sendBtn.disabled = true;
        thinkingEl.style.display = "flex";
        responseWrap.style.display = "none";
        responseEl.textContent = "";
        responseEl.className = "response-text";

        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: q,
              model: VISION_MODEL,
              groqMessages: [
                {
                  role: "system",
                  content:
                    "You are a helpful AI assistant looking at a screenshot. Answer concisely. For educational/factual questions format as:\nAnswer: [answer]\n[brief explanation]",
                },
                {
                  role: "user",
                  content: [
                    { type: "text", text: q },
                    {
                      type: "image_url",
                      image_url: { url: `data:image/jpeg;base64,${frame}` },
                    },
                  ],
                },
              ],
            }),
          });
          const data = await res.json();
          responseEl.textContent = data.response || "No response.";
          responseWrap.style.display = "block";
        } catch {
          responseEl.textContent = "Couldn't reach AI. Try again.";
          responseEl.className = "response-text response-error";
          responseWrap.style.display = "block";
        } finally {
          sendBtn.disabled = !pipStream;
          thinkingEl.style.display = "none";
        }
      };

      sendBtn.addEventListener("click", doAsk);
      input.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          doAsk();
        }
      });

      pipWin.addEventListener("pagehide", () => {
        pipStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        onClose();
      });
    } catch {
      onClose();
    }
  };

  useEffect(() => {
    openPiP();
  }, []);
  return null;
}

function MessageBubble({
  msg,
  onCopy,
  onRegen,
  onEdit,
  onThumbsUp,
  onThumbsDown,
}: {
  msg: Message;
  onCopy: (text: string) => void;
  onRegen: () => void;
  onEdit: (text: string) => void;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
}) {
  const [liked, setLiked] = useState<"up" | "down" | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const handleSpeak = () => {
    if (!window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = msg.content.replace(/<[^>]+>/g, "");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  if (msg.id === "thinking") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          alignSelf: "flex-start",
          padding: "10px 15px",
          borderRadius: 20,
          fontSize: 13,
          color: "rgba(255,255,255,0.4)",
          display: "flex",
          alignItems: "center",
        }}
      >
        Thinking <TypingDots />
      </motion.div>
    );
  }

  if (msg.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ alignSelf: "flex-end", maxWidth: "75%" }}
      >
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 20,
            fontSize: 13,
            lineHeight: 1.6,
            background: "rgba(255,255,255,0.06)",
            color: "var(--foreground)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(8px)",
            wordBreak: "break-word",
          }}
        >
          {msg.imageBase64 && msg.imageMime && (
            <img
              src={`data:${msg.imageMime};base64,${msg.imageBase64}`}
              style={{
                maxHeight: 120,
                maxWidth: 200,
                borderRadius: 8,
                display: "block",
                marginBottom: 6,
              }}
              alt="attachment"
            />
          )}
          {msg.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        alignSelf: "flex-start",
        maxWidth: "80%",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderRadius: 20,
          fontSize: 13,
          lineHeight: 1.7,
          color: "var(--foreground)",
          wordBreak: "break-word",
        }}
        dangerouslySetInnerHTML={{ __html: msg.content }}
      />
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{ display: "flex", gap: 1, paddingLeft: 10 }}
      >
        {[
          {
            icon: <Copy size={11} />,
            action: () => onCopy(msg.content.replace(/<[^>]+>/g, "")),
            title: "Copy",
          },
          {
            icon: speaking ? <Square size={11} /> : <Volume2 size={11} />,
            action: handleSpeak,
            title: speaking ? "Stop" : "Read aloud",
          },
          {
            icon: <RotateCcw size={11} />,
            action: onRegen,
            title: "Regenerate",
          },
          {
            icon: <Pencil size={11} />,
            action: () => onEdit(msg.content.replace(/<[^>]+>/g, "")),
            title: "Edit",
          },
          {
            icon: <ThumbsUp size={11} />,
            action: () => {
              setLiked("up");
              onThumbsUp();
            },
            title: "Like",
            active: liked === "up",
          },
          {
            icon: <ThumbsDown size={11} />,
            action: () => {
              setLiked("down");
              onThumbsDown();
            },
            title: "Dislike",
            active: liked === "down",
          },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            title={btn.title}
            className={`p-1.5 rounded-lg transition-colors ${
              (btn as any).active
                ? "text-foreground"
                : "text-foreground/25 hover:text-foreground/60"
            }`}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            {btn.icon}
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
}

export default function AIPage({
  onNavigate,
}: {
  onNavigate: (url: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(resolveStoredModel);
  const [modelOpen, setModelOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    base64: string;
    mime: string;
  } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showScreenWidget, setShowScreenWidget] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [convos, setConvos] = useState<ConvoMeta[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const handleScreenToggle = async () => {
    setShowScreenWidget(true);
  };
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeConvoIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (chatBodyRef.current)
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }, 50);
  }, []);

  const resetToWelcome = useCallback(() => {
    setMessages([{ id: "welcome", role: "ai", content: WELCOME }]);
    setHistory([{ role: "assistant", content: WELCOME }]);
    setShowSuggestions(true);
    setActiveConvoId(null);
    activeConvoIdRef.current = null;
  }, []);

  const refreshConvoList = useCallback(async () => {
    try {
      const r = await fetch("/api/ai/conversations", { credentials: "include" });
      if (r.status === 401) {
        setSignedIn(false);
        const local = loadLocalConvos();
        setConvos(local.map((c) => c.meta).sort((a, b) => b.updatedAt - a.updatedAt));
        return;
      }
      if (!r.ok) return;
      setSignedIn(true);
      const d = await r.json();
      setConvos(d.conversations || []);
    } catch {
      const local = loadLocalConvos();
      setConvos(local.map((c) => c.meta).sort((a, b) => b.updatedAt - a.updatedAt));
    }
  }, []);

  useEffect(() => {
    resetToWelcome();
    refreshConvoList();
  }, [resetToWelcome, refreshConvoList]);

  const persistConversation = useCallback(
    async (hist: HistoryEntry[], convoId: string | null) => {
      const textMsgs = hist
        .filter((m) => m.content?.trim())
        .filter((m) => m.content !== WELCOME)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
      if (!textMsgs.some((m) => m.role === "user")) return convoId;

      const preview =
        textMsgs.find((m) => m.role === "user")?.content.slice(0, 80) || "New chat";

      if (signedIn) {
        try {
          const r = await fetch("/api/ai/conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id:
                convoId &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                  convoId,
                )
                  ? convoId
                  : undefined,
              messages: textMsgs,
              title: preview,
            }),
          });
          if (r.ok) {
            const d = await r.json();
            const id = d.conversation?.id || convoId;
            activeConvoIdRef.current = id;
            setActiveConvoId(id);
            refreshConvoList();
            return id as string;
          }
          if (r.status === 401) setSignedIn(false);
        } catch {}
      }

      const id = convoId || `local-${Date.now()}`;
      const meta: ConvoMeta = {
        id,
        title: preview.slice(0, 60),
        preview: preview.slice(0, 120),
        updatedAt: Date.now(),
      };
      const all = loadLocalConvos().filter((c) => c.meta.id !== id);
      all.unshift({ meta, messages: textMsgs });
      saveLocalConvos(all);
      activeConvoIdRef.current = id;
      setActiveConvoId(id);
      setConvos(all.map((c) => c.meta));
      return id;
    },
    [signedIn, refreshConvoList],
  );

  const schedulePersist = useCallback(
    (hist: HistoryEntry[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        persistConversation(hist, activeConvoIdRef.current);
      }, 600);
    },
    [persistConversation],
  );

  const openConversation = useCallback(
    async (id: string) => {
      if (signedIn) {
        try {
          const r = await fetch(`/api/ai/conversations/${id}`, { credentials: "include" });
          if (r.ok) {
            const d = await r.json();
            const msgs = (d.conversation?.messages || []) as { role: string; content: string }[];
            const ui: Message[] = [
              { id: "welcome", role: "ai", content: WELCOME },
              ...msgs.map((m, i) => ({
                id: `${id}-${i}`,
                role: (m.role === "assistant" ? "ai" : "user") as "ai" | "user",
                    content:
                  m.role === "assistant" || m.role === "ai"
                    ? formatAiResponse(m.content)
                    : m.content,
              })),
            ];
            const hist: HistoryEntry[] = [
              { role: "assistant", content: WELCOME },
              ...msgs.map((m) => ({
                role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
                content: m.content,
              })),
            ];
            setMessages(ui);
            setHistory(hist);
            setActiveConvoId(id);
            activeConvoIdRef.current = id;
            setShowSuggestions(false);
            setSidebarOpen(false);
            return;
          }
        } catch {}
      }
      const local = loadLocalConvos().find((c) => c.meta.id === id);
      if (!local) return;
      const msgs = local.messages || [];
      setMessages([
        { id: "welcome", role: "ai", content: WELCOME },
        ...msgs.map((m, i) => ({
          id: `${id}-${i}`,
          role: (m.role === "assistant" ? "ai" : "user") as "ai" | "user",
          content:
            m.role === "assistant"
              ? formatAiResponse(m.content)
              : m.content,
        })),
      ]);
      setHistory([
        { role: "assistant", content: WELCOME },
        ...msgs.map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: m.content,
        })),
      ]);
      setActiveConvoId(id);
      activeConvoIdRef.current = id;
      setShowSuggestions(false);
      setSidebarOpen(false);
    },
    [signedIn],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (signedIn) {
        try {
          await fetch(`/api/ai/conversations/${id}`, {
            method: "DELETE",
            credentials: "include",
          });
        } catch {}
        refreshConvoList();
      } else {
        const next = loadLocalConvos().filter((c) => c.meta.id !== id);
        saveLocalConvos(next);
        setConvos(next.map((c) => c.meta));
      }
      if (activeConvoIdRef.current === id) resetToWelcome();
    },
    [signedIn, refreshConvoList, resetToWelcome],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim().slice(0, 80);
      if (!clean) return;
      if (signedIn) {
        try {
          await fetch(`/api/ai/conversations/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: clean }),
          });
        } catch {}
        refreshConvoList();
      } else {
        const all = loadLocalConvos().map((c) =>
          c.meta.id === id ? { ...c, meta: { ...c.meta, title: clean } } : c,
        );
        saveLocalConvos(all);
        setConvos(all.map((c) => c.meta));
      }
      setRenamingId(null);
    },
    [signedIn, refreshConvoList],
  );

  useEffect(() => {
    const syncModel = () => {
      const next = resolveStoredModel();
      setModel((prev) => (prev === next ? prev : next));
      try {
        if (localStorage.getItem("selectedModel") !== next) {
          localStorage.setItem("selectedModel", next);
        }
      } catch {}
    };
    syncModel();
    window.addEventListener("petezah-settings-updated", syncModel);
    return () => window.removeEventListener("petezah-settings-updated", syncModel);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(
    async (
      overrideText?: string,
      overrideImage?: { base64: string; mime: string } | null,
      historyBase?: HistoryEntry[],
    ) => {
      const text = (overrideText ?? input).trim();
      const img = overrideImage !== undefined ? overrideImage : pendingImage;
      if (!text && !img) return;
      if (isFetching) {
        abortRef.current?.abort();
        return;
      }

      setShowSuggestions(false);
      setPendingImage(null);

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        imageBase64: img?.base64 ?? undefined,
        imageMime: img?.mime ?? undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");

      const base = historyBase ?? history;
      const newHistory: HistoryEntry[] = [
        ...base,
        {
          role: "user",
          content: text,
          ...(img ? { image: { base64: img.base64, mime: img.mime } } : {}),
        },
      ];
      setHistory(newHistory);

      const groqMessages: { role: string; content: any }[] = [];

      for (const entry of newHistory) {
        if (entry.role === "user") {
          const isLastUser =
            entry === [...newHistory].reverse().find((e) => e.role === "user");
          if (entry.image && isLastUser) {
            groqMessages.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: entry.content || "What's in this image?",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${entry.image.mime};base64,${entry.image.base64}`,
                  },
                },
              ],
            });
          } else if (entry.content?.trim()) {
            groqMessages.push({ role: "user", content: entry.content });
          }
        } else if (entry.role === "assistant" && entry.content?.trim()) {
          if (entry.content === WELCOME) continue;
          groqMessages.push({ role: "assistant", content: entry.content });
        }
      }

      if (groqMessages[0]?.role !== "user" && img) {
        groqMessages.length = 0;
        groqMessages.push({
          role: "user",
          content: [
            { type: "text", text: text || "What's in this image?" },
            {
              type: "image_url",
              image_url: { url: `data:${img.mime};base64,${img.base64}` },
            },
          ],
        });
      }

      setMessages((prev) => [
        ...prev,
        { id: "thinking", role: "ai", content: "" },
      ]);
      setIsFetching(true);
      abortRef.current = new AbortController();

      try {
        const useVision = !!img;
        const selectedModel = useVision
          ? VISION_MODEL
          : ALLOWED_MODELS.has(model)
            ? model
            : DEFAULT_MODEL;

        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            prompt: text || "What's in this image?",
            model: selectedModel,
            system: SYSTEM_PROMPT,
            groqMessages,
          }),
          signal: abortRef.current.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg =
            typeof data?.detail === "string"
              ? data.detail
              : typeof data?.error === "string"
                ? data.error
                : `Couldn't reach PeteAI (${res.status})`;
          throw Object.assign(new Error(errMsg), { name: "ApiError" });
        }
        let aiResponse = data?.response || "Sorry, I couldn't get a response.";

        if (text.toLowerCase().includes("source code"))
          aiResponse = "I'm sorry, I cannot reveal my source code.";
        else if (text.toLowerCase().includes("illegal"))
          aiResponse = "I can't help with anything illegal.";

        const formatted = formatAiResponse(aiResponse);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== "thinking")
            .concat({
              id: Date.now().toString(),
              role: "ai",
              content: formatted,
            }),
        );
        setHistory((prev) => {
          const next = [
            ...prev,
            { role: "assistant" as const, content: aiResponse },
          ].slice(-40);
          schedulePersist(next);
          return next;
        });
      } catch (err: any) {
        setMessages((prev) => prev.filter((m) => m.id !== "thinking"));
        if (err.name !== "AbortError") {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "ai",
              content:
                err?.name === "ApiError" && err?.message
                  ? err.message
                  : "Couldn't reach PeteAI. Try again.",
            },
          ]);
        }
      } finally {
        setIsFetching(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [input, pendingImage, isFetching, history, model, schedulePersist],
  );

  const handleRegen = useCallback(() => {
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const img = lastUser.image
      ? { base64: lastUser.image.base64, mime: lastUser.image.mime }
      : null;

    let trimmed = history;
    if (trimmed.length && trimmed[trimmed.length - 1]?.role === "assistant") {
      trimmed = trimmed.slice(0, -1);
    }
    if (trimmed.length && trimmed[trimmed.length - 1]?.role === "user") {
      trimmed = trimmed.slice(0, -1);
    }

    setMessages((prev) => {
      const withoutThinking = prev.filter((m) => m.id !== "thinking");
      let next = withoutThinking;
      if (next.length && next[next.length - 1]?.role === "ai") next = next.slice(0, -1);
      if (next.length && next[next.length - 1]?.role === "user") next = next.slice(0, -1);
      return next;
    });

    sendMessage(lastUser.content || "What's in this image?", img, trimmed);
  }, [history, sendMessage]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;
      const img = new window.Image();
      img.onload = () => {
        const maxW = 1280;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setPendingImage({ base64: result.split(",")[1], mime: file.type });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setPendingImage({ base64: dataUrl.split(",")[1], mime: "image/jpeg" });
      };
      img.onerror = () => {
        setPendingImage({ base64: result.split(",")[1], mime: file.type });
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };


  const canSend = (input.trim().length > 0 || !!pendingImage) && !isFetching;
  const isLanding = showSuggestions && messages.length <= 1;
  const [typedSub, setTypedSub] = useState("");
  const SUB_LINE = "How can I help you today?";

  useEffect(() => {
    if (!isLanding) {
      setTypedSub(SUB_LINE);
      return;
    }
    setTypedSub("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTypedSub(SUB_LINE.slice(0, i));
      if (i >= SUB_LINE.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [isLanding]);

  const filteredConvos = chatSearch.trim()
    ? convos.filter(
        (c) =>
          c.title.toLowerCase().includes(chatSearch.toLowerCase()) ||
          c.preview.toLowerCase().includes(chatSearch.toLowerCase())
      )
    : convos;

  const openLogin = () => {
    setLoginPromptOpen(false);
    setPendingAuth({ type: "ai" });
    onNavigate("petezah://account");
  };

  const handleShare = async () => {
    if (!signedIn) {
      setLoginPromptOpen(true);
      return;
    }
    if (!activeConvoId) {
      setShareNotice("Send a message first to share this chat.");
      return;
    }
    setShareBusy(true);
    setShareNotice("");
    try {
      const r = await fetch(`/api/ai/conversations/${activeConvoId}/share`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) {
        setLoginPromptOpen(true);
        return;
      }
      if (!r.ok || !d?.token) throw new Error(d?.error || "Share failed");
      const link = `${window.location.origin}/share/ai/${d.token}`;
      await navigator.clipboard.writeText(link);
      setShareNotice("Share link copied");
    } catch (e: any) {
      setShareNotice(e?.message || "Could not create share link");
    } finally {
      setShareBusy(false);
      setTimeout(() => setShareNotice(""), 2800);
    }
  };

  const composer = (
    <div
      className="w-full transition-all ai-composer-shell"
      style={{
        background: isLanding ? "hsla(220, 28%, 8%, 0.52)" : "hsla(220, 28%, 8%, 0.48)",
        border: "1px solid hsla(0,0%,100%,0.14)",
        borderRadius: isLanding ? 18 : 16,
        boxShadow: isLanding ? "0 10px 40px rgba(0,0,0,0.35)" : "none",
        padding: isLanding ? "14px 14px 12px" : "12px 12px 10px",
        backdropFilter: "blur(18px) saturate(1.2)",
        WebkitBackdropFilter: "blur(18px) saturate(1.2)",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
    >
      <AnimatePresence>
        {pendingImage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center pb-2"
          >
            <div className="relative inline-block">
              <img
                src={`data:${pendingImage.mime};base64,${pendingImage.base64}`}
                className="max-h-14 rounded-lg border border-white/10"
                alt="pending"
              />
              <button
                onClick={() => setPendingImage(null)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive flex items-center justify-center border-none cursor-pointer"
              >
                <X size={9} className="text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={inputRef}
        value={input}
        rows={isLanding ? 2 : 2}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        }}
        placeholder="Ask me anything..."
        className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-white placeholder:text-white/30 outline-none border-none px-0.5 py-0.5"
        style={{ minHeight: isLanding ? 52 : 40 }}
      />

      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-1.5 relative">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => setModelOpen((v) => !v)}
            title="Model"
            className="relative h-8 px-2.5 rounded-lg text-[11px] flex items-center gap-1"
            style={{
              background: "hsla(0,0%,100%,0.05)",
              border: "1px solid hsla(0,0%,100%,0.1)",
              color: "hsla(0,0%,100%,0.55)",
              cursor: "pointer",
            }}
          >
            <span className="max-w-[100px] truncate">
              {MODELS.find((m) => m.value === model)?.label?.split(" ")[0] || "Model"}
            </span>
            <ChevronDown size={11} className="opacity-50" />
            <AnimatePresence>
              {modelOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full left-0 mb-2 w-48 rounded-xl py-1 z-50 overflow-hidden"
                  style={{
                    background: "hsla(220, 20%, 8%, 0.98)",
                    border: "1px solid hsla(0,0%,100%,0.12)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {MODELS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => {
                        setModel(m.value);
                        localStorage.setItem("selectedModel", m.value);
                        setModelOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/5"
                      style={{
                        color: model === m.value ? "hsla(0,0%,100%,0.95)" : "hsla(0,0%,100%,0.5)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Upload image"
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "hsla(0,0%,100%,0.05)",
              border: "1px solid hsla(0,0%,100%,0.1)",
              color: "hsla(0,0%,100%,0.45)",
              cursor: "pointer",
            }}
          >
            <Image size={14} />
          </button>
          <button
            type="button"
            onClick={handleScreenToggle}
            title="Share screen"
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "hsla(0,0%,100%,0.05)",
              border: "1px solid hsla(0,0%,100%,0.1)",
              color: showScreenWidget ? "hsla(0,0%,100%,0.85)" : "hsla(0,0%,100%,0.4)",
              cursor: "pointer",
            }}
          >
            <Monitor size={14} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => (isFetching ? abortRef.current?.abort() : sendMessage())}
          disabled={!canSend && !isFetching}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-35"
          style={{
            background: canSend || isFetching ? "hsla(0,0%,72%,0.95)" : "hsla(0,0%,100%,0.1)",
            border: "none",
            cursor: canSend || isFetching ? "pointer" : "default",
            color: canSend || isFetching ? "hsla(220, 20%, 8%, 1)" : "hsla(0,0%,100%,0.35)",
          }}
        >
          {isFetching ? <Square size={11} /> : <Send size={13} />}
        </button>
      </div>
    </div>
  );

  const historyModal = (
    <AnimatePresence>
      {historyOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
          onClick={() => setHistoryOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: "hsla(220, 35%, 8%, 0.96)",
              border: "1px solid hsla(210, 40%, 80%, 0.14)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <p className="text-sm font-semibold text-white">Chat history</p>
                <p className="text-[11px] text-white/40">
                  {signedIn ? "Synced to your account" : "Local only · sign in to sync"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white/80"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-4 pb-3">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{
                  background: "hsla(210, 40%, 90%, 0.06)",
                  border: "1px solid hsla(210, 40%, 90%, 0.1)",
                }}
              >
                <Search size={13} className="text-white/35" />
                <input
                  autoFocus
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search chats..."
                  className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/35 outline-none border-none"
                />
              </div>
            </div>
            <div className="max-h-[42vh] overflow-y-auto px-2 pb-3" style={{ scrollbarWidth: "thin" }}>
              {filteredConvos.length === 0 ? (
                <p className="text-[12px] text-white/35 px-3 py-6 text-center">No chats yet</p>
              ) : (
                filteredConvos.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      openConversation(c.id);
                      setHistoryOpen(false);
                      setChatSearch("");
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl mb-0.5 hover:bg-white/[0.05] transition-colors"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <div className="text-[13px] text-white/85 truncate">{c.title || "Untitled"}</div>
                    <div className="text-[11px] text-white/35 truncate mt-0.5">{c.preview}</div>
                  </button>
                ))
              )}
            </div>
            {!signedIn && (
              <div
                className="px-4 py-3 flex items-center justify-between gap-2"
                style={{ borderTop: "1px solid hsla(210, 40%, 80%, 0.08)" }}
              >
                <span className="text-[11px] text-white/40">Want history everywhere?</span>
                <button
                  type="button"
                  onClick={openLogin}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg"
                  style={{
                    background: "hsla(205, 80%, 55%, 0.18)",
                    border: "1px solid hsla(205, 80%, 60%, 0.28)",
                    color: "hsla(205, 90%, 78%, 1)",
                    cursor: "pointer",
                  }}
                >
                  Sign in
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const loginModal = (
    <AnimatePresence>
      {loginPromptOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)" }}
          onClick={() => setLoginPromptOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: "hsla(220, 35%, 8%, 0.97)",
              border: "1px solid hsla(210, 40%, 80%, 0.14)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "hsla(205, 80%, 55%, 0.15)",
                  border: "1px solid hsla(205, 80%, 60%, 0.25)",
                }}
              >
                <LogIn size={16} style={{ color: "hsla(205, 90%, 72%, 1)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Sign in required</p>
                <p className="text-[11px] text-white/45">Sharing chats needs an account</p>
              </div>
            </div>
            <p className="text-[12px] text-white/55 leading-relaxed mb-4">
              Log in to create a private share link for this conversation. Guests can still chat locally.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLoginPromptOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-[12px] text-white/60"
                style={{
                  background: "hsla(210, 40%, 80%, 0.06)",
                  border: "1px solid hsla(210, 40%, 80%, 0.1)",
                  cursor: "pointer",
                }}
              >
                Not now
              </button>
              <button
                type="button"
                onClick={openLogin}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-medium"
                style={{
                  background: "hsla(205, 85%, 55%, 0.95)",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  boxShadow: "0 0 24px hsla(205, 90%, 55%, 0.3)",
                }}
              >
                Open sign in
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {!isLanding && (
        <aside
          className="ai-convo-rail"
          style={{
            width: 196,
            flexShrink: 0,
            borderRight: "1px solid hsla(210, 20%, 70%, 0.08)",
            background: "hsla(220, 28%, 7%, 0.82)",
            backdropFilter: "blur(16px) saturate(1.15)",
            WebkitBackdropFilter: "blur(16px) saturate(1.15)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 20,
          }}
        >
          <div style={{ padding: "12px 10px 8px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <img
                src="/storage/images/logo-png-removebg-preview.png"
                alt=""
                style={{ width: 18, height: 18, objectFit: "contain", opacity: 0.88 }}
              />
              <div style={{ flex: 1, fontSize: 12, fontWeight: 650, color: "hsla(0,0%,96%,0.92)", letterSpacing: "-0.01em" }}>
                PeteAI
              </div>
            </div>
            <button
              type="button"
              onClick={() => resetToWelcome()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid hsla(0,0%,100%,0.1)",
                background: "hsla(0,0%,100%,0.05)",
                color: "hsla(0,0%,100%,0.78)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 560,
              }}
            >
              <Plus size={14} />
              <span>New chat</span>
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 999,
                background: "hsla(210, 40%, 90%, 0.06)",
                border: "1px solid hsla(210, 40%, 90%, 0.12)",
              }}
            >
              <Search size={12} style={{ color: "hsla(0,0%,100%,0.35)" }} />
              <input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Search chats..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "hsla(0,0%,100%,0.8)",
                  fontSize: 11,
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px", scrollbarWidth: "none" }}>
            <p
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "hsla(0,0%,100%,0.28)",
                padding: "6px 8px 8px",
                margin: 0,
              }}
            >
              Recent
            </p>
            {filteredConvos.length === 0 && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", padding: "8px 6px", margin: 0 }}>
                Past chats appear here{signedIn ? "" : " · sign in to sync"}.
              </p>
            )}
            {filteredConvos.map((c) => {
              const active = activeConvoId === c.id;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 2,
                    borderRadius: 10,
                    background: active ? "hsla(0,0%,100%,0.08)" : "transparent",
                  }}
                >
                  {renamingId === c.id ? (
                    <form
                      style={{ flex: 1, display: "flex", gap: 4, padding: 4 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        renameConversation(c.id, renameValue);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: "rgba(0,0,0,0.25)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 6,
                          color: "rgba(255,255,255,0.85)",
                          fontSize: 10,
                          padding: "4px 6px",
                          outline: "none",
                        }}
                      />
                      <button
                        type="submit"
                        style={{
                          background: "none",
                          border: "none",
                          color: "rgba(255,255,255,0.5)",
                          cursor: "pointer",
                          padding: 2,
                        }}
                      >
                        <Check size={11} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openConversation(c.id)}
                        title={c.title}
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 8px",
                          background: "none",
                          border: "none",
                          color: active ? "hsla(0,0%,100%,0.95)" : "hsla(0,0%,100%,0.55)",
                          cursor: "pointer",
                          textAlign: "left",
                          minWidth: 0,
                          fontSize: 11,
                        }}
                      >
                        <MessageSquare size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.title || "Untitled"}
                        </span>
                      </button>
                      <div style={{ display: "flex", gap: 0, paddingRight: 4 }}>
                        <button
                          type="button"
                          title="Rename"
                          onClick={() => {
                            setRenamingId(c.id);
                            setRenameValue(c.title);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "rgba(255,255,255,0.28)",
                            cursor: "pointer",
                            padding: 3,
                          }}
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => deleteConversation(c.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "rgba(255,255,255,0.28)",
                            cursor: "pointer",
                            padding: 3,
                          }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {isLanding ? (
          <>
            <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5">
              <button
                type="button"
                title="History"
                aria-label="History"
                onClick={() => setHistoryOpen(true)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/50 hover:text-white/85 transition-colors"
                style={{
                  background: "hsla(220, 28%, 8%, 0.55)",
                  border: "1px solid hsla(0,0%,100%,0.1)",
                  cursor: "pointer",
                  backdropFilter: "blur(12px)",
                }}
              >
                <History size={14} />
              </button>
              <button
                type="button"
                title="Profile"
                aria-label="Profile"
                onClick={() => onNavigate("petezah://account")}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/50 hover:text-white/85 transition-colors"
                style={{
                  background: "hsla(220, 28%, 8%, 0.55)",
                  border: "1px solid hsla(0,0%,100%,0.1)",
                  cursor: "pointer",
                  backdropFilter: "blur(12px)",
                }}
              >
                <UserRound size={14} />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-5 overflow-hidden">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-lg flex flex-col items-center gap-4"
              >
                <div className="text-center space-y-2">
                  <h2
                    className="text-[1.65rem] sm:text-[1.85rem] font-bold tracking-tight"
                    style={{
                      color: "hsla(0,0%,98%,0.96)",
                      letterSpacing: "-0.03em",
                      textShadow: "0 2px 24px rgba(0,0,0,0.45)",
                    }}
                  >
                    PeteAI
                  </h2>
                  <p className="text-[13px] min-h-[1.25rem]" style={{ color: "hsla(0,0%,100%,0.62)", textShadow: "0 1px 12px rgba(0,0,0,0.4)" }}>
                    {typedSub}
                    <span
                      className="inline-block w-[1px] h-[0.95em] ml-0.5 align-[-2px]"
                      style={{
                        background: "hsla(0,0%,100%,0.45)",
                        animation: "pz-caret 1s step-end infinite",
                      }}
                    />
                  </p>
                </div>
                <div className="w-full">{composer}</div>
                <div className="w-full" style={{ marginTop: 8 }}>
                  <AdNativeBarAlt />
                </div>
              </motion.div>
            </div>
            <style>{`@keyframes pz-caret { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
          </>
        ) : (
          <>
            <div
              className="flex-shrink-0 relative z-10 px-5 pt-4 pb-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-sm font-semibold text-foreground truncate">
                  {convos.find((c) => c.id === activeConvoId)?.title || "PeteAI"}
                </h1>
              </div>
              <div className="relative flex items-center gap-1.5">
                {shareNotice ? (
                  <span className="text-[10px] text-white/45 mr-1">{shareNotice}</span>
                ) : null}
                <button
                  type="button"
                  title="Share chat"
                  onClick={handleShare}
                  disabled={shareBusy}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 6,
                    color: "rgba(255,255,255,0.45)",
                    display: "flex",
                    opacity: shareBusy ? 0.5 : 1,
                  }}
                >
                  <Share2 size={14} />
                </button>
                <button
                  type="button"
                  title="Delete chat"
                  onClick={() => activeConvoId && deleteConversation(activeConvoId)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: activeConvoId ? "pointer" : "default",
                    padding: 6,
                    color: "rgba(255,255,255,0.28)",
                    opacity: activeConvoId ? 1 : 0.35,
                  }}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={handleScreenToggle}
                  title="AI Screen Assistant"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 6,
                    color: showScreenWidget
                      ? "rgba(150,200,255,0.9)"
                      : "rgba(255,255,255,0.25)",
                    display: "flex",
                  }}
                >
                  <Monitor size={14} />
                </button>
              </div>
            </div>

            <div
              ref={chatBodyRef}
              className="flex-1 overflow-y-auto relative z-10"
              style={{
                padding: "24px max(8%, 20px)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                scrollbarWidth: "none",
              }}
            >
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onCopy={(text) => navigator.clipboard.writeText(text)}
                  onRegen={handleRegen}
                  onEdit={(text) => {
                    setInput(text);
                    inputRef.current?.focus();
                  }}
                  onThumbsUp={() => {}}
                  onThumbsDown={() => {}}
                />
              ))}
            </div>

            <div className="flex-shrink-0 relative z-10" style={{ padding: "0 max(8%, 20px) 18px" }}>
              {composer}
              <div style={{ paddingTop: 8 }}>
                <AdNativeBarAlt />
              </div>
            </div>
          </>
        )}

        <AnimatePresence>
          {showScreenWidget && <ScreenWidget onClose={() => setShowScreenWidget(false)} />}
        </AnimatePresence>
      </div>

      {historyModal}
      {loginModal}
    </div>
  );
}
