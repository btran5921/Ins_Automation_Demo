// src/data/actions.js
//
// FILE PURPOSE:
// This is a temporary in-memory "database" for actions. It exports a
// shared array that every module pushes into and reads from.
//
// WHY AN ARRAY:
// For the first version we don't want to deal with MongoDB setup. An
// array is enough to learn queues, rate limiting, retries, and API
// design. The tradeoff is that ALL data is lost when the server
// restarts. That's fine for now.
//
// LATER:
// Replace this file with a Mongoose model. The rest of the app already
// goes through this module for reads/writes, so the swap is contained.
//
// USAGE:
//   const { actions, nextActionId } = require("../data/actions");
//
//   const id = nextActionId();          // "action_001", "action_002", ...
//   actions.push({ id, type: "LIKE", ... });
//   const found = actions.find(a => a.id === id);

// The shared array. Every module imports the SAME array reference, so
// pushes here are visible everywhere. Do not reassign this variable.
const actions = [];

// Internal counter used by nextActionId(). Not exported directly —
// only the function that uses it is exposed.
let counter = 0;

/**
 * Generate the next action ID in the form "action_001", "action_002", ...
 * Zero-padded to 3 digits so IDs sort naturally in a table.
 *
 * @returns {string} the next unique action id
 */
function nextActionId() {
  counter += 1;
  return `action_${String(counter).padStart(3, "0")}`;
}

module.exports = { actions, nextActionId };