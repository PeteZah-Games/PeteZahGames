import { useEffect, useState } from "react";
import { isAdFreeClient, refreshAdFreeStatus } from "@/lib/adFree";

const COOL_MS = 3 * 60 * 60 * 1000;
const KEY = "pz-promo-cool";

type Ad = { id: string; imageUrl: string; linkUrl: string };

function coolOk(id: string) {
  try {
    const raw = localStorage.getItem(KEY);
    const map = raw ? JSON.parse(raw) : {};
    const at = Number(map?.[id] || 0);
    return !at || Date.now() - at >= COOL_MS;
  } catch {
    return true;
  }
}

function markCool(id: string) {
  try {
    const raw = localStorage.getItem(KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[id] = Date.now();
    const ids = Object.keys(map);
    if (ids.length > 20) {
      for (const k of ids.slice(0, ids.length - 12)) delete map[k];
    }
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {}
}

export default function CustomPromo() {
  const [ad, setAd] = useState<Ad | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshAdFreeStatus();
      if (!alive || isAdFreeClient()) return;
      try {
        const r = await fetch("/api/ads/promo", { credentials: "include", cache: "no-store" });
        const d = await r.json().catch(() => null);
        const next = d?.ad;
        if (!next?.id || !next?.imageUrl || !coolOk(next.id)) return;
        if (alive) setAd(next);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ad || closed) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 95,
        maxWidth: "min(280px, calc(100vw - 28px))",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
        background: "#0b1220",
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          markCool(ad.id);
          setClosed(true);
        }}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          zIndex: 2,
          width: 22,
          height: 22,
          borderRadius: 999,
          border: "1px solid hsla(210,30%,80%,0.25)",
          background: "hsla(220,28%,10%,0.9)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        ×
      </button>
      <a
        href={ad.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => markCool(ad.id)}
        style={{ display: "block" }}
      >
        <img
          src={ad.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ display: "block", width: "100%", height: "auto", maxHeight: 160, objectFit: "cover" }}
        />
      </a>
    </div>
  );
}
