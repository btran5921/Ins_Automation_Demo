// src/utils/logger.js
//
// FILE PURPOSE:
// A minimal logger that:
//   1. Prints a timestamped line to the terminal (so you can watch
//      activity while the server runs)
//   2. Stores entries in an in-memory array (so the dashboard can
//      fetch recent activity via the /api/logs route)
//
// It is deliberately simple. Later, if you add MongoDB, you could
// change `log()` to also insert into a `logs` collection.
//
// LOG LEVELS:
//   "info"  - normal events (default)
//   "warn"  - something that might be a problem (retries, pauses)
//   "error" - something failed (permanent failures, crashes)
//
// USAGE:
//   const logger = require("../utils/logger");
//   logger.log("Server started");
//   logger.log("Retrying...", "warn");
//   logger.log("Gave up", "error");

// In-memory store of log entries. Newest entries are at the end.
// The dashboard fetches these via GET /api/logs.
const logs = [];

// Cap the buffer so it doesn't grow forever in a long-running process.
// Oldest entries are dropped once the cap is reached.
const MAX_LOGS = 500;

/**
 * Record a log entry. Prints to the console AND stores it in memory.
 *
 * @param {string} message - human-readable description of the event
 * @param {"info"|"warn"|"error"} [level="info"] - severity
 * @returns {object} the log entry that was created
 */
function log(message, level = "info") {
  // Build the entry with a unique id, level, message, and timestamp.
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    createdAt: new Date().toISOString()
  };

  // Append, then trim the oldest entries if we're over the cap.
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();

  // Print to the terminal with a padded level tag so columns line up.
  // e.g. "[2026-10-01T19:00:00.000Z] [INFO ] Server started"
  const tag = level.toUpperCase().padEnd(5);
  console.log(`[${entry.createdAt}] [${tag}] ${message}`);

  return entry;
}

/**
 * Return the raw array of log entries (oldest first).
 * Callers should treat this as read-only; use `clear()` to reset.
 */
function getLogs() {
  return logs;
}

/**
 * Empty the log buffer. Useful in tests or via a "Clear logs" button
 * on the dashboard.
 */
function clear() {
  logs.length = 0;
}

module.exports = { log, getLogs, clear };