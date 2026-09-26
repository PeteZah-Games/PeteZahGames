/**
 * Canvas 2D port of Codrops RainEffect for filter-safe homepage use.
 * Same drop-alpha / drop-color water-map sim as /fx/rain; refraction mirrors water.frag in JS.
 * Codrops license: free to integrate into projects; don't republish the effect as-is.
 */

import { useEffect, useRef, useState } from "react";
import { normalizeRainScene } from "@/lib/rainScenes";

const DROP_SIZE = 64;
/**
 * Codrops sizes are easy to swap — in /fx/rain:
 *   textureFg (through drops) = 96×64
 *   textureBg (visible glass)  = 384×256
 * RainRenderer(canvas, liquid, textureFg, textureBg)
 */
const FG_W = 96;
const FG_H = 64;
const BG_W = 384;
const BG_H = 256;
/** imageBg is the 384×256 canvas → width/height = 1.5 */
const TEXTURE_RATIO = BG_W / BG_H;

// Matches /fx/rain RainRenderer boot overrides
const MIN_REFRACTION = 256;
const REFRACTION_DELTA = 256; // maxRefraction 512 - min 256
const BRIGHTNESS = 1.04;
const ALPHA_MUL = 6;
const ALPHA_SUB = 3;

type Drop = {
  x: number;
  y: number;
  r: number;
  spreadX: number;
  spreadY: number;
  momentum: number;
  momentumX: number;
  lastSpawn: number;
  nextSpawn: number;
  parent: Drop | null;
  isNew: boolean;
  killed: boolean;
  shrink: number;
};

