// src/services/postMetadata.js
//
// FILE PURPOSE:
// Fetches a public Instagram post's Open Graph metadata (og:image,
// og:title, og:description) and attempts to extract the audio track
// name if it's present in the page's JSON.
//
// IMPORTANT LIMITATIONS:
//   - Instagram often returns a login wall or a JS-only shell to
//     requests that don't look like a real browser. When that happens
//     og:image will be missing and the user has to paste the image
//     URL manually. This is normal.
//   - Music info is rendered client-side on Instagram's page, so it's
//     rarely in the HTML we can fetch. We make a best effort and fall
//     back to manual entry.
//
// SECURITY:
//   Only instagram.com and its subdomains are allowed as fetch targets.
//   Otherwise this becomes an SSRF vector (user submits
//   http://localhost:6379 and we hit their Redis).

const logger = require("../utils/logger");

const ALLOWED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com"
]);

const FETCH_TIMEOUT_MS = 8000;

/**
 * Check whether a URL is safe to fetch: http(s) and on the allowlist.
 */
function isAllowedUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (_) { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
}

/**
 * Extract the value of an OG meta tag from raw HTML. Handles both
 * attribute orders that show up in the wild:
 *   <meta property="og:image" content="...">
 *   <meta content="..." property="og:image">
 */
function extractMeta(html, property) {
  // Try property="og:x" content="..." first.
  const a = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const ma = html.match(a);
  if (ma) return decodeEntities(ma[1]);

  // Try the reverse order.
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    "i"
  );
  const mb = html.match(b);
  return mb ? decodeEntities(mb[1]) : null;
}

/**
 * Decode the handful of HTML entities that appear in meta content.
 */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Instagram sometimes embeds the post's full JSON in a <script> tag
 * (e.g. "PolarisPostRootQuery" or "xdt_api__v1__media__shortcode__...").
 * We don't parse it all — just look for the audio/music fields if
 * they're present. Best-effort.
 */
function extractMusic(html) {
  // Common patterns in Instagram's embedded JSON.
  const patterns = [
    /"audio_canonical_title":"([^"]+)"/,
    /"audio_title":"([^"]+)"/,
    /"music_asset_info":\{[^}]*"title":"([^"]+)"/,
    /"original_sound_title":"([^"]+)"/,
    /"audio_artist":"([^"]+)"/
  ];

  let title = null;
  let artist = null;

  for (const p of patterns) {
    const m = html.match(p);
    if (m && !title) { title = decodeEntities(m[1]); }
  }

  const artistMatch =
    html.match(/"audio_artist":"([^"]+)"/) ||
    html.match(/"artist_name":"([^"]+)"/);
  if (artistMatch) artist = decodeEntities(artistMatch[1]);

  if (!title) return null;

  return {
    title,
    artist: artist && artist !== title ? artist : null
  };
}

/**
 * Try to derive a caption from og:description, which Instagram usually
 * formats as: `N likes, M comments - user on Instagram: "caption"`.
 * Returns just the caption part if we can parse it out.
 */
function extractCaptionFromDescription(desc) {
  if (!desc) return null;
  // Look for the text between the last pair of quotes.
  const quoted = desc.match(/:\s*"([\s\S]+)"\s*$/);
  if (quoted) return quoted[1].trim();
  // Otherwise strip the leading "N likes, M comments - user on Instagram"
  // boilerplate and return the rest.
  const stripped = desc.replace(
    /^\d[\d,]*\s+likes?,\s*\d[\d,]*\s+comments?\s*-\s*[^:]+:\s*/i,
    ""
  );
  return stripped.trim() || null;
}

/**
 * Fetch a post's metadata. Returns a partial object with whatever we
 * could extract. Never throws — callers get `{ error }` on failure.
 *
 * @param {string} url
 * @returns {Promise<object>} { imageUrl, caption, author, musicTitle,
 *                             musicArtist, error }
 */
async function fetchMetadata(url) {
  if (!isAllowedUrl(url)) {
    return { error: "Only instagram.com URLs are supported" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // A real-looking UA gets us past most basic checks. Instagram
        // still often returns a login wall regardless.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/123.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!res.ok) {
      logger.log(`Metadata fetch ${res.status} for ${url}`, "warn");
      return { error: `Instagram returned ${res.status}` };
    }

    const html = await res.text();

    const imageUrl = extractMeta(html, "og:image");
    const title = extractMeta(html, "og:title");
    const description = extractMeta(html, "og:description");

    // Instagram sometimes serves a login shell with no OG tags. Bail
    // early rather than storing useless empty fields.
    if (!imageUrl && !description) {
      return {
        error:
          "Instagram returned a login wall or empty page. Paste the image URL manually."
      };
    }

    // og:title is usually `user on Instagram: "..."` — extract the user.
    let author = null;
    if (title) {
      const m = title.match(/^(.+?)\s+on Instagram/i);
      if (m) author = `@${m[1].trim()}`;
    }

    const caption = extractCaptionFromDescription(description);
    const music = extractMusic(html);

    logger.log(`Fetched metadata for ${url}`);

    return {
      imageUrl: imageUrl || null,
      caption: caption || null,
      author,
      musicTitle: music ? music.title : null,
      musicArtist: music ? music.artist : null,
      error: null
    };
  } catch (err) {
    if (err.name === "AbortError") {
      logger.log(`Metadata fetch timed out for ${url}`, "warn");
      return { error: "Request timed out" };
    }
    logger.log(`Metadata fetch failed: ${err.message}`, "error");
    return { error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchMetadata, isAllowedUrl };