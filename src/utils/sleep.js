// src/utils/sleep.js
//
// FILE PURPOSE:
// A tiny utility that lets you pause code for a number of milliseconds
// using `await`. Node's built-in setTimeout works with callbacks, which
// doesn't play nicely with async/await code. Wrapping it in a Promise
// makes it awaitable.
//
// USAGE:
//   const sleep = require("../utils/sleep");
//   await sleep(3000); // pause for ~3 seconds
//
// Used by:
//   - src/services/instagramMock.js (to simulate network latency)
//   - src/services/rateLimiter.js   (to delay between actions)

/**
 * Pause execution for the given number of milliseconds.
 *
 * @param {number} ms - how long to wait, in milliseconds
 * @returns {Promise<void>} resolves after the delay
 */
function sleep(ms) {
  // setTimeout calls `resolve` once the timer fires.
  // Returning that Promise lets callers use `await sleep(...)`.
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = sleep;