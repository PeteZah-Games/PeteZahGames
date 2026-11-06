import { useEffect } from "react";
import { Loader2 } from "lucide-react";

function sameOriginHome(url: string) {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname === "/";
  } catch {
    return false;
  }
}

export default function VortexCallback() {
  useEffect(() => {
    try {
      window.opener = null;
    } catch {}
    const q = window.location.search || "";
    try {
      history.replaceState(null, "", "/api/chat/callback");
    } catch {}
    let back = `${window.location.origin}/?m=${encodeURIComponent("petezah://chat")}`;
    const leave = () => {
      try {
        window.close();
      } catch {}
      window.setTimeout(() => {
        if (!window.closed) window.location.replace(back);
      }, 400);
    };
    const timer = window.setTimeout(leave, 12000);
    fetch(`/api/chat/finish${q}`, { credentials: "include", headers: { Accept: "application/json" }, redirect: "manual" })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (typeof d?.back === "string" && sameOriginHome(d.back)) back = d.back;
        if (d?.loggedIn) {
          try {
            localStorage.setItem("pz-vtx-done", String(Date.now()));
          } catch {}
          try {
            const ch = new BroadcastChannel("pz-room");
            ch.postMessage("vtx");
            ch.close();
          } catch {}
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        leave();
      });
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "#020810", color: "hsl(216 15% 68%)" }}>
      <div className="flex items-center gap-3 text-sm">
        <Loader2 className="animate-spin" size={16} style={{ color: "hsl(213 80% 78%)" }} />
        Finishing Vortex sign-in
      </div>
    </div>
  );
}
