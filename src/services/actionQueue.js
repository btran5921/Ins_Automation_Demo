// src/services/actionQueue.js
//
// FILE PURPOSE:
// This is the heart of the project. It takes actions that were pushed
// into the queue and processes them one at a time, in order, with a
// delay between each one. It also handles retries when the mock API
// fails.
//
// Flow for each action:
//
//   pending → processing → completed
//                       ↘ (on error) → pending (retry) → ... → failed
//
// Only ONE action runs at a time. That's the entire point of a queue:
// it gives the app control over order and speed.
//
// PUBLIC API:
//   enqueue(action)  - add an action to the back of the queue
//   remove(id)       - take an action out of the queue (used on cancel)
//   start()          - begin / resume processing
//   stop()           - pause after the current action finishes
//   getState()       - snapshot for the dashboard

const { actions } = require("../data/actions");
const instagramMock = require("./instagramMock");
const rateLimiter = require("./rateLimiter");
const logger = require("../utils/logger");

// ---------------------------------------------------------------
// Module state
// ---------------------------------------------------------------

// IDs of actions waiting to be processed, in FIFO order.
// We store IDs (not the action objects) so that whenever we look up
// an action we always see its latest version.
const waiting = [];

// Whether the queue is allowed to process. `start()` sets this true,
// `stop()` sets it false. Starts as `true` so anything enqueued right
// away gets processed without needing an explicit start.
let running = true;

// True while the processing loop is alive. Prevents starting a second
// loop and accidentally processing two actions at once.
let processing = false;

// The ID of the action currently being processed (or null).
let currentActionId = null;

// How many actions have finished processing (completed or failed).
let processedCount = 0;

/**
 * Look up an action in the shared actions array by ID.
 */
function findAction(id) {
  return actions.find((a) => a.id === id);
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Add an action to the back of the queue. If the queue is running,
 * immediately kick off processing.
 *
 * @param {object} action - an action object (from the controller)
 */
function enqueue(action) {
  waiting.push(action.id);
  logger.log(`Action ${action.id} queued (${waiting.length} waiting)`);
  if (running) kick();
}

/**
 * Remove an action from the waiting list. Only affects actions that
 * haven't started processing yet. Used when the user cancels a
 * pending action.
 *
 * @param {string} id
 */
function remove(id) {
  const index = waiting.indexOf(id);
  if (index !== -1) {
    waiting.splice(index, 1);
    logger.log(`Action ${id} removed from queue`);
  }
}

/**
 * Start or resume processing.
 */
function start() {
  if (running) return;
  running = true;
  logger.log("Queue started");
  kick();
}

/**
 * Pause the queue. The current action (if any) finishes normally;
 * only new actions are held back.
 */
function stop() {
  if (!running) return;
  running = false;
  logger.log("Queue stopped (will pause after the current action)", "warn");
}

/**
 * Return a snapshot of queue state for the dashboard.
 */
function getState() {
  return {
    running,
    processing,
    currentActionId,
    waiting: waiting.length,
    waitingIds: [...waiting],
    processedCount
  };
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

/**
 * Make sure a processing loop is running.
 * If one is already alive, do nothing.
 */
function kick() {
  if (processing) return;
  loop().catch((error) => {
    // A crash here would leave the queue stuck, so log loudly.
    logger.log(`Queue loop crashed: ${error.message}`, "error");
  });
}

/**
 * The main loop. Pops one action at a time, processes it, waits a
 * bit via the rate limiter, then goes again. Exits when the queue
 * is empty or `running` becomes false.
 */
async function loop() {
  if (processing) return;
  processing = true;

  try {
    while (running && waiting.length > 0) {
      // Peek at the next ID without removing it yet.
      const id = waiting[0];
      const action = findAction(id);

      // Safety: if the action vanished or isn't pending anymore
      // (e.g. it was cancelled), drop it from the queue and move on.
      if (!action || action.status !== "pending") {
        waiting.shift();
        continue;
      }

      // Now actually remove it from the waiting list.
      waiting.shift();
      currentActionId = id;

      await processAction(action);

      currentActionId = null;
      processedCount += 1;

      // Rate limit between actions, but only if there's more work.
      if (waiting.length > 0 && running) {
        const delay = await rateLimiter.waitBeforeNextAction();
        logger.log(`Rate limiter: waiting ${Math.round(delay)}ms before next action`);
      }
    }
  } finally {
    // Whatever happened, we're no longer processing.
    processing = false;
    currentActionId = null;
  }
}

/**
 * Process a single action by calling the right mock API method.
 * Handles status transitions and retry logic.
 *
 * Status transitions:
 *   pending → processing → completed      (success)
 *   pending → processing → pending        (retry scheduled)
 *   pending → processing → failed         (out of attempts)
 *
 * @param {object} action
 */
async function processAction(action) {
  action.status = "processing";
  action.startedAt = new Date().toISOString();
  logger.log(`Action ${action.id} started: ${action.type} ${action.target}`);

  try {
    let result;

    // Dispatch based on action type. This is the only place that
    // knows how "action types" map onto mock API calls.
    if (action.type === "FOLLOW") {
      result = await instagramMock.follow(action.target);
    } else if (action.type === "LIKE") {
      result = await instagramMock.like(action.target);
    } else if (action.type === "COMMENT") {
      result = await instagramMock.comment(action.target, action.text);
    } else {
      // Shouldn't happen because the controller validates types,
      // but this turns a logic bug into a failed action instead of
      // a silent no-op.
      throw new Error(`Unsupported action type: ${action.type}`);
    }

    action.status = "completed";
    action.error = null;
    action.completedAt = new Date().toISOString();
    logger.log(`Action ${action.id} completed: ${action.type} ${action.target}`);

    return result;
  } catch (error) {
    action.attempts += 1;
    action.error = error.message;

    if (action.attempts < action.maxAttempts) {
      // Still have attempts left: put it back in the queue.
      action.status = "pending";
      waiting.push(action.id); // back of the line, not front
      logger.log(
        `Action ${action.id} failed (attempt ${action.attempts}/${action.maxAttempts}): ` +
          `${error.message} — re-queued`,
        "warn"
      );
    } else {
      // Out of attempts: mark as permanently failed.
      action.status = "failed";
      action.completedAt = new Date().toISOString();
      logger.log(
        `Action ${action.id} FAILED permanently after ${action.attempts} attempt(s): ${error.message}`,
        "error"
      );
    }

    return null;
  }
}

module.exports = { enqueue, remove, start, stop, getState };