import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Lock, Monitor, ExternalLink, Loader2, Sparkles, Maximize2 } from "lucide-react";
import { setPendingAuth } from "@/lib/authPending";
import { armAdAudio, runInterstitial } from "@/lib/adGate";
import { LoaderSlots } from "@/components/ads/Units";

export default function FirefoxVmPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [assetOk, setAssetOk] = useState(true);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.user) setAuthed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    fetch("/firefox-wasm/index.html", { method: "HEAD", credentials: "include" })
      .then((r) => {
        if (!cancelled) setAssetOk(r.ok);
      })
      .catch(() => {
        if (!cancelled) setAssetOk(false);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authed]);

  async function launchVm() {
    if (!ready || launching) return;
    armAdAudio();
    flushSync(() => setLaunching(true));
    try {
      await runInterstitial("vm");
    } catch {}
    try {
      sessionStorage.setItem("pz-vm-return", "1");
    } catch {}
    window.location.assign("/firefox-wasm/index.html");
  }

  if (loading) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: "transparent" }}
      >
        <Loader2 className="animate-spin" size={18} style={{ color: "hsl(213 70% 62%)" }} />
      </div>
    );
  }

  if (!authed) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-5 px-6"
        style={{ background: "transparent" }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: "hsl(216 30% 10%)",
            border: "1px solid hsl(213 40% 30%)",
          }}
        >
          <Lock size={20} style={{ color: "hsl(213 80% 78%)" }} />
        </div>
        <div className="text-center max-w-sm">
          <p
            className="text-lg font-extrabold mb-1 tracking-tight"
            style={{ color: "hsl(0 0% 100%)" }}
          >
            PeteZah VM
          </p>
          <p className="text-sm font-medium mb-1" style={{ color: "hsl(0 0% 96%)" }}>
            Sign in to launch
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "hsl(216 15% 68%)" }}>
            Firefox in WebAssembly — a real Gecko browser inside PeteZah. Account required.
          </p>
        </div>
        <button
          onClick={() => {
            setPendingAuth({ type: "vm" });
            onNavigate("petezah://account");
          }}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{
            background: "hsl(213 55% 32%)",
            border: "1px solid hsl(213 45% 42%)",
          }}
        >
          Sign In
        </button>
        <p className="text-[10px]" style={{ color: "hsl(216 15% 55%)" }}>
          Powered by{" "}
          <a
            href="https://developer.puter.com/labs/firefox-wasm/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "hsl(213 75% 68%)" }}
          >
            Puter Labs
          </a>
        </p>
      </div>
    );
  }

  if (!assetOk) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ background: "transparent" }}
      >
        <Monitor size={22} style={{ color: "hsl(216 15% 60%)" }} />
        <p className="text-sm" style={{ color: "hsl(0 0% 96%)" }}>
          VM assets are not installed on this server.
        </p>
        <p className="text-xs max-w-md" style={{ color: "hsl(216 15% 65%)" }}>
          Run <code style={{ color: "hsl(213 75% 68%)" }}>npm run vendor:firefox-wasm</code> then redeploy.
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "transparent" }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "hsl(213 40% 30%)" }}
      />
      <div className="relative z-10 flex flex-col items-center text-center max-w-md gap-4">
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
            width: "min(520px, 92vw)",
            height: 320,
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center, hsla(220, 32%, 6%, 0.55) 0%, hsla(220, 30%, 4%, 0.28) 48%, transparent 72%)",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-1"
          style={{
            background: "hsl(216 30% 10%)",
            border: "1px solid hsl(213 40% 32%)",
          }}
        >
          <Monitor size={26} style={{ color: "hsl(213 80% 80%)" }} />
        </div>
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
            style={{ color: "hsl(213 75% 68%)" }}
          >
            PeteZah VMs
          </p>
          <h1
            className="text-3xl font-extrabold tracking-tight mb-2"
            style={{ color: "hsl(0 0% 100%)" }}
          >
            Firefox VM
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "hsl(216 15% 72%)" }}>
            Opens as a full-page browser (WebAssembly).
          </p>
        </div>
        <button
          onClick={launchVm}
          disabled={!ready || launching}
          className="mt-2 inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{
            background: "hsl(213 55% 32%)",
            border: "1px solid hsl(213 45% 42%)",
          }}
        >
          {launching || !ready ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {launching ? "Starting…" : "Preparing…"}
            </>
          ) : (
            <>
              <Maximize2 size={15} />
              Launch VM
            </>
          )}
        </button>
        <p className="text-[11px] mt-1" style={{ color: "hsl(216 15% 58%)" }}>
          Uses Virginia relay · Credit{" "}
          <a
            href="https://github.com/HeyPuter/firefox-wasm"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5"
            style={{ color: "hsl(213 75% 68%)" }}
          >
            Puter / firefox-wasm <ExternalLink size={9} />
          </a>
        </p>
        <p className="text-[10px] flex items-center gap-1" style={{ color: "hsl(216 15% 52%)" }}>
          <Sparkles size={10} />
          Use Exit on the VM splash to return to PeteZah
        </p>
      </div>
      {launching ? (
        <div
          className="absolute inset-0 z-20"
          data-pz-content-frame="1"
          style={{ background: "#070b12" }}
        >
          <LoaderSlots />
        </div>
      ) : null}
    </div>
  );
}