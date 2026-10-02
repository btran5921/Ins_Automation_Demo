// src/services/candidateStore.js
//
// FILE PURPOSE:
// All MongoDB access for candidates, mirroring the pattern from
// actionStore/accountStore. Controllers never touch the model directly.

const Candidate = require("../models/Candidate");
const Counter = require("../models/Counter");

async function nextCandidateId() {
  const counter = await Counter.findOneAndUpdate(
    { _id: "candidate" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `cand_${String(counter.seq).padStart(3, "0")}`;
}

async function create(data) {
  return Candidate.create(data);
}

async function findById(id) {
  return Candidate.findById(id);
}

/**
 * List candidates, newest first. Optional status filter.
 * @param {object} [filters] - e.g. { status: "ready" }
 */
async function findAll(filters = {}) {
  return Candidate.find(filters).sort({ createdAt: -1 });
}

async function persist(candidate) {
  if (typeof candidate.save === "function") {
    await candidate.save();
  }
}

async function removeById(id) {
  return Candidate.findByIdAndDelete(id);
}

/**
 * Counts by status, for the dashboard header.
 */
async function getCounts() {
  const rows = await Candidate.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  const counts = { new: 0, ready: 0, acted: 0, skipped: 0 };
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

module.exports = {
  nextCandidateId,
  create,
  findById,
  findAll,
  persist,
  removeById,
  getCounts
};