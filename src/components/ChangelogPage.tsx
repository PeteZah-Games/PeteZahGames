import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, ChevronDown, ChevronUp, Heart, Trash2, Send, Loader2, Plus, MessageSquare } from "lucide-react";
import { AdPageStack } from "@/components/ads/Units";
import { MentionsText } from "@/lib/mentions";

interface Entry { id: string; title: string; content: string; username?: string; created_at: number; likes?: number; }
interface Comment { id: string; content: string; username?: string; avatar_url?: string; created_at: number; user_id?: string; }

function timeAgo(ts: number) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ChangelogPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentTarget, setCommentTarget] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch("/api/changelog", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        const entries = d.entries || [];
        setEntries(entries);
        entries.forEach((e: Entry) => {
          fetch(`/api/likes?type=changelog&targetId=${encodeURIComponent(e.id)}`, { credentials: "include" })
            .then(r => r.json())
            .then(d => {
              setLikeCounts(prev => ({ ...prev, [e.id]: d.count || 0 }));
              if (d.userLiked) setLiked(prev => { const n = new Set(prev); n.add(e.id); return n; });
            });
        });
      })
      .finally(() => setLoading(false));

    fetch("/api/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setIsAdmin((d.user.is_admin ?? 0) >= 1 || !!d.user.is_owner);
        }
      });
  }, []);

  async function post() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setPosting(true);
    try {
      const r = await fetch("/api/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });
      if (r.ok) {
        const d = await r.json();
        setEntries(prev => [{ id: d.id, title: newTitle, content: newContent, created_at: Date.now() }, ...prev]);
        setNewTitle(""); setNewContent(""); setShowForm(false);
      }
    } finally { setPosting(false); }
  }

  async function del(id: string) {
    await fetch(`/api/changelog/${id}`, { method: "DELETE", credentials: "include" });
    setEntries(p => p.filter(e => e.id !== id));
  }

  async function like(id: string) {
    const r = await fetch("/api/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type: "changelog", targetId: id }),
    });
    if (!r.ok) return;
    const d = await r.json();
    setLiked(p => {
      const n = new Set(p);
      if (d.liked) n.add(id); else n.delete(id);
      return n;
    });
    setLikeCounts(p => ({ ...p, [id]: typeof d.count === "number" ? d.count : (p[id] || 0) }));
  }

  async function openComments(id: string) {
    if (commentTarget === id) { setCommentTarget(null); return; }
    setCommentTarget(id);
    setCommentsLoading(true);
    setComments([]);
    fetch(`/api/comments?type=changelog&targetId=${encodeURIComponent(id)}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .finally(() => setCommentsLoading(false));
  }

  async function deleteComment(commentId: string) {
    await fetch("/api/comment/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ commentId }),
    });
    setComments(p => p.filter(c => c.id !== commentId));
  }

  async function postComment() {
    if (!newComment.trim() || !commentTarget) return;
    setCommentPosting(true);
    try {
      const r = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "changelog", targetId: commentTarget, content: newComment }),
      });
      if (r.ok) {
        const d = await r.json();
        setComments(p => [...p, d.comment || { id: d.id, content: newComment, created_at: Date.now(), username: "You" }]);
        setNewComment("");
      }
    } finally { setCommentPosting(false); }
  }

  function goUser(username?: string) {
    if (!username || username === "User" || username === "Team") return;
    onNavigate(`petezah://user/@${username}`);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "transparent" }}>
      <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid hsl(216 20% 16% / 0.7)", background: "hsla(216, 30%, 8%, 0.62)", backdropFilter: "blur(14px)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "hsl(216 22% 12%)", border: "1px solid hsl(216 20% 16%)" }}>
          <Megaphone size={14} style={{ color: "hsl(213 70% 58%)" }} />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold" style={{ color: "hsl(0 0% 96%)" }}>Changelog</h1>
          <p className="text-[10px]" style={{ color: "hsl(216 15% 45%)" }}>Updates &amp; releases</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: showForm ? "hsl(215 85% 52% / 0.15)" : "hsl(220 22% 12%)",
              color: "hsl(215 85% 65%)",
              border: "1px solid hsl(215 85% 52% / 0.2)",
            }}>
            <Plus size={11} />
            New Update
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3" style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(220 18% 14%) transparent" }}>
        {/* Post form */}
        <AnimatePresence>
          {isAdmin && showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="p-4 rounded-2xl mb-1 space-y-3"
                style={{ background: "hsl(215 85% 52% / 0.05)", border: "1px solid hsl(215 85% 52% / 0.15)" }}>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Update title..."
                  className="w-full text-sm py-2.5 px-3 rounded-xl outline-none"
                  style={{ background: "hsl(220 25% 9%)", border: "1px solid hsl(220 18% 15%)", color: "hsl(220 15% 90%)", fontFamily: "inherit" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "hsl(215 85% 52% / 0.45)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "hsl(220 18% 15%)")} />
                <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
                  placeholder="Describe what's new… use @username to mention someone" rows={4}
                  className="w-full text-sm py-2.5 px-3 rounded-xl outline-none resize-none"
                  style={{ background: "hsl(220 25% 9%)", border: "1px solid hsl(220 18% 15%)", color: "hsl(220 15% 90%)", fontFamily: "inherit" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "hsl(215 85% 52% / 0.45)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "hsl(220 18% 15%)")} />
                <div className="flex items-center gap-2">
                  <button onClick={post} disabled={posting || !newTitle.trim() || !newContent.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: "hsl(213 55% 32%)", border: "1px solid hsl(213 45% 42%)", color: "#fff", opacity: posting || !newTitle.trim() || !newContent.trim() ? 0.5 : 1 }}>
                    {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Publish
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-xs transition-all"
                    style={{ color: "hsl(220 15% 42%)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin" style={{ color: "hsl(215 85% 52%)" }} />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: "hsl(220 15% 28%)" }}>
            <Megaphone size={32} className="mb-3 opacity-25" />
            <p className="text-sm">No updates yet</p>
          </div>
        ) : entries.map((entry, i) => (
          <motion.div key={entry.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.035 }}
            className="rounded-2xl overflow-hidden"
            style={{ background: "hsla(216, 26%, 9%, 0.84)", border: "1px solid hsl(216 20% 16%)", backdropFilter: "blur(10px)" }}>
            <button
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                style={{ background: "hsl(215 85% 60%)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "hsl(220 15% 88%)" }}>{entry.title}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "hsl(220 15% 36%)" }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goUser(entry.username); }}
                    style={{ background: "none", border: "none", padding: 0, cursor: entry.username ? "pointer" : "default", color: entry.username ? "hsl(215 85% 62%)" : "inherit", font: "inherit" }}
                  >
                    {entry.username || "Team"}
                  </button>
                  {" · "}{timeAgo(entry.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={e => { e.stopPropagation(); like(entry.id); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all"
                  style={{
                    color: liked.has(entry.id) ? "hsl(0 65% 62%)" : "hsl(220 15% 36%)",
                    background: liked.has(entry.id) ? "hsl(0 65% 50% / 0.1)" : "transparent",
                  }}>
                  <Heart size={10} fill={liked.has(entry.id) ? "currentColor" : "none"} />
                  {(likeCounts[entry.id] || 0) > 0 && <span>{likeCounts[entry.id]}</span>}
                </button>
                <button onClick={e => { e.stopPropagation(); openComments(entry.id); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all"
                  style={{ color: commentTarget === entry.id ? "hsl(215 85% 62%)" : "hsl(220 15% 36%)" }}>
                  <MessageSquare size={10} />
                </button>
                {isAdmin && (
                  <button onClick={e => { e.stopPropagation(); del(entry.id); }}
                    className="p-1.5 rounded-lg transition-all"
                    style={{ color: "hsl(220 15% 26%)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "hsl(0 65% 52%)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "hsl(220 15% 26%)")}>
                    <Trash2 size={11} />
                  </button>
                )}
                {expanded === entry.id
                  ? <ChevronUp size={12} style={{ color: "hsl(220 15% 32%)" }} />
                  : <ChevronDown size={12} style={{ color: "hsl(220 15% 32%)" }} />}
              </div>
            </button>
            <AnimatePresence>
              {expanded === entry.id && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <p className="px-4 pb-4 pt-3 text-sm leading-relaxed"
                    style={{ color: "hsl(220 15% 58%)", borderTop: "1px solid hsl(220 18% 12%)" }}>
                    <MentionsText text={entry.content} onNavigate={onNavigate} />
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {commentTarget === entry.id && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="px-4 pb-4 pt-3" style={{ borderTop: "1px solid hsl(220 18% 12%)" }}>
                    {commentsLoading ? (
                      <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin" style={{ color: "hsl(215 85% 52%)" }} /></div>
                    ) : comments.length === 0 ? (
                      <p className="text-[10px] text-center py-2" style={{ color: "hsl(220 15% 30%)" }}>No comments yet</p>
                    ) : (
                      <div className="space-y-2 mb-3">
                        {comments.map(c => (
                          <div key={c.id} className="flex gap-2 items-start w-full">
                            <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold" style={{ background: "hsl(215 85% 40%)", color: "hsl(215 85% 80%)" }}>
                              {(c.username || "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <button
                                type="button"
                                onClick={() => goUser(c.username)}
                                className="text-[10px] font-semibold mr-1.5"
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "hsl(215 85% 60%)", font: "inherit" }}
                              >
                                {c.username || "User"}
                              </button>
                              <MentionsText text={c.content} onNavigate={onNavigate} style={{ fontSize: 11, color: "hsl(220 15% 62%)" }} />
                            </div>
                            {isAdmin && (
                              <button onClick={() => deleteComment(c.id)}
                                className="p-1 rounded transition-all flex-shrink-0"
                                style={{ color: "hsl(220 15% 26%)" }}
                                onMouseEnter={e => (e.currentTarget.style.color = "hsl(0 65% 52%)")}
                                onMouseLeave={e => (e.currentTarget.style.color = "hsl(220 15% 26%)")}>
                                <Trash2 size={9} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <input value={newComment} onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") postComment(); }}
                        placeholder="Add a comment… @username to mention"
                        className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                        style={{ background: "hsl(220 25% 9%)", border: "1px solid hsl(220 18% 15%)", color: "hsl(220 15% 88%)", fontFamily: "inherit" }} />
                      <button onClick={postComment} disabled={commentPosting || !newComment.trim()}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ background: "hsl(215 85% 52% / 0.15)", border: "1px solid hsl(215 85% 52% / 0.2)", opacity: commentPosting || !newComment.trim() ? 0.4 : 1 }}>
                        {commentPosting ? <Loader2 size={11} className="animate-spin" style={{ color: "hsl(215 85% 60%)" }} /> : <Send size={11} style={{ color: "hsl(215 85% 60%)" }} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
      <AdPageStack dense />
    </div>
  );
}