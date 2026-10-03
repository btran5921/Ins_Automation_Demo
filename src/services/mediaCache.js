// src/services/mediaCache.js
//
// FILE PURPOSE:
// Download remote media (Instagram CDN images, videos) to local disk
// and return a local URL path. Instagram CDN URLs are signed with an
// expiry param and stop working after a few days — caching makes
// saved candidates keep their images forever.
//
// Only http(s) URLs are fetched. Max size caps prevent a malicious
// or huge file from filling the disk.

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const logger = require("../utils/logger");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "public", "uploads");
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap for videos

/** Ensure the uploads directory exists. */
async function ensureDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

/** Pick a file extension based on content-type or the source URL. */
function pickExt(contentType, url) {
  if (contentType) {
    if (contentType.includes("image/jpeg")) return ".jpg";
    if (contentType.includes("image/png")) return ".png";
    if (contentType.includes("image/webp")) return ".webp";
    if (contentType.includes("image/gif")) return ".gif";
    if (contentType.includes("video/mp4")) return ".mp4";
    if (contentType.includes("video/")) return ".mp4";
  }
  // Fall back to the URL path.
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (m) return "." + m[1].toLowerCase();
  } catch (_) {}
  return ".bin";
}

/**
 * Download a URL to public/uploads/ and return its local path
 * (e.g. "/uploads/abc123.jpg"). If the URL is already local
 * (starts with /uploads/), it's returned unchanged.
 *
 * Never throws — returns null on any failure so the caller can
 * keep the original URL.
 */
async function cacheUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("/uploads/")) return url; // already local

  let parsed;
  try { parsed = new URL(url); } catch (_) { return null; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  try {
    await ensureDir();

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/123.0.0.0 Safari/537.36",
        "Referer": "https://www.instagram.com/"
      },
      redirect: "follow"
    });

    if (!res.ok) {
      logger.log(`Media cache ${res.status} for ${url.slice(0, 80)}…`, "warn");
      return null;
    }

    // Reject oversized files early if the header is present.
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > MAX_BYTES) {
      logger.log(`Media cache too large (${len} bytes)`, "warn");
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      logger.log(`Media cache too large (${buf.length} bytes)`, "warn");
      return null;
    }

    const ext = pickExt(res.headers.get("content-type"), url);
    const name = crypto.randomBytes(8).toString("hex") + ext;
    const file = path.join(UPLOAD_DIR, name);
    await fs.writeFile(file, buf);

    logger.log(`Cached ${name} (${buf.length} bytes)`);
    return `/uploads/${name}`;
  } catch (err) {
    logger.log(`Media cache failed: ${err.message}`, "warn");
    return null;
  }
}

module.exports = { cacheUrl };