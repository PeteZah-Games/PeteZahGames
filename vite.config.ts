import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { componentTagger } from "lovable-tagger";

function gameAssetsPassthrough(mode: string): Plugin {
  const root = path.resolve(__dirname);
  const src = path.join(root, "public/storage/ag");
  const dest = path.join(root, "dist/storage/ag");
  const parkPublic = path.join(root, ".tmp-ag-assets");
  let publicParked = false;
  const skip = mode === "svg";

  const restorePublic = () => {
    if (!existsSync(parkPublic)) {
      publicParked = false;
      return;
    }
    if (!existsSync(src)) {
      mkdirSync(path.dirname(src), { recursive: true });
      renameSync(parkPublic, src);
    }
    publicParked = false;
  };

  const parkPublicDir = () => {
    if (publicParked && existsSync(parkPublic) && !existsSync(src)) return;
    restorePublic();
    if (!existsSync(src)) return;
    mkdirSync(path.dirname(parkPublic), { recursive: true });
    renameSync(src, parkPublic);
    publicParked = true;
  };

  const parkDistDir = () => {
    if (!existsSync(dest)) return;
    try {
      if (lstatSync(dest).isSymbolicLink()) {
        unlinkSync(dest);
        return;
      }
    } catch {}
    const parked = existsSync(path.join(root, ".tmp-ag-dist"))
      ? path.join(root, `.tmp-ag-dist-${Date.now()}`)
      : path.join(root, ".tmp-ag-dist");
    mkdirSync(path.dirname(parked), { recursive: true });
    renameSync(dest, parked);
    spawn("rm", ["-rf", parked], { detached: true, stdio: "ignore" }).unref();
  };

  const linkIntoDist = () => {
    restorePublic();
    if (!existsSync(src)) return;
    mkdirSync(path.dirname(dest), { recursive: true });
    parkDistDir();
    symlinkSync(path.relative(path.dirname(dest), src), dest, "dir");
  };

  return {
    name: "game-assets-passthrough",
    apply: "build",
    enforce: "pre",
    config() {
      if (skip) return;
      process.once("exit", restorePublic);
      process.once("SIGINT", () => {
        restorePublic();
      });
      process.once("SIGTERM", () => {
        restorePublic();
      });
      parkPublicDir();
      parkDistDir();
    },
    buildStart() {
      if (skip) return;
      parkPublicDir();
      parkDistDir();
    },
    buildEnd() {
      if (skip) return;
      restorePublic();
    },
    closeBundle() {
      if (skip) return;
      linkIntoDist();
    },
  };
}

async function minifyEngineMigrateHtml(html: string, stamp?: string): Promise<string> {
  let next = html;
  if (stamp) {
    next = next.replace(
      /var g = "dl\d+"/g,
      `var g = ${JSON.stringify(stamp)}`,
    );
  }
  const re = /<script>([\s\S]*?__pzEgMig[\s\S]*?)<\/script>/;
  const m = next.match(re);
  if (!m) return next;
  const { code } = await transformWithEsbuild(m[1], "eg-migrate.js", {
    minify: true,
    legalComments: "none",
  });
  return next.replace(m[0], `<script>${code.trim()}</script>`);
}

function minifyEngineMigrate(): Plugin {
  let outDir = "dist";
  const stamp = `dl13-${Date.now().toString(36)}`;
  return {
    name: "minify-engine-migrate",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async transformIndexHtml(html) {
      return minifyEngineMigrateHtml(html, stamp);
    },
    async closeBundle() {
      const verifyPath = path.resolve(outDir, "verify.html");
      if (!existsSync(verifyPath)) return;
      writeFileSync(
        verifyPath,
        await minifyEngineMigrateHtml(readFileSync(verifyPath, "utf8"), stamp),
      );
    },
  };
}

function banEngineTokens(): Plugin {
  let outDir = "dist";
  const banned = [/scramjet/i, /ultraviolet/i, /\/wisp\//i, /wisp-tor/i, /alt-wisp/i, /BareMux/, /setTransport/, /epoxy/i, /libcurl/i, /baremuxinit/];
  return {
    name: "ban-engine-tokens",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const assets = path.resolve(outDir, "assets");
      if (!existsSync(assets)) return;
      const hits: string[] = [];
      for (const name of readdirSync(assets)) {
        if (!/^index-.*\.js$/.test(name)) continue;
        const text = readFileSync(path.join(assets, name), "utf8");
        for (const re of banned) {
          if (re.test(text)) hits.push(`${name} ${re}`);
        }
      }
      if (hits.length) {
        throw new Error(`Compiled assets still contain blocked tokens:\n${hits.join("\n")}`);
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/websocket": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
      "/afsd123k2": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/q9vx": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/m4thx": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/e7px": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/l9cx": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/api/edge": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/api/chat": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/api/announcements": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/1k123.js": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    gameAssetsPassthrough(mode),
    react(),
    minifyEngineMigrate(),
    banEngineTokens(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  base: mode === "svg" ? "./" : "/",
  build: {
    outDir: mode === "svg" ? "svg" : "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/components/GamesPage")) return "algebra";
          if (id.includes("/components/GameViewerPage")) return "geometry";
          if (id.includes("/components/MoviesPage")) return "literature";
          if (id.includes("/components/MusicPage")) return "acoustics";
          if (id.includes("/components/AIPage")) return "research";
          if (id.includes("/components/AccountPage")) return "student-portal";
          if (id.includes("/components/AppsPage")) return "toolkit";
          if (id.includes("/components/ChatPage")) return "seminar";
          if (id.includes("/components/FirefoxVmPage")) return "chemistry-lab";
          if (id.includes("/components/AdViewerPage")) return "bulletin";
          if (id.includes("/components/AppViewerPage")) return "workbook";
          if (id.includes("/components/ChangelogPage")) return "syllabus";
          if (id.includes("/components/FeedbackPage")) return "evaluation";
          if (id.includes("/components/HistoryPage")) return "timeline";
          if (id.includes("/components/ToolsPage")) return "calculator";
          if (id.includes("/components/ExtensionsPage")) return "modules";
          if (id.includes("/components/BookmarksPage")) return "reading-list";
          if (id.includes("/components/ProfilePage")) return "portfolio";
          if (id.includes("/components/TrendingDashboard")) return "highlights";
          if (id.includes("/components/VantaBackground")) return "meteorology";
          if (id.includes("/ads/Units")) return "periodic-table";
          if (id.includes("/InterstitialAdGate")) return "lab-safety";
          if (id.includes("/lib/adGate")) return "microscope";
          if (!id.includes("node_modules")) return;
          if (id.includes("three") || id.includes("vanta")) return "earth-science";
          if (id.includes("framer-motion")) return "kinematics";
          if (id.includes("lucide-react")) return "glyphs";
          if (id.includes("@tanstack/react-query")) return "datastore";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@rivet": path.resolve(__dirname, "./packages/rivet/src"),
    },
  },
}));
