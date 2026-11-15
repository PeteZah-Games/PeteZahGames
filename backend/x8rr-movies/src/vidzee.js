const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PLAYER = "https://player.vidzee.wtf";
const CORE = "https://core.vidzee.wtf";
const HOST = "player.vidzee.wtf";
const CRYPTO_CHUNK = "/assets/streams-BHpSC3gU.js";
const HEADERS = { "User-Agent": UA, Referer: PLAYER + "/", Origin: PLAYER };

let _wasm = null;

// Fallback only: core API returns plaintext JSON unless &e=1 is passed.
// The encrypted form ({ c }) is decrypted by an AssemblyScript wasm keyed on the player hostname.
async function getWasm() {
  if (_wasm) return _wasm;
  _wasm = (async () => {
    const js = await fetch(PLAYER + CRYPTO_CHUNK, { headers: HEADERS }).then((r) => r.text());
    const b64 = js.match(/["'](AGFzbQ[A-Za-z0-9+/=]+)["']/)?.[1];
    if (!b64) throw new Error("wasm not found");
    return WebAssembly.compile(Buffer.from(b64, "base64"));
  })().catch((e) => {
    _wasm = null;
    throw e;
  });
  return _wasm;
}

async function decrypt(c) {
  const mod = await getWasm();
  const { exports: x } = await WebAssembly.instantiate(mod, {
    env: {
      abort() {
        throw new Error("wasm abort");
      },
    },
  });
  const data = Buffer.from(c, "base64");
  const dv = () => new DataView(x.memory.buffer);

  const buf = x.__pin(x.__new(data.length, 1)) >>> 0;
  const arr = x.__pin(x.__new(12, 6)) >>> 0;
  dv().setUint32(arr, buf, true);
  dv().setUint32(arr + 4, buf, true);
  dv().setUint32(arr + 8, data.length, true);
  new Uint8Array(x.memory.buffer, buf, data.length).set(data);
  x.__unpin(buf);

  const str = x.__new(HOST.length << 1, 2) >>> 0;
  const u16 = new Uint16Array(x.memory.buffer);
  for (let i = 0; i < HOST.length; i++) u16[(str >>> 1) + i] = HOST.charCodeAt(i);

  try {
    const out = x.decrypt(arr, str) >>> 0;
    if (!out) return null;
    const ptr = dv().getUint32(out + 4, true);
    const len = dv().getUint32(out + 8, true);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(x.memory.buffer, ptr, len)));
  } finally {
    x.__unpin(arr);
  }
}

async function getServer(path, server) {
  try {
    const r = await fetch(`${CORE}/streams/${path}?s=${encodeURIComponent(server.id)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    let data = await r.json();
    if (data && typeof data.c === "string" && !data.url) data = await decrypt(data.c);
    if (!data?.url) return null;
    const headers =
      data.headers && Object.keys(data.headers).length
        ? data.headers
        : /fastcloud|vercetti|nexcloud/.test(data.url)
          ? { Referer: PLAYER + "/", Origin: PLAYER }
          : undefined;
    return {
      url: data.url,
      type: /\.(mp4|mkv|webm)(\?|$)/i.test(data.url) ? "file" : "hls",
      provider: "vidzee",
      providerName: "VidZee " + server.label,
      ...(headers ? { headers } : {}),
    };
  } catch {
    return null;
  }
}

export async function vidzeeExtract(type, tmdbId, season, episode) {
  try {
    const isTV = type !== "movie";
    const path = isTV ? `tv/${tmdbId}/${season}/${episode}` : `movie/${tmdbId}`;

    const langs = await fetch(`${CORE}/streams/languages/${path}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => (Array.isArray(d?.languages) ? d.languages : []))
      .catch(() => []);

    const servers = [
      ...(isTV ? [] : [{ id: "peak", label: "Peak" }]),
      { id: "dcloud", label: "Dcloud" },
      ...langs.map((l) => ({ id: "v4:" + l, label: "Acme " + l })),
      { id: "tik", label: "TCloud" },
      { id: "v6:Hindi", label: "Hindi" },
      { id: "v6:English", label: "English" },
    ];

    const results = await Promise.all(servers.map((s) => getServer(path, s)));
    return results.filter(Boolean);
  } catch (e) {
    console.log("[vidzee] error:", e.message);
    return [];
  }
}
