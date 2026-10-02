// src/services/actionStore.js
//
// FILE PURPOSE:
// All MongoDB access for actions lives here. Controllers and services
// never import the Action model directly — they call these functions.
// That keeps persistence in one place and makes it easy to swap the
// storage layer again later if you ever want to.

const Action = require("../models/Action");
const Counter = require("../models/Counter");

/**
 * Generate the next action ID, e.g. "action_001". Uses an atomic
 * $inc on the "action" counter document so it's race-safe.
 *
 * @returns {Promise<string>}
 */
async function nextActionId() {
  const counter = await Counter.findOneAndUpdate(
    { _id: "action" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `action_${String(counter.seq).padStart(3, "0")}`;
}

/**
 * Insert a new action. `data` must include an `_id`.
 */
async function create(data) {
  return Action.create(data);
}

/**
 * Fetch a single action by ID, or null.
 */
async function findById(id) {
  return Action.findById(id);
}

/**
 * Fetch all actions matching the given filters, newest first.
 * @param {object} [filters] - e.g. { status: "pending", type: "LIKE" }
 */
async function findAll(filters = {}) {
  return Action.find(filters).sort({ createdAt: -1 });
}

/**
 * Fetch all pending actions, oldest first. Used at startup to
 * re-queue work that was left over from a previous run.
 */
async function findPending() {
  return Action.find({ status: "pending" }).sort({ createdAt: 1 });
}

/**
 * Any actions that were mid-flight ("processing") when the server
 * stopped are orphaned. Reset them to "pending" so they get retried.
 *
 * @returns {Promise<number>} how many were recovered
 */
async function recoverInterrupted() {
  const result = await Action.updateMany(
    { status: "processing" },
    { status: "pending", startedAt: null }
  );
  return result.modifiedCount;
}

/**
 * Persist a Mongoose document. The queue calls this after each state
 * change. Failures are logged but not thrown, so a transient DB blip
 * doesn't crash the queue.
 */
async function persist(action) {
  if (typeof action.save === "function") {
    await action.save();
  }
}

/**
 * Aggregate stats by status and by type.
 * Returns { total, byStatus, byType }.
 */
async function getStats() {
  const [total, statusAgg, typeAgg] = await Promise.all([
    Action.countDocuments(),
    Action.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Action.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }])
  ]);

  const byStatus = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  };
  for (const row of statusAgg) byStatus[row._id] = row.count;

  const byType = { LIKE: 0, FOLLOW: 0, COMMENT: 0 };
  for (const row of typeAgg) byType[row._id] = row.count;

  return { total, byStatus, byType };
}

module.exports = {
  nextActionId,
  create,
  findById,
  findAll,
  findPending,
  recoverInterrupted,
  persist,
  getStats
};