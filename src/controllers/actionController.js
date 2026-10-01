// src/controllers/actionController.js
//
// FILE PURPOSE:
// Contains the business logic for action-related endpoints. A controller
// sits between routes (which define URLs) and services (which do work).
//
// The controller is responsible for:
//   1. Validating incoming request bodies
//   2. Building action objects with the right shape
//   3. Pushing them into the shared actions array
//   4. Handing them to the queue for processing
//   5. Returning JSON responses
//
// It does NOT talk to Instagram (that's instagramMock's job) and it
// does NOT process the queue (that's actionQueue's job).

const { actions, nextActionId } = require("../data/actions");
const queue = require("../services/actionQueue");
const logger = require("../utils/logger");

// Only these three action types are accepted by the API.
const VALID_TYPES = ["LIKE", "FOLLOW", "COMMENT"];

// Default number of times an action may be attempted before it's
// marked as permanently failed. Callers can override via the request.
const DEFAULT_MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------
// Validation
// ---------------------------------------------------------------

/**
 * Validate an incoming action payload. Returns the cleaned-up values
 * plus an array of error strings (empty if everything is OK).
 *
 * Rules:
 *   - type must be present and one of VALID_TYPES
 *   - target must be a non-empty string
 *   - COMMENT actions must include a non-empty `text`
 *
 * @param {object} body - raw request body
 * @returns {{ errors: string[], type: string, target: string, text: string|null }}
 */
function validate(body) {
  const errors = [];

  // Normalize: trim strings, uppercase the type, default text to null.
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

// ---------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------

/**
 * POST /api/actions
 * Create a new action, validate it, store it, and enqueue it.
 */
function createAction(req, res, next) {
  try {
    const body = req.body || {};
    const { errors, type, target, text } = validate(body);

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Invalid action",
        details: errors
      });
    }

    // Optional per-request override of the retry limit.
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

    // Build the action object. This is the shape stored everywhere.
    const action = {
      id: nextActionId(),
      accountId: body.accountId || null,  // reserved for later
      type,
      target,
      text: type === "COMMENT" ? text : null,
      status: "pending",
      attempts: 0,
      maxAttempts,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };

    actions.push(action);
    logger.log(`Action ${action.id} created: ${action.type} ${action.target}`);

    // Hand it to the queue. If the queue is running, it will start
    // processing immediately.
    queue.enqueue(action);

    res.status(201).json(action);
  } catch (error) {
    // Anything unexpected: hand off to the central error handler.
    next(error);
  }
}

/**
 * GET /api/actions
 * Return all actions, newest first. Supports optional query filters:
 *   ?status=pending
 *   ?type=LIKE
 *   ?accountId=account_1
 */
function listActions(req, res) {
  const { status, type, accountId } = req.query;

  let result = actions;

  if (status) {
    result = result.filter((a) => a.status === String(status).toLowerCase());
  }
  if (type) {
    result = result.filter((a) => a.type === String(type).toUpperCase());
  }
  if (accountId) {
    result = result.filter((a) => a.accountId === accountId);
  }

  // Newest first so the dashboard shows recent activity at the top.
  res.json([...result].reverse());
}

/**
 * GET /api/actions/stats
 * Return counts by status and by type, plus a queue snapshot.
 * This is what the dashboard cards are built from.
 */
function getStats(req, res) {
  const byStatus = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  };
  const byType = { LIKE: 0, FOLLOW: 0, COMMENT: 0 };

  for (const action of actions) {
    byStatus[action.status] = (byStatus[action.status] || 0) + 1;
    byType[action.type] = (byType[action.type] || 0) + 1;
  }

  // Rough retry count: attempts beyond the first "successful" one.
  const totalRetries = actions.reduce(
    (sum, a) =>
      sum + Math.max(0, a.attempts - (a.status === "completed" ? 1 : 0)),
    0
  );

  res.json({
    total: actions.length,
    byStatus,
    byType,
    totalRetries,
    queue: queue.getState()
  });
}

/**
 * GET /api/actions/:id
 * Return a single action by id, or 404 if not found.
 */
function getAction(req, res) {
  const action = actions.find((a) => a.id === req.params.id);

  if (!action) {
    return res.status(404).json({ error: "Action not found" });
  }

  res.json(action);
}

/**
 * DELETE /api/actions/:id
 * Cancel a pending action. Completed/failed/processing actions are
 * kept in the history and cannot be cancelled.
 */
function cancelAction(req, res) {
  const action = actions.find((a) => a.id === req.params.id);

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
  action.completedAt = new Date().toISOString();

  // Take it out of the queue in case it's still waiting there.
  queue.remove(action.id);

  logger.log(`Action ${action.id} cancelled by user`, "warn");

  res.json(action);
}

module.exports = {
  createAction,
  listActions,
  getAction,
  cancelAction,
  getStats
};