// src/services/actionQueue.js
//
// FILE PURPOSE:
// The queue takes actions and processes them one at a time, in order,
// with a delay between each one and automatic retries on failure.
//
// With MongoDB in the picture, the queue is still the source of truth
// for the WORKING SET (the actions currently pending in memory), but
// every state change is also persisted to Mongo via actionStore.persist.
// That means restarting the server doesn't lose work: hydrate() re-queues
// whatever was still pending.
//
// PUBLIC API:
//   enqueue(action)  - add an action doc to the back of the queue
//   remove(id)       - take an action out of the queue (used on cancel)
//   start() / stop() - control processing
//   getState()       - snapshot for the dashboard
//   hydrate()        - load pending actions from Mongo at startup

const Action = require("../models/Action");
const instagramMock = require("./instagramMock");
const rateLimiter = require("./rateLimiter");
const actionStore = require("./actionStore");
const logger = require("../utils/logger");

// ---------------------------------------------------------------
// Module state
// ---------------------------------------------------------------

// Action documents waiting to be processed, in FIFO order.
// Each entry is a Mongoose document so we can mutate + save it.
const waiting = [];

// Whether the queue is allowed to process. Starts as `true` so actions
// enqueued right after server startup get processed immediately.
let running = true;

// True while the processing loop is alive.
let processing = false;

// The ID of the action currently being processed (or null).
let currentActionId = null;

// How many actions have finished processing (completed or failed).
let processedCount = 0;

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Add an action document to the back of the queue. If the queue is
 * running, kick off processing.
 */
function enqueue(action) {
  waiting.push(action);
  logger.log(`Action ${action.id} queued (${waiting.length} waiting)`);
  if (running) kick();
}

/**
 * Remove an action from the waiting list. Used when the user cancels
 * a pending action. Only affects actions that haven't started yet.
 */
function remove(id) {
  const index = waiting.findIndex((a) => a.id === id);
  if (index !== -1) {
    waiting.splice(index, 1);
    logger.log(`Action ${id} removed from queue`);
  }
}

function start() {
  if (running) return;
  running = true;
  logger.log("Queue started");
  kick();
}

function stop() {
  if (!running) return;
  running = false;
  logger.log("Queue stopped (will pause after the current action)", "warn");
}

function getState() {
  return {
    running,
    processing,
    currentActionId,
    waiting: waiting.length,
    waitingIds: waiting.map((a) => a.id),
    processedCount
  };
}

/**
 * Called once at server startup, after connecting to MongoDB.
 *
 * Steps:
 *   1. Recover any actions that were "processing" when the server
 *      stopped — reset them to "pending" so they get retried.
 *   2. Load all pending actions from Mongo and enqueue them.
 *
 * Safe to call more than once; later calls just re-hydrate.
 */
async function hydrate() {
  const recovered = await actionStore.recoverInterrupted();
  if (recovered > 0) {
    logger.log(`Recovered ${recovered} interrupted action(s)`, "warn");
  }

  const pending = await actionStore.findPending();

  // Avoid duplicating actions that are already in the waiting list
  // (in case hydrate is called while the queue is alive).
  const alreadyWaiting = new Set(waiting.map((a) => a.id));
  let added = 0;
  for (const action of pending) {
    if (!alreadyWaiting.has(action.id)) {
      waiting.push(action);
      added += 1;
    }
  }

  if (added > 0) {
    logger.log(`Hydrated ${added} pending action(s) from MongoDB`);
    if (running) kick();
  }
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

function kick() {
  if (processing) return;
  loop().catch((error) => {
    logger.log(`Queue loop crashed: ${error.message}`, "error");
  });
}

async function loop() {
  if (processing) return;
  processing = true;

  try {
    while (running && waiting.length > 0) {
      const action = waiting[0];

      // Skip actions that were cancelled or otherwise no longer pending.
      if (!action || action.status !== "pending") {
        waiting.shift();
        continue;
      }

      waiting.shift();
      currentActionId = action.id;

      await processAction(action);

      currentActionId = null;
      processedCount += 1;

      if (waiting.length > 0 && running) {
        const delay = await rateLimiter.waitBeforeNextAction();
        logger.log(`Rate limiter: waiting ${Math.round(delay)}ms before next action`);
      }
    }
  } finally {
    processing = false;
    currentActionId = null;
  }
}

async function processAction(action) {
  // ---- transition to processing ----
  action.status = "processing";
  action.startedAt = new Date();
  await actionStore.persist(action);

  logger.log(`Action ${action.id} started: ${action.type} ${action.target}`);

  try {
    let result;

    if (action.type === "FOLLOW") {
      result = await instagramMock.follow(action.target);
    } else if (action.type === "LIKE") {
      result = await instagramMock.like(action.target);
    } else if (action.type === "COMMENT") {
      result = await instagramMock.comment(action.target, action.text);
    } else {
      throw new Error(`Unsupported action type: ${action.type}`);
    }

    // ---- success ----
    action.status = "completed";
    action.error = null;
    action.completedAt = new Date();
    await actionStore.persist(action);

    logger.log(`Action ${action.id} completed: ${action.type} ${action.target}`);
    return result;
  } catch (error) {
    action.attempts += 1;
    action.error = error.message;

    if (action.attempts < action.maxAttempts) {
      // Retry: back of the line, and persist the updated attempts.
      action.status = "pending";
      await actionStore.persist(action);
      waiting.push(action);
      logger.log(
        `Action ${action.id} failed (attempt ${action.attempts}/${action.maxAttempts}): ` +
          `${error.message} — re-queued`,
        "warn"
      );
    } else {
      action.status = "failed";
      action.completedAt = new Date();
      await actionStore.persist(action);
      logger.log(
        `Action ${action.id} FAILED permanently after ${action.attempts} attempt(s): ${error.message}`,
        "error"
      );
    }

    return null;
  }
}

module.exports = { enqueue, remove, start, stop, getState, hydrate };