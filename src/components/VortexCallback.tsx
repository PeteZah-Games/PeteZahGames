import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function VortexCallback() {
  useEffect(() => {
    const q = window.location.search || "";
    fetch(`/api/chat/finish${q}`, { credentials: "include", redirect: "manual" })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (typeof d?.back === "string" && /^https?:\/\//i.test(d.back)) {
          window.location.replace(d.back);
          return;
        }
        const dest =
          typeof d?.returnTo === "string" && d.returnTo.startsWith("petezah://")
            ? d.returnTo
            : "petezah://chat";
        const origin =
          typeof d?.returnOrigin === "string" && /^https?:\/\//i.test(d.returnOrigin)
            ? d.returnOrigin.replace(/\/$/, "")
            : window.location.origin;
        window.location.replace(`${origin}/?m=${encodeURIComponent(dest)}`);
      })
      .catch(() => {
        window.location.replace(`/?m=${encodeURIComponent("petezah://chat")}`);
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
