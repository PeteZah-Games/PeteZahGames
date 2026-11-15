/**
 * Movie/TV stream resolution — Lyra Movy method first
 * (https://github.com/selenesia/lyra), then empty → client embed/Tor.
 */
import { resolveMovy } from "./movy.js";

const PROVIDERS = [
  { id: "movy", name: "Movy" },
];

/** Lyra-style: resolve playable HLS via Movy city servers. */
export async function scrapeAll(type, tmdbId, season, episode, _tasks, onSettled) {
  let streams = [];
  try {
    streams = await resolveMovy(type, tmdbId, season || 1, episode || 1);
  } catch (e) {
    console.log("[movie-streams] movy:", e.message);
  }
  if (onSettled) {
    try {
      onSettled(streams);
    } catch {}
  }
  return streams;
}

export { PROVIDERS };
