// src/controllers/candidateController.js
//
// FILE PURPOSE:
// Endpoints for the manual-assist workflow:
//   POST   /api/candidates             - add a candidate
//   GET    /api/candidates             - list, newest first
//   GET    /api/candidates/counts      - counts by status
//   GET    /api/candidates/:id         - fetch one
//   POST   /api/candidates/:id/suggest - generate AI suggestions
//   PATCH  /api/candidates/:id         - update notes/status/media/chosen
//   DELETE /api/candidates/:id         - remove
//
// All handlers are async because they talk to MongoDB through
// candidateStore. Express 5 forwards rejected promises to the error
// middleware automatically, but we still call next(error) explicitly
// for clarity and Express 4 compatibility.

const candidateStore = require("../services/candidateStore");
const aiSuggest = require("../services/aiSuggest");
const postMetadata = require("../services/postMetadata");
const logger = require("../utils/logger");

/* ---------------- POST /api/candidates ---------------- */
async function createCandidate(req, res, next) {
  try {
    const body = req.body || {};

    const sourceUrl =
      typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : null;
    const author =
      typeof body.author === "string" ? body.author.trim() : null;
    const caption =
      typeof body.caption === "string" ? body.caption.trim() : "";
    const notes =
      typeof body.notes === "string" ? body.notes.trim() : "";
    const imageUrl =
      typeof body.imageUrl === "string" ? body.imageUrl.trim() : null;
    const musicTitle =
      typeof body.musicTitle === "string" ? body.musicTitle.trim() : null;
    const musicArtist =
      typeof body.musicArtist === "string" ? body.musicArtist.trim() : null;

    if (!sourceUrl && !caption) {
      return res.status(400).json({
        error: "Provide at least a sourceUrl or a caption"
      });
    }

    // Normalize the URL to canonical form if it looks like a post.
    // We don't auto-fetch metadata — Instagram blocks server-side
    // scraping. The user fills in image + music via the Edit modal.
    let normalizedUrl = sourceUrl;
    if (sourceUrl && postMetadata.isAllowedUrl(sourceUrl)) {
      normalizedUrl = postMetadata.normalizeUrl(sourceUrl) || sourceUrl;
    }

    const id = await candidateStore.nextCandidateId();

    const candidate = await candidateStore.create({
      _id: id,
      sourceUrl: normalizedUrl,
      author,
      caption,
      notes,
      imageUrl,
      musicTitle,
      musicArtist,
      metadataError: null,
      metadataFetchedAt: null,
      status: "new",
      suggestions: [],
      chosenComment: null,
      createdAt: new Date(),
      actedAt: null
    });

    logger.log(`Candidate ${candidate.id} created`);
    res.status(201).json(candidate);
  } catch (error) {
    next(error);
  }
}

/* ---------------- GET /api/candidates ---------------- */
async function listCandidates(req, res, next) {
  try {
    const filters = {};
    if (req.query.status) {
      filters.status = String(req.query.status).toLowerCase();
    }
    res.json(await candidateStore.findAll(filters));
  } catch (error) {
    next(error);
  }
}

/* ---------------- GET /api/candidates/counts ---------------- */
async function getCounts(req, res, next) {
  try {
    res.json(await candidateStore.getCounts());
  } catch (error) {
    next(error);
  }
}

/* ---------------- GET /api/candidates/:id ---------------- */
async function getCandidate(req, res, next) {
  try {
    const candidate = await candidateStore.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    res.json(candidate);
  } catch (error) {
    next(error);
  }
}

/* ---------------- POST /api/candidates/:id/suggest ---------------- */
async function suggest(req, res, next) {
  try {
    if (!aiSuggest.isConfigured()) {
      return res.status(503).json({
        error: "AI suggestions are not configured."
      });
    }

    const candidate = await candidateStore.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const suggestions = await aiSuggest.suggest({
      caption: candidate.caption,
      author: candidate.author,
      notes: candidate.notes,
      count: 3
    });

    candidate.suggestions = suggestions;
    candidate.status = "ready";
    await candidateStore.persist(candidate);

    logger.log(
      `Generated ${suggestions.length} suggestion(s) for ${candidate.id} ` +
      `(provider: ${aiSuggest.getProviderName()})`
    );

    res.json(candidate);
  } catch (error) {
    next(error);
  }
}

/* ---------------- PATCH /api/candidates/:id ---------------- */
async function updateCandidate(req, res, next) {
  try {
    const candidate = await candidateStore.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const body = req.body || {};

    if (typeof body.notes === "string") candidate.notes = body.notes.trim();
    if (typeof body.caption === "string") candidate.caption = body.caption.trim();
    if (typeof body.author === "string") candidate.author = body.author.trim();
    if (typeof body.sourceUrl === "string") candidate.sourceUrl = body.sourceUrl.trim();

    if (typeof body.chosenComment === "string") {
      candidate.chosenComment = body.chosenComment.trim();
    }

    // Media fields, edited via the media modal.
    if (typeof body.imageUrl === "string") {
      candidate.imageUrl = body.imageUrl.trim() || null;
    }
    if (typeof body.musicTitle === "string") {
      candidate.musicTitle = body.musicTitle.trim() || null;
    }
    if (typeof body.musicArtist === "string") {
      candidate.musicArtist = body.musicArtist.trim() || null;
    }

    if (typeof body.status === "string") {
      const allowed = ["new", "ready", "acted", "skipped"];
      if (!allowed.includes(body.status)) {
        return res.status(400).json({
          error: `status must be one of: ${allowed.join(", ")}`
        });
      }
      candidate.status = body.status;
      candidate.actedAt =
        body.status === "acted" || body.status === "skipped"
          ? new Date()
          : null;
    }

    await candidateStore.persist(candidate);
    res.json(candidate);
  } catch (error) {
    next(error);
  }
}

/* ---------------- DELETE /api/candidates/:id ---------------- */
async function deleteCandidate(req, res, next) {
  try {
    const removed = await candidateStore.removeById(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    logger.log(`Candidate ${removed.id} deleted`, "warn");
    res.json(removed);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCandidate,
  listCandidates,
  getCounts,
  getCandidate,
  suggest,
  updateCandidate,
  deleteCandidate
};