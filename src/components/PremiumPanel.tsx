import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

type C = {
  surface: string;
  border: string;
  borderFocus: string;
  accent: string;
  accentDim: string;
  text: string;
  textSub: string;
  textMuted: string;
  danger: string;
};

type Entry = {
  id: string;
  kind: "user" | "ip";
  label: string;
  note: string;
  created_at: number;
};

export function PremiumPanel({ C }: { C: C }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"user" | "ip">("user");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    return fetch("/api/admin/premium", { credentials: "include" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Failed to load");
        setEntries(d.entries || []);
      })
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/premium", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value: v, note: note.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not add");
      setValue("");
      setNote("");
      if (d.entry) setEntries((prev) => [d.entry, ...prev.filter((e) => e.id !== d.entry.id)]);
      else await load();
    } catch (e: any) {
      setErr(e?.message || "Could not add");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/premium/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not remove");
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e: any) {
      setErr(e?.message || "Could not remove");
    } finally {
      setBusy(false);
    }
  };

  const field: CSSProperties = {
    width: "100%",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 12,
    padding: "8px 12px",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 12px" }}>
        Grant ad-free access by username or IP. Applies to display ads and interstitial breaks.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px",
          borderRadius: 10,
          background: C.surface,
          border: `1px solid ${C.border}`,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {(["user", "ip"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              style={{
                padding: "5px 10px",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${kind === k ? C.borderFocus : C.border}`,
                background: kind === k ? C.accentDim : "transparent",
                color: kind === k ? C.text : C.textMuted,
              }}
            >
              {k === "user" ? "User" : "IP"}
            </button>
          ))}
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "user" ? "Username" : "IPv4 address"}
          style={field}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 80))}
          placeholder="Note (optional)"
          style={field}
        />
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => void add()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${C.borderFocus}`,
            background: C.accentDim,
            color: C.accent,
            fontSize: 12,
            fontWeight: 650,
            cursor: busy || !value.trim() ? "not-allowed" : "pointer",
            opacity: busy || !value.trim() ? 0.5 : 1,
          }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add ad-free
        </button>
      </div>

      {err ? (
        <p style={{ fontSize: 11, color: C.danger, margin: "0 0 10px" }}>{err}</p>
      ) : null}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ fontSize: 11, color: C.textMuted, textAlign: "center", padding: 24, margin: 0 }}>
          No premium entries yet
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {entries.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 9,
                background: C.surface,
                border: `1px solid ${C.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  padding: "2px 5px",
                  borderRadius: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  background: e.kind === "user" ? `${C.accent}18` : "hsla(165, 45%, 42%, 0.15)",
                  color: e.kind === "user" ? C.accent : "hsl(165 50% 52%)",
                  border: `1px solid ${e.kind === "user" ? `${C.accent}30` : "hsla(165, 45%, 42%, 0.3)"}`,
                  flexShrink: 0,
                }}
              >
                {e.kind}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 650, color: C.text }}>{e.label}</p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: C.textMuted }}>
                  {e.note ? `${e.note} · ` : ""}
                  {e.created_at ? new Date(e.created_at).toLocaleDateString() : ""}
                </p>
              </div>
              <button
                type="button"
                title="Remove"
                disabled={busy}
                onClick={() => void remove(e.id)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  cursor: busy ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Trash2 size={12} style={{ color: C.danger }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
