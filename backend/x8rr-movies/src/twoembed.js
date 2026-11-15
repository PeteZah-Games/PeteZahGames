const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BASE = "https://vidsrc.buzz";
const API = BASE + "/pl/api.php";
const MAX_MINTS = 4;

async function getJson(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function race(refs) {
  const d = await getJson(`${API}?a=race&refs=${encodeURIComponent(refs.join(","))}`);
  return d?.cands || [];
}

async function mint(ref, token) {
  const d = await getJson(`${API}?a=play&ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(token)}`);
  return d?.url ? { ref, url: d.url, type: d.type } : null;
}

async function usable(c) {
  const url = new URL(c.url, BASE + "/").href;
  if (!url.startsWith(BASE + "/_stream?")) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok || !(await r.text()).startsWith("#EXTM3U")) return null;
    } catch {
      return null;
    }
  }
  return { url, type: c.type === "mp4" ? "file" : "hls" };
}

export async function twoembedExtract(type, tmdbId, season, episode) {
  try {
    const isTV = type !== "movie";
    const path = isTV ? `/embed/tv/${tmdbId}/${season}/${episode}` : `/embed/movie/${tmdbId}`;
    const resp = await fetch(BASE + path, {
      headers: { "User-Agent": UA, Referer: "https://www.2embed.cc/" },
    });
    if (!resp.ok) throw new Error("embed " + resp.status);
    const html = await resp.text();
    const m = html.match(/var Q = (\{.*?\});\n/s);
    if (!m) throw new Error("no config");
    const q = JSON.parse(m[1]);
    const servers = q.ssr?.servers || [];
    if (!q.t || !servers.length) return [];

    const ordered = [
      ...servers.filter((s) => !/XPM/i.test(s.name)),
      ...servers.filter((s) => /XPM/i.test(s.name)),
    ];
    const chunks = [];
    for (let i = 0; i < ordered.length; i += 6) chunks.push(ordered.slice(i, i + 6).map((s) => s.ref));
    const cands = (await Promise.all(chunks.map(race))).flat();

    const have = new Set(cands.map((c) => c.ref));
    const missing = ordered
      .filter((s) => !have.has(s.ref) && !/XPM/i.test(s.name))
      .slice(0, MAX_MINTS);
    const minted = await Promise.all(missing.map((s) => mint(s.ref, q.t)));

    const checked = await Promise.all([...cands, ...minted.filter(Boolean)].map(usable));
    const seen = new Set();
    const results = [];
    for (const s of checked) {
      if (!s || seen.has(s.url)) continue;
      seen.add(s.url);
      results.push({ url: s.url, type: s.type, provider: "twoembed", providerName: "2Embed" });
    }
    return results;
  } catch (e) {
    console.log("[twoembed] error:", e.message);
    return [];
  }
}
