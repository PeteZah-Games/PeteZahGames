import { peerIsTrusted } from '../lib/ip.js';

export function getClientIP(req) {
  const peer = req.socket?.remoteAddress || req.connection?.remoteAddress || null;
  let ip = peer;
  // Trust forwarding headers only from the local reverse proxy, otherwise any
  // client can set X-Forwarded-For to spoof its IP (ban evasion, rate-limit
  // bypass, framing a victim IP).
  if (peerIsTrusted(req)) {
    // Prefer CF-Connecting-IP (true client) when the edge is our reverse proxy.
    const cf = req.headers['cf-connecting-ip'];
    const real = req.headers['x-real-ip'];
    const xff = req.headers['x-forwarded-for'];
    if (cf && typeof cf === 'string' && cf.trim()) ip = cf.trim();
    else if (xff && typeof xff === 'string' && xff.trim()) ip = xff.split(',')[0].trim();
    else if (real && typeof real === 'string' && real.trim()) ip = real.trim();
  }
  if (ip && typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip || null;
}
