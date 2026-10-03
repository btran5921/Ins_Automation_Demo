// src/services/postMetadata.js
//
// FILE PURPOSE:
// Originally this scraped Instagram for post metadata. Instagram
// now serves a full JS app shell to server-side requests, so there's
// nothing to scrape. Auto-fetch is disabled.
//
// What remains is URL validation: the frontend and controller use
// isAllowedUrl() to reject obviously wrong inputs and to normalize
// a URL to a "canonical" form for display.
//
// The user pastes image + music manually via the Edit modal.

const ALLOWED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com"
]);

const POST_PATH = /^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

/**
 * Return true if a URL looks like a single Instagram post URL.
 * Used only for input validation and UI affordances, not for fetching.
 */
function isAllowedUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (_) { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return false;
  return POST_PATH.test(u.pathname);
}

/**
 * Normalize any Instagram post URL to its canonical short form.
 *   https://www.instagram.com/p/ABC123/?utm_source=...
 *     → https://www.instagram.com/p/ABC123/
 * Returns null if the URL doesn't match a post.
 */
function normalizeUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (_) { return null; }
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
  const m = u.pathname.match(POST_PATH);
  if (!m) return null;
  return `https://www.instagram.com/${m[1]}/${m[2]}/`;
}

/**
 * Auto-fetch is disabled. Always returns an empty metadata result
 * with an explanatory error, so the UI shows the manual-entry hint.
 *
 * Kept as an async function so the controller code that awaits it
 * doesn't need to change.
 */
async function fetchMetadata(_url) {
  return {
    imageUrl: null,
    caption: null,
    author: null,
    musicTitle: null,
    musicArtist: null,
    error: null   // null (not an error string) — manual entry is expected, not a failure
  };
}

module.exports = { fetchMetadata, isAllowedUrl, normalizeUrl };