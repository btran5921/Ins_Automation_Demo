// src/controllers/actionController.js
//
// FILE PURPOSE:
// Business logic for action endpoints. With MongoDB, every handler is
// async and talks to actionStore instead of an in-memory array.

const actionStore = require("../services/actionStore");
const queue = require("../services/actionQueue");
const logger = require("../utils/logger");

const VALID_TYPES = ["LIKE", "FOLLOW", "COMMENT"];
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Validate an incoming action payload. Same rules as before.
 */
function validate(body) {
  const errors = [];

  const type =
    typeof body.type === "string" ? body.type.trim().toUpperCase() : "";
  const target =
    typeof body.target === "string" ? body.target.trim() : "";
  const text =
    typeof body.text === "string" ? body.text.trim() : null;

  if (!type) {
    errors.push("type is required");
  } else if (!VALID_TYPES.includes(type)) {
    errors.push(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }

  if (!target) {
    errors.push("target is required");
  }

  if (type === "COMMENT" && !text) {
    errors.push("text is required for COMMENT actions");
  }

  return { errors, type, target, text };
}

/* ---------------- POST /api/actions ---------------- */
async function createAction(req, res, next) {
  try {
    const body = req.body || {};
    const { errors, type, target, text } = validate(body);

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Invalid action",
        details: errors
      });
    }

    let maxAttempts = DEFAULT_MAX_ATTEMPTS;
    if (body.maxAttempts !== undefined) {
      const n = Number(body.maxAttempts);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        return res.status(400).json({
          error: "maxAttempts must be an integer between 1 and 10"
        });
      }
      maxAttempts = n;
    }

    // Generate a sequential, human-readable id, then insert.
    const id = await actionStore.nextActionId();

    const action = await actionStore.create({
      _id: id,
      accountId: body.accountId || null,
      type,
      target,
      text: type === "COMMENT" ? text : null,
      status: "pending",
      attempts: 0,
      maxAttempts,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null
    });

    logger.log(`Action ${action.id} created: ${action.type} ${action.target}`);

    // Hand the live document to the queue. It will persist state changes.
    queue.enqueue(action);

    res.status(201).json(action);
  } catch (error) {
    next(error);
  }
}

/* ---------------- GET /api/actions ---------------- */
async function listActions(req, res, next) {
  try {
    const filters = {};
    if (req.query.status) {
      filters.status = String(req.query.status).toLowerCase();
    }
    if (req.query.type) {
      filters.type = String(req.query.type).toUpperCase();
    }
    if (req.query.accountId) {
      filters.accountId = String(req.query.accountId);
    }

    const result = await actionStore.findAll(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/* ---------------- GET /api/actions/stats ---------------- */
async function getStats(req, res, next) {
  try {
    const { total, byStatus, byType } = await actionStore.getStats();

    res.json({
      total,
      byStatus,
      byType,
      queue: queue.getState()
    });
  } catch (error) {
    next(error);
  }
}

/* ---------------- GET /api/actions/:id ---------------- */
async function getAction(req, res, next) {
  try {
    const action = await actionStore.findById(req.params.id);
    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }
    res.json(action);
  } catch (error) {
    next(error);
  }
}

/* ---------------- DELETE /api/actions/:id ---------------- */
async function cancelAction(req, res, next) {
  try {
    const action = await actionStore.findById(req.params.id);

    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }

    if (action.status === "cancelled") {
      return res.status(409).json({ error: "Action is already cancelled" });
    }

    if (action.status !== "pending") {
      return res.status(409).json({
        error: `Only pending actions can be cancelled (current status: "${action.status}")`
      });
    }

    action.status = "cancelled";
    action.completedAt = new Date();
    await actionStore.persist(action);

    queue.remove(action.id);
    logger.log(`Action ${action.id} cancelled by user`, "warn");

    res.json(action);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createAction,
  listActions,
  getAction,
  cancelAction,
  getStats
};