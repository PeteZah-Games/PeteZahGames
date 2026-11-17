import { useEffect, useState } from "react";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";

type C = {
  surface: string;
  elevated: string;
  border: string;
  borderFocus: string;
  accent: string;
  accentDim: string;
  text: string;
  textSub: string;
  textMuted: string;
  danger: string;
  success: string;
};

type Insight = { tone: "good" | "warn" | "info"; title: string; body: string };

function fmt(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function money(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n || 0);
  } catch {
    return `${fmt(n, 2)} ${currency}`;
  }
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

function Stat({
  C,
  label,
  value,
  sub,
}: {
  C: C;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
      <p style={{ margin: 0, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ margin: "3px 0 0", fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>{value}</p>
      {sub ? <p style={{ margin: "3px 0 0", fontSize: 10, color: C.textSub }}>{sub}</p> : null}
    </div>
  );
}

function Bars({
  C,
  rows,
  valueKey,
  labelKey,
  maxItems = 12,
}: {
  C: C;
  rows: any[];
  valueKey: string;
  labelKey: string;
  maxItems?: number;
}) {
  const list = (rows || []).slice(0, maxItems);
  const max = Math.max(1, ...list.map((r) => Number(r[valueKey]) || 0));
  if (!list.length) {
    return <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>No rows yet</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {list.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        return (
          <div key={`${r[labelKey]}-${i}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {String(r[labelKey] || "—")}
              </span>
              <span style={{ fontSize: 11, fontWeight: 650, color: C.accent, flexShrink: 0 }}>{fmt(v, v < 10 && v % 1 ? 2 : 0)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: C.elevated, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(2, (v / max) * 100)}%`, height: "100%", background: "hsla(210, 40%, 70%, 0.55)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AdReportsPanel({ C }: { C: C }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = (force = false) => {
    setLoading(true);
    setErr("");
    fetch("/api/admin/ad-reports", { credentials: "include", cache: force ? "reload" : "default" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) throw new Error("forbidden");
        if (r.status === 429) throw new Error("rate");
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => {
        setErr(e?.message === "forbidden" ? "Admin access required" : e?.message === "rate" ? "Slow down and retry" : "Could not load reports");
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = window.setInterval(() => load(), 90000);
    return () => window.clearInterval(t);
  }, []);

  const ac = data?.exoclick || {};
  const ours = data?.ours || {};
  const cur = ac.currency || data?.balance?.currency || "USD";
  const insights: Insight[] = Array.isArray(data?.insights) ? data.insights : [];

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={14} style={{ color: C.accent }} />
          Ad reports
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {data?.balance ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${C.accentDim}`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
              Balance {money(data.balance.amount, data.balance.currency || cur)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => load(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 650,
              padding: "6px 10px",
              borderRadius: 8,
              background: C.accentDim,
              border: `1px solid ${C.borderFocus}`,
              color: C.accent,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>
      <p style={{ fontSize: 11, color: C.textSub, margin: "0 0 14px" }}>
        PeteZah overlay starts vs ExoClick publisher stats. Token stays on the server. Dates in UTC
        {ac.timezone && ac.timezone !== "UTC" ? ` · ExoClick ${ac.timezone}` : ""}.
      </p>

      {loading && !data ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 36 }}>
          <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
        </div>
      ) : err ? (
        <p style={{ fontSize: 12, color: C.danger }}>{err}</p>
      ) : (
        <>
          {!data?.configured ? (
            <p style={{ fontSize: 12, color: C.danger, margin: "0 0 14px" }}>
              EXOCLICK_API_TOKEN is not set. Local overlay stats still show below.
            </p>
          ) : null}
          {ac.error && data?.configured ? (
            <p style={{ fontSize: 12, color: C.danger, margin: "0 0 14px" }}>
              ExoClick API error: {String(ac.error)}
              {data?.proxy ? " (relay on)" : " — if your VPS IP is blocked, set EXOCLICK_HTTP_PROXY"}.
              Local counts are still live.
            </p>
          ) : null}

          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
            Today · views
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8, marginBottom: 14 }}>
            <Stat C={C} label="Ours today" value={fmt(ours.today?.views || 0)} sub="Started video ads" />
            <Stat C={C} label="ExoClick today" value={fmt(ac.today?.views || 0)} sub={ac.today?.impressions ? "Impressions" : "Views"} />
            <Stat
              C={C}
              label="Gap"
              value={fmt(data?.compare?.delta || 0)}
              sub={data?.compare?.ratio != null ? `Ours/ExoClick ${pct(data.compare.ratio)}` : "No ExoClick baseline"}
            />
            <Stat C={C} label="Ours uniques" value={fmt(ours.today?.uniqueVisitors || 0)} sub={`${fmt(ours.today?.freq || 0, 2)} per visitor`} />
            <Stat C={C} label="ExoClick views" value={fmt(ac.today?.uniqueUsers || ac.today?.views || 0)} sub={`${fmt(ac.today?.impressions || 0)} impressions`} />
            <Stat C={C} label="Start rate" value={pct(ours.today?.startRate || 0)} sub={`${fmt(ours.today?.views || 0)} / ${fmt(ours.today?.attempts || 0)} attempts`} />
          </div>

          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
            Today · money & quality
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8, marginBottom: 14 }}>
            <Stat C={C} label="Earnings today" value={money(ac.today?.earnings || 0, cur)} sub={`Yesterday ${money(ac.yesterday?.earnings || 0, cur)}`} />
            <Stat C={C} label="eCPM" value={fmt(ac.today?.ecpm || 0, 2)} sub={`7d ${fmt(ac.d7?.ecpm || 0, 2)}`} />
            <Stat C={C} label="Clicks" value={fmt(ac.today?.clicks || 0)} sub={`CTR ${pct(ac.today?.ctr || 0)}`} />
            <Stat C={C} label="Video views" value={fmt(ac.today?.videoViews || 0)} sub={`VTR ${pct(ac.today?.vtr || 0)}`} />
            <Stat C={C} label="Completions" value={pct(ac.today?.vtr || 0)} sub={`${fmt(ac.today?.videoViews || 0)} completed`} />
          </div>

          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
            Ranges
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8, marginBottom: 14 }}>
            <Stat C={C} label="Ours 7d" value={fmt(ours.d7?.views || 0)} sub={`${fmt(ours.d7?.uniqueVisitors || 0)} uniques`} />
            <Stat C={C} label="ExoClick 7d" value={fmt(ac.d7?.views || 0)} sub={money(ac.d7?.earnings || 0, cur)} />
            <Stat C={C} label="Ours 30d" value={fmt(ours.d30?.views || 0)} sub={`${fmt(ours.d30?.uniqueVisitors || 0)} uniques`} />
            <Stat C={C} label="ExoClick 30d" value={fmt(ac.d30?.views || 0)} sub={money(ac.d30?.earnings || 0, cur)} />
            <Stat C={C} label="Games / apps / VM" value={`${ours.today?.byContext?.game || 0} / ${ours.today?.byContext?.app || 0} / ${ours.today?.byContext?.vm || 0}`} sub="Started today" />
            <Stat C={C} label="Yesterday ours" value={fmt(ours.yesterday?.views || 0)} sub={`ExoClick ${fmt(ac.yesterday?.views || 0)}`} />
          </div>

          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
            Insights
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {insights.length ? insights.map((i) => (
              <div
                key={i.title}
                style={{
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: C.surface,
                  border: `1px solid ${i.tone === "warn" ? "hsla(28,70%,50%,0.35)" : i.tone === "good" ? "hsla(145,45%,40%,0.28)" : C.border}`,
                }}
              >
                <p style={{ margin: 0, fontSize: 12, fontWeight: 650, color: C.text }}>{i.title}</p>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: C.textSub, lineHeight: 1.45 }}>{i.body}</p>
              </div>
            )) : (
              <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Insights appear once there is data.</p>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                Hourly starts (UTC)
              </p>
              <Bars
                C={C}
                rows={(ours.hours || []).map((h: any) => ({ ...h, label: `${String(h.hour).padStart(2, "0")}:00` }))}
                valueKey="views"
                labelKey="label"
                maxItems={24}
              />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                ExoClick by date
              </p>
              <Bars C={C} rows={(ac.byDate || []).map((r: any) => ({ ...r, label: r.key }))} valueKey="views" labelKey="label" maxItems={16} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                Zones
              </p>
              <Bars C={C} rows={(ac.byZone || []).map((r: any) => ({ ...r, label: r.key }))} valueKey="earnings" labelKey="label" />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                Countries
              </p>
              <Bars C={C} rows={(ac.byCountry || []).map((r: any) => ({ ...r, label: r.key }))} valueKey="views" labelKey="label" />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                Devices
              </p>
              <Bars C={C} rows={(ac.byDevice || []).map((r: any) => ({ ...r, label: r.key }))} valueKey="views" labelKey="label" />
            </div>
          </div>

          {(ac.bySite || []).length ? (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
                Sites
              </p>
              <Bars C={C} rows={ac.bySite.map((r: any) => ({ ...r, label: r.key }))} valueKey="earnings" labelKey="label" />
            </div>
          ) : null}

          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>
              Zone table (today)
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "28vh", overflowY: "auto" }}>
              {(ac.byZone || []).length ? ac.byZone.map((z: any) => (
                <div
                  key={z.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.key}</span>
                  <span style={{ fontSize: 11, color: C.textSub }}>{fmt(z.views)} views</span>
                  <span style={{ fontSize: 11, color: C.textSub }}>eCPM {fmt(z.ecpm, 2)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{money(z.earnings, cur)}</span>
                </div>
              )) : (
                <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>No zone rows</p>
              )}
            </div>
          </div>

          <p style={{ fontSize: 10, color: C.textMuted, margin: "12px 0 0" }}>
            Generated {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—"} · cached ~2 min · {data?.day || ""}
          </p>
        </>
      )}
    </div>
  );
}
