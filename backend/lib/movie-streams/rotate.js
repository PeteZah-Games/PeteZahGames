// Keys that providers bake into their player bundles get rotated now and then. Instead of
// hardcoding one, each provider keeps a RotatingKey: it starts from an env override or the
// last known value, and when that key stops working it re-scrapes the site's JS for
// candidates and keeps the first one that actually decrypts / authenticates.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFRESH_COOLDOWN = 10 * 60 * 1000;

export class RotatingKey {
  constructor({ name, env, fallback, discover }) {
    this.name = name;
    this.current = (env && process.env[env]) || fallback;
    this.discover = discover;
    this.lastRefresh = 0;
    this.refreshing = null;
  }

  // Runs fn(key). If it throws, re-discovers candidate keys (at most once per cooldown)
  // and retries fn with each until one succeeds, which then becomes the current key.
  async use(fn) {
    const tried = this.current;
    try {
      return await fn(tried);
    } catch (err) {
      const candidates = await this.refresh();
      for (const k of candidates) {
        if (k === tried) continue;
        try {
          const out = await fn(k);
          if (this.current !== k) console.log(`[keys] ${this.name}: rotated key`);
          this.current = k;
          return out;
        } catch {}
      }
      throw err;
    }
  }

  refresh() {
    if (this.refreshing) return this.refreshing;
    if (Date.now() - this.lastRefresh < REFRESH_COOLDOWN) return Promise.resolve([]);
    this.lastRefresh = Date.now();
    this.refreshing = this.discover()
      .then((list) => {
        const uniq = [...new Set(list)];
        console.log(`[keys] ${this.name}: key failed, found ${uniq.length} candidate(s)`);
        return uniq;
      })
      .catch((e) => {
        console.log(`[keys] ${this.name}: discovery failed:`, e.message);
        return [];
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }
}

// Fetches a page and the same-origin scripts it loads; `filter` can skip scripts by path.
export async function fetchPageScripts(pageUrl, filter = () => true) {
  const get = (u) =>
    fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }).then((r) => {
      if (!r.ok) throw new Error(`${u} ${r.status}`);
      return r.text();
    });
  const html = await get(pageUrl);
  const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]))]
    .map((s) => new URL(s, pageUrl))
    .filter((u) => u.origin === new URL(pageUrl).origin && filter(u.pathname));
  const scripts = await Promise.all(srcs.map((u) => get(u.href).catch(() => "")));
  return [html, ...scripts];
}

// All quoted string literals in `code` whose body matches `body` (a regex source string).
export function stringLiterals(code, body) {
  const re = new RegExp(`(["'\`])(${body})\\1`, "g");
  return [...code.matchAll(re)].map((m) => m[2]);
}
