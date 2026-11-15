const BASE = "https://api.themoviedb.org/3";

export async function tmdb(path, params = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY not set");

  const url = new URL(BASE + path);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`TMDB ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