function sceneId(): string {
  try {
    return normalizeRainScene(localStorage.getItem("rainScene"));
  } catch {
    return "harbor";
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function createCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

/** WebGL rain does drawImage(img, 0, 0, tw, th) — stretch, not cover-crop. */
function stretchDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  ctx.drawImage(img, 0, 0, w, h);
}

function random(min: number, max?: number, curve?: (n: number) => number): number {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  let n = Math.random();
  if (curve) n = curve(n);
  return min + n * (max - min);
}

function chance(p: number) {
  return Math.random() <= p;
}

function makeDrop(partial: Partial<Drop> = {}): Drop {
  return {
    x: 0,
    y: 0,
    r: 0,
    spreadX: 0,
    spreadY: 0,
    momentum: 0,
    momentumX: 0,
    lastSpawn: 0,
    nextSpawn: 0,
    parent: null,
    isNew: true,
    killed: false,
    shrink: 0,
    ...partial,
  };
}

/**
 * Codrops scaledTexCoord + bilinear filter.
 * textureRatio comes from imageBg canvas (384/256 = 1.5), not the photo file.
 */
function sampleTex(
  data: Uint8ClampedArray,
  tw: number,
  th: number,
  u: number,
  v: number,
  resX: number,
  resY: number,
  textureRatio: number,
): [number, number, number] {
  const ratio = resX / resY;
  let scaleX = 1;
  let scaleY = 1;
  let offsetX = 0;
  let offsetY = 0;
  const ratioDelta = ratio - textureRatio;
  if (ratioDelta >= 0) {
    scaleY = 1 + ratioDelta;
    offsetY = ratioDelta / 2;
  } else {
    scaleX = 1 - ratioDelta;
    offsetX = -ratioDelta / 2;
  }
  let su = (u + offsetX) / scaleX;
  let sv = (v + offsetY) / scaleY;
  if (su < 0) su = 0;
  else if (su > 1) su = 1;
  if (sv < 0) sv = 0;
  else if (sv > 1) sv = 1;

  const fx = su * (tw - 1);
  const fy = sv * (th - 1);
  const x0 = fx | 0;
  const y0 = fy | 0;
  const x1 = x0 < tw - 1 ? x0 + 1 : x0;
  const y1 = y0 < th - 1 ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;

  const i00 = (y0 * tw + x0) * 4;
  const i10 = (y0 * tw + x1) * 4;
  const i01 = (y1 * tw + x0) * 4;
  const i11 = (y1 * tw + x1) * 4;

  const r =
    data[i00] * (1 - tx) * (1 - ty) +
    data[i10] * tx * (1 - ty) +
    data[i01] * (1 - tx) * ty +
    data[i11] * tx * ty;
  const g =
    data[i00 + 1] * (1 - tx) * (1 - ty) +
    data[i10 + 1] * tx * (1 - ty) +
    data[i01 + 1] * (1 - tx) * ty +
    data[i11 + 1] * tx * ty;
  const b =
    data[i00 + 2] * (1 - tx) * (1 - ty) +
    data[i10 + 2] * tx * (1 - ty) +
    data[i01 + 2] * (1 - tx) * ty +
    data[i11 + 2] * tx * ty;
  return [r, g, b];
}

export default function SafeRainBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(sceneId);

  useEffect(() => {
    const sync = () => setScene(sceneId());
    window.addEventListener("storage", sync);
    window.addEventListener("petezah-settings-updated", sync);
    const id = window.setInterval(sync, 1500);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("petezah-settings-updated", sync);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const display = document.createElement("canvas");
    display.setAttribute("aria-hidden", "true");
    display.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
    host.appendChild(display);
    const dctx = display.getContext("2d", { alpha: false });
    if (!dctx) return;

    let disposed = false;
    let raf = 0;
    let width = 0;
    let height = 0;
    let scale = 1;

    // Closer to stock Codrops rain density; seedGlass() fills on first paint.
    const opts = {
      minR: 20,
      maxR: 50,
      maxDrops: 700,
      rainChance: 0.34,
      rainLimit: 5,
      dropletsRate: 48,
      dropletsSize: [3, 5.5] as [number, number],
      dropletsCleaningRadiusMultiplier: 0.28,
      raining: true,
      globalTimeScale: 1,
      trailRate: 1,
      autoShrink: true,
      spawnArea: [-0.1, 0.95] as [number, number],
      trailScaleRange: [0.2, 0.45] as [number, number],
      collisionRadius: 0.45,
      collisionRadiusIncrease: 0.0002,
      dropFallMultiplier: 1,
      collisionBoostMultiplier: 0.05,
      collisionBoost: 1,
    };

    let dropAlpha: HTMLImageElement | null = null;
    let dropColor: HTMLImageElement | null = null;
    let dropsGfx: HTMLCanvasElement[] = [];
    let clearDropletsGfx: HTMLCanvasElement | null = null;

    let liquid: HTMLCanvasElement | null = null;
    let liquidCtx: CanvasRenderingContext2D | null = null;
    let droplets: HTMLCanvasElement | null = null;
    let dropletsCtx: CanvasRenderingContext2D | null = null;
    let dropletsCounter = 0;
    let drops: Drop[] = [];
    let lastRender = 0;

    let fgPix: Uint8ClampedArray | null = null;
    let bgPix: Uint8ClampedArray | null = null;
    let bgFull: HTMLCanvasElement | null = null;
    let out: HTMLCanvasElement | null = null;
    let outCtx: CanvasRenderingContext2D | null = null;

    const deltaR = () => opts.maxR - opts.minR;
    const areaMultiplier = () => Math.sqrt((width * height) / scale / (1024 * 768));

    const renderDropsGfx = () => {
      if (!dropAlpha || !dropColor) return;
      const dropBuffer = createCanvas(DROP_SIZE, DROP_SIZE);
      const dropBufferCtx = dropBuffer.getContext("2d")!;
      dropsGfx = Array.from({ length: 255 }, (_, i) => {
        const drop = createCanvas(DROP_SIZE, DROP_SIZE);
        const dropCtx = drop.getContext("2d")!;
        dropBufferCtx.clearRect(0, 0, DROP_SIZE, DROP_SIZE);
        dropBufferCtx.globalCompositeOperation = "source-over";
        dropBufferCtx.drawImage(dropColor!, 0, 0, DROP_SIZE, DROP_SIZE);
        dropBufferCtx.globalCompositeOperation = "screen";
        dropBufferCtx.fillStyle = `rgba(0,0,${i},1)`;
        dropBufferCtx.fillRect(0, 0, DROP_SIZE, DROP_SIZE);
        dropCtx.globalCompositeOperation = "source-over";
        dropCtx.drawImage(dropAlpha!, 0, 0, DROP_SIZE, DROP_SIZE);
        dropCtx.globalCompositeOperation = "source-in";
        dropCtx.drawImage(dropBuffer, 0, 0, DROP_SIZE, DROP_SIZE);
        return drop;
      });
      clearDropletsGfx = createCanvas(128, 128);
      const c = clearDropletsGfx.getContext("2d")!;
      c.fillStyle = "#000";
      c.beginPath();
      c.arc(64, 64, 64, 0, Math.PI * 2);
      c.fill();
    };

    const drawDrop = (ctx: CanvasRenderingContext2D, drop: Drop) => {
      if (!dropsGfx.length) return;
      const r = drop.r;
      const scaleX = 1;
      const scaleY = 1.5;
      let d = Math.max(0, Math.min(1, ((r - opts.minR) / deltaR()) * 0.9));
      d *= 1 / ((drop.spreadX + drop.spreadY) * 0.5 + 1);
      const idx = Math.floor(d * (dropsGfx.length - 1));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(
        dropsGfx[idx],
        (drop.x - r * scaleX * (drop.spreadX + 1)) * scale,
        (drop.y - r * scaleY * (drop.spreadY + 1)) * scale,
        r * 2 * scaleX * (drop.spreadX + 1) * scale,
        r * 2 * scaleY * (drop.spreadY + 1) * scale,
      );
    };

    const drawDroplet = (x: number, y: number, r: number) => {
      if (!dropletsCtx) return;
      drawDrop(dropletsCtx, makeDrop({ x, y, r }));
    };

    const clearDropletsAt = (x: number, y: number, r = 30) => {
      if (!dropletsCtx || !clearDropletsGfx) return;
      dropletsCtx.globalCompositeOperation = "destination-out";
      dropletsCtx.drawImage(
        clearDropletsGfx,
        (x - r) * scale,
        (y - r) * scale,
        r * 2 * scale,
        r * 2 * scale * 1.5,
      );
    };

    const createDropSafe = (partial: Partial<Drop>) => {
      if (drops.length >= opts.maxDrops * areaMultiplier()) return null;
      return makeDrop(partial);
    };

    const updateRain = (timeScale: number) => {
      const rainDrops: Drop[] = [];
      if (!opts.raining) return rainDrops;
      const limit = opts.rainLimit * timeScale * areaMultiplier();
      let count = 0;
      while (chance(opts.rainChance * timeScale * areaMultiplier()) && count < limit) {
        count++;
        const r = random(opts.minR, opts.maxR, (n) => Math.pow(n, 3));
        const rainDrop = createDropSafe({
          x: random(width / scale),
          y: random((height / scale) * opts.spawnArea[0], (height / scale) * opts.spawnArea[1]),
          r,
          momentum: 0.85 + (r - opts.minR) * 0.1 + random(1.6),
          spreadX: 1.5,
          spreadY: 1.5,
        });
        if (rainDrop) rainDrops.push(rainDrop);
      }
      return rainDrops;
    };

    const updateDroplets = (timeScale: number) => {
      if (!dropletsCtx || !liquidCtx || !droplets) return;
      if (opts.raining) {
        dropletsCounter += opts.dropletsRate * timeScale * areaMultiplier();
        while (dropletsCounter >= 1) {
          dropletsCounter--;
          drawDroplet(
            random(width / scale),
            random(height / scale),
            random(opts.dropletsSize[0], opts.dropletsSize[1], (n) => n * n),
          );
        }
      }
      liquidCtx.drawImage(droplets, 0, 0, width, height);
    };

    const updateDrops = (timeScale: number) => {
      if (!liquidCtx) return;
      liquidCtx.clearRect(0, 0, width, height);
      updateDroplets(timeScale);
      let newDrops = updateRain(timeScale);

      drops.sort((a, b) => {
        const va = a.y * (width / scale) + a.x;
        const vb = b.y * (width / scale) + b.x;
        return va > vb ? 1 : va === vb ? 0 : -1;
      });

      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (drop.killed) continue;

        if (
          chance(
            (drop.r - opts.minR * opts.dropFallMultiplier) * (0.09 / deltaR()) * timeScale,
          )
        ) {
          drop.momentum += random((drop.r / opts.maxR) * 3.2);
        }

        if (opts.autoShrink && drop.r <= opts.minR && chance(0.05 * timeScale)) {
          drop.shrink += 0.01;
        }
        drop.r -= drop.shrink * timeScale;
        if (drop.r <= 0) drop.killed = true;

        if (opts.raining) {
          drop.lastSpawn += drop.momentum * timeScale * opts.trailRate;
          if (drop.lastSpawn > drop.nextSpawn) {
            const trailDrop = createDropSafe({
              x: drop.x + random(-drop.r, drop.r) * 0.1,
              y: drop.y - drop.r * 0.01,
              r: drop.r * random(opts.trailScaleRange[0], opts.trailScaleRange[1]),
              spreadY: drop.momentum * 0.1,
              parent: drop,
            });
            if (trailDrop) {
              newDrops.push(trailDrop);
              drop.r *= Math.pow(0.97, timeScale);
              drop.lastSpawn = 0;
              drop.nextSpawn =
                random(opts.minR, opts.maxR) -
                drop.momentum * 2 * opts.trailRate +
                (opts.maxR - drop.r);
            }
          }
        }

        drop.spreadX *= Math.pow(0.4, timeScale);
        drop.spreadY *= Math.pow(0.7, timeScale);

        const moved = drop.momentum > 0;
        if (moved && !drop.killed) {
          drop.y += drop.momentum * opts.globalTimeScale;
          drop.x += drop.momentumX * opts.globalTimeScale;
          if (drop.y > height / scale + drop.r) drop.killed = true;
        }

        const checkCollision = (moved || drop.isNew) && !drop.killed;
        drop.isNew = false;

        if (checkCollision) {
          const end = Math.min(drops.length, i + 70);
          for (let j = i + 1; j < end; j++) {
            const drop2 = drops[j];
            if (
              drop.r <= drop2.r ||
              drop.parent === drop2 ||
              drop2.parent === drop ||
              drop2.killed
            ) {
              continue;
            }
            const dx = drop2.x - drop.x;
            const dy = drop2.y - drop.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (
              dist <
              (drop.r + drop2.r) *
                (opts.collisionRadius +
                  drop.momentum * opts.collisionRadiusIncrease * timeScale)
            ) {
              const a1 = Math.PI * drop.r * drop.r;
              const a2 = Math.PI * drop2.r * drop2.r;
              let targetR = Math.sqrt((a1 + a2 * 0.8) / Math.PI);
              if (targetR > opts.maxR) targetR = opts.maxR;
              drop.r = targetR;
              drop.momentumX += dx * 0.1;
              drop.spreadX = 0;
              drop.spreadY = 0;
              drop2.killed = true;
              drop.momentum = Math.max(
                drop2.momentum,
                Math.min(
                  40,
                  drop.momentum + targetR * opts.collisionBoostMultiplier + opts.collisionBoost,
                ),
              );
            }
          }
        }

        drop.momentum -= Math.max(1, opts.minR * 0.5 - drop.momentum) * 0.1 * timeScale;
        if (drop.momentum < 0) drop.momentum = 0;
        drop.momentumX *= Math.pow(0.7, timeScale);

        if (!drop.killed) {
          newDrops.push(drop);
          if (moved && opts.dropletsRate > 0) {
            clearDropletsAt(drop.x, drop.y, drop.r * opts.dropletsCleaningRadiusMultiplier);
          }
          drawDrop(liquidCtx, drop);
        }
      }

      drops = newDrops;
    };

    /**
     * water.frag in JS. alphaMultiply/Subtract means only strong water-map alpha shows,
     * so most mist pixels skip after a cheap threshold check.
     */
    const composite = () => {
      if (!liquid || !liquidCtx || !fgPix || !bgFull || !out || !outCtx) {
        return;
      }

      // Base: BG baked with the same scaledTexCoord framing as WebGL
      outCtx.drawImage(bgFull, 0, 0, width, height);
      const base = outCtx.getImageData(0, 0, width, height);
      const od = base.data;
      const water = liquidCtx.getImageData(0, 0, width, height);
      const wd = water.data;

      const resX = width;
      const resY = height;
      const invX = 1 / resX;
      const invY = 1 / resY;
      const refrScale = Math.max(width, height) / 1080;

      for (let y = 0; y < height; y++) {
        const vv = y * invY;
        const row = y * width;
        for (let x = 0; x < width; x++) {
          const i = (row + x) * 4;
          const waByte = wd[i + 3];
          // Show a bit more of the water-map edge than a hard 0.5 cut — thicker glass
          if (waByte < 110) continue;

          const wa = waByte * (1 / 255);
          let a = wa * ALPHA_MUL - (ALPHA_SUB - 0.35);
          if (a <= 0) continue;
          if (a > 1) a = 1;

          const wr = wd[i] * (1 / 255);
          const wg = wd[i + 1] * (1 / 255);
          const wb = wd[i + 2] * (1 / 255);
          const u = x * invX;

          const refractionX = (wg - 0.5) * 2;
          const refractionY = (wr - 0.5) * 2;
          const amount = (MIN_REFRACTION + wb * REFRACTION_DELTA) * refrScale;

          const ru = u + invX * refractionX * amount;
          const rv = vv + invY * refractionY * amount;

          const fg = sampleTex(fgPix, FG_W, FG_H, ru, rv, resX, resY, TEXTURE_RATIO);
          let fr = Math.min(255, fg[0] * BRIGHTNESS);
          let fgG = Math.min(255, fg[1] * BRIGHTNESS);
          let fb = Math.min(255, fg[2] * BRIGHTNESS);

          // Specular glint from drop normal (adds the “thick glass” highlights in WebGL)
          const spec = Math.max(0, refractionX * -0.25 + refractionY * -0.55);
          const shine = spec * spec * (0.35 + wb * 0.65) * 55;
          fr = Math.min(255, fr + shine);
          fgG = Math.min(255, fgG + shine);
          fb = Math.min(255, fb + shine);

          const shadowY = y + Math.max(1, (wb * 6) | 0);
          if (shadowY < height) {
            const si = (shadowY * width + x) * 4;
            let borderA = wd[si + 3] * (1 / 255) * ALPHA_MUL - (ALPHA_SUB + 0.5);
            if (borderA > 0) {
              if (borderA > 1) borderA = 1;
              borderA *= 0.22;
              const bia = 1 - borderA;
              fr = fr * bia;
              fgG = fgG * bia;
              fb = fb * bia;
            }
          }

          const ia = 1 - a;
          od[i] = (fr * a + od[i] * ia) | 0;
          od[i + 1] = (fgG * a + od[i + 1] * ia) | 0;
          od[i + 2] = (fb * a + od[i + 2] * ia) | 0;
        }
      }

      outCtx.putImageData(base, 0, 0);
      // Prefer crisp upscale — WebGL draws at native res; extra smoothing mushies the frost
      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = "medium";
      dctx.drawImage(out, 0, 0, display.width, display.height);
    };

    const bakeBackground = () => {
      if (!bgPix || !outCtx) return;
      bgFull = createCanvas(width, height);
      const img = outCtx.createImageData(width, height);
      const d = img.data;
      const invX = 1 / width;
      const invY = 1 / height;
      for (let y = 0; y < height; y++) {
        const vv = y * invY;
        const row = y * width;
        for (let x = 0; x < width; x++) {
          const i = (row + x) * 4;
          const c = sampleTex(bgPix, BG_W, BG_H, x * invX, vv, width, height, TEXTURE_RATIO);
          d[i] = c[0];
          d[i + 1] = c[1];
          d[i + 2] = c[2];
          d[i + 3] = 255;
        }
      }
      const bctx = bgFull.getContext("2d")!;
      bctx.putImageData(img, 0, 0);
    };

    const resize = (bgImg: HTMLImageElement, fgImg: HTMLImageElement) => {
      const cssW = Math.max(1, Math.floor(window.innerWidth));
      const cssH = Math.max(1, Math.floor(window.innerHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const longEdge = Math.max(cssW, cssH);
      const simScale = longEdge > 1440 ? 1440 / longEdge : 1;
      width = Math.max(1, Math.floor(cssW * simScale));
      height = Math.max(1, Math.floor(cssH * simScale));
      scale = 1;

      display.width = Math.floor(cssW * dpr);
      display.height = Math.floor(cssH * dpr);
      display.style.width = `${cssW}px`;
      display.style.height = `${cssH}px`;

      liquid = createCanvas(width, height);
      liquidCtx = liquid.getContext("2d", { willReadFrequently: true });
      droplets = createCanvas(width, height);
      dropletsCtx = droplets.getContext("2d");

      // Codrops: fg → 96×64 (through drops), bg → 384×256 (visible glass)
      const fgTex = createCanvas(FG_W, FG_H);
      const bgTex = createCanvas(BG_W, BG_H);
      const fctx = fgTex.getContext("2d")!;
      const bctx = bgTex.getContext("2d")!;
      fctx.fillStyle = "#020810";
      fctx.fillRect(0, 0, FG_W, FG_H);
      stretchDraw(fctx, fgImg, FG_W, FG_H);
      bctx.fillStyle = "#020810";
      bctx.fillRect(0, 0, BG_W, BG_H);
      stretchDraw(bctx, bgImg, BG_W, BG_H);
      fgPix = fctx.getImageData(0, 0, FG_W, FG_H).data;
      bgPix = bctx.getImageData(0, 0, BG_W, BG_H).data;

      out = createCanvas(width, height);
      outCtx = out.getContext("2d", { willReadFrequently: true });
      bakeBackground();

      drops = [];
      dropletsCounter = 0;
      if (dropletsCtx) dropletsCtx.clearRect(0, 0, width, height);

      // WebGL looks “already wet” on entry — pre-cover the glass instead of waiting for rain.
      const area = areaMultiplier();
      const mistCount = Math.floor(900 * area);
      for (let i = 0; i < mistCount; i++) {
        drawDroplet(
          random(width / scale),
          random(height / scale),
          random(opts.dropletsSize[0], opts.dropletsSize[1], (n) => n * n),
        );
      }
      // Larger beads + a few mid-size drops already clinging to the glass
      const beadCount = Math.floor(120 * area);
      for (let i = 0; i < beadCount; i++) {
        drawDroplet(
          random(width / scale),
          random(height / scale),
          random(4, 9, (n) => n * n),
        );
      }
      const seedCount = Math.floor(55 * area);
      for (let i = 0; i < seedCount; i++) {
        const r = random(opts.minR, opts.maxR, (n) => Math.pow(n, 3));
        const drop = createDropSafe({
          x: random(width / scale),
          y: random((height / scale) * 0.05, (height / scale) * 0.95),
          r,
          momentum: random(0.2, 2.2),
          spreadX: random(0.2, 1.2),
          spreadY: random(0.2, 1.4),
          isNew: true,
        });
        if (drop) drops.push(drop);
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      if (!lastRender) lastRender = now;
      let timeScale = (now - lastRender) / ((1 / 60) * 1000);
      if (timeScale > 1.1) timeScale = 1.1;
      timeScale *= opts.globalTimeScale;
      lastRender = now;

      updateDrops(timeScale);
      composite();
      raf = requestAnimationFrame(tick);
    };

    let bgImg: HTMLImageElement | null = null;
    let fgImg: HTMLImageElement | null = null;

    const onResize = () => {
      if (!bgImg || !fgImg) return;
      resize(bgImg, fgImg);
    };

    void (async () => {
      const [alpha, color, bg, fg] = await Promise.all([
        loadImage("/fx/rain/img/drop-alpha.png"),
        loadImage("/fx/rain/img/drop-color.png"),
        loadImage(`/fx/rain/img/scenes/${scene}/bg.jpg`),
        loadImage(`/fx/rain/img/scenes/${scene}/fg.jpg`),
      ]);
      if (disposed || !alpha || !color || !bg || !fg) return;
      dropAlpha = alpha;
      dropColor = color;
      bgImg = bg;
      fgImg = fg;
      renderDropsGfx();
      resize(bg, fg);
      lastRender = performance.now();
      raf = requestAnimationFrame(tick);
    })();

    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      display.remove();
    };
  }, [scene]);

  return (
    <div
      ref={hostRef}
      id="rain-safe-background"
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        background: "#020810",
      }}
    />
  );
}
