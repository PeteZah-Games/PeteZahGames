/**
 * Movie/TV streams — FrameX via Tor (Lyra titles method).
 * https://github.com/selenesia/lyra routes FrameX; we Tor it so the VPS IP stays clean.
 */
import { resolveFramex } from "./framex.js";
import { torConfigured, torAvailable } from "./torFetch.js";

const PROVIDERS = [{ id: "framex", name: "FrameX" }];

export async function scrapeAll(type, tmdbId, season, episode, _tasks, onSettled) {
  let streams = [];
  try {
    streams = await resolveFramex(type, tmdbId, season || 1, episode || 1);
  } catch (e) {
    console.log("[movie-streams] framex:", e.message);
  }
  if (!streams.length) {
    console.log(
      "[movie-streams] no framex sources",
      torConfigured() ? `(tor socks configured, available=${await torAvailable().catch(() => false)})` : "(tor socks not configured — set TOR_SOCKS_URL)"
    );
  }
  if (onSettled) {
    try {
      onSettled(streams);
    } catch {}
  }
  return streams;
}

export { PROVIDERS };
