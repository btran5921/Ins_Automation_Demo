// src/routes/systemRoutes.js
//
// FILE PURPOSE:
// Endpoints that aren't about a specific resource (like actions or
// accounts), but about the running system itself:
//
//   /api/queue           - read queue state, start/stop it
//   /api/logs            - read or clear the in-memory log buffer
//   /api/config          - read/update rate limiter + mock API settings
//
// All of these are mounted in server.js under "/api".

const express = require("express");
const queue = require("../services/actionQueue");
const rateLimiter = require("../services/rateLimiter");
const instagramMock = require("../services/instagramMock");
const logger = require("../utils/logger");
const aiSuggest = require("../services/aiSuggest");

const router = express.Router();

/* ---------------- Queue ---------------- */

// GET /api/queue
// Returns a snapshot of the queue: running, processing, waiting, etc.
router.get("/queue", (req, res) => {
  res.json(queue.getState());
});

// POST /api/queue/start
// Resume processing. Idempotent — safe to call when already running.
router.post("/queue/start", (req, res) => {
  queue.start();
  res.json(queue.getState());
});

// POST /api/queue/stop
// Pause after the current action finishes. Does not interrupt
// an in-flight action.
router.post("/queue/stop", (req, res) => {
  queue.stop();
  res.json(queue.getState());
});

/* ---------------- Logs ---------------- */

// GET /api/logs?limit=100
// Returns recent log entries, newest first. The `limit` query param
// caps how many entries are returned (default 100, max 500).
router.get("/logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  // getLogs() returns oldest→newest, so slice from the end
  // and reverse to show newest first.
  res.json(logger.getLogs().slice(-limit).reverse());
});

// DELETE /api/logs
// Empty the log buffer. Useful for the "Clear logs" button.
router.delete("/logs", (req, res) => {
  logger.clear();
  res.json({ ok: true });
});

/* ---------------- Config ---------------- */

router.get("/config", (req, res) => {
  res.json({
    rateLimiter: rateLimiter.getConfig(),
    instagramMock: instagramMock.getConfig(),
    provider: aiSuggest.getProviderName()
  });
});

// PUT /api/config
// Update one or both config blocks. Body shape:
//   { "rateLimiter": { "minDelayMs": 1500, "maxDelayMs": 3000 },
//     "instagramMock": { "failureRate": 0.2 } }
// Any field may be omitted. Invalid values return 400.
router.put("/config", (req, res) => {
  const { rateLimiter: rl, instagramMock: im } = req.body || {};

  try {
    if (rl) rateLimiter.updateConfig(rl);
    if (im) instagramMock.updateConfig(im);

    res.json({
      rateLimiter: rateLimiter.getConfig(),
      instagramMock: instagramMock.getConfig()
    });
  } catch (error) {
    // updateConfig throws on invalid input; surface it as a 400.
    res.status(400).json({ error: error.message });
  }
});

const postMetadata = require("../services/postMetadata");

router.get("/debug/embed", async (req, res, next) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "url query param required" });
    const result = await postMetadata.fetchRawEmbed(url);
    res.type("text/plain").send(
      `<!-- status: ${result.status} -->\n` +
      `<!-- embedUrl: ${result.embedUrl} -->\n\n` +
      result.html
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;