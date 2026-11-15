const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BASE = "https://vixsrc.to";

export async function vixsrcExtract(type, tmdbId, season, episode) {
  try {
    const isTV = type !== "movie";
    const path = isTV ? `/tv/${tmdbId}/${season}/${episode}` : `/movie/${tmdbId}`;
    const headers = { "User-Agent": UA, Referer: BASE + path };

    const api = await fetch(BASE + "/api" + path, { headers });
    if (!api.ok) throw new Error("api " + api.status);
    const { src } = await api.json();
    if (!src) throw new Error("no src");

    const embed = await fetch(BASE + src, { headers });
    if (!embed.ok) throw new Error("embed " + embed.status);
    const html = await embed.text();

    const token = html.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const expires = html.match(/['"]expires['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const url = html.match(/masterPlaylist[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/)?.[1];
    if (!token || !expires || !url) throw new Error("playlist params not found");
    const fhd = /window\.canPlayFHD\s*=\s*true/.test(html);

    const u = new URL(url.replace(/\\\//g, "/"));
    u.searchParams.set("token", token);
    u.searchParams.set("expires", expires);
    if (fhd) u.searchParams.set("h", "1");
    u.searchParams.set("lang", "en");

    return [
      {
        url: u.toString(),
        type: "hls",
        quality: fhd ? "1080p" : undefined,
        provider: "vixsrc",
        providerName: "VixSrc",
      },
    ];
  } catch (e) {
    console.log("[vixsrc] error:", e.message);
    return [];
  }
}
