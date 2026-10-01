// src/services/rateLimiter.js
//
// FILE PURPOSE:
// Controls how fast actions are processed. After each action, the queue
// asks the rate limiter to wait a bit before moving on to the next one.
// That turns a burst of actions into a slow, steady stream — which is
// one of the key concepts you're learning in this project.
//
// The delay is random between minDelayMs and maxDelayMs so it looks
// less robotic. Both values can be changed at runtime.

const sleep = require("../utils/sleep");

// ---------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------
const config = {
  minDelayMs: 2000, // shortest wait between actions (2 seconds)
  maxDelayMs: 4000  // longest wait between actions (4 seconds)
};

/**
 * Return a copy of the current config.
 */
function getConfig() {
  return { ...config };
}

/**
 * Update delay bounds. Throws if input is invalid.
 *
 * @param {object} [opts]
 * @param {number} [opts.minDelayMs]
 * @param {number} [opts.maxDelayMs]
 * @returns {object} the new config
 */
function updateConfig({ minDelayMs, maxDelayMs } = {}) {
  if (minDelayMs !== undefined) {
    const v = Number(minDelayMs);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error("minDelayMs must be a number >= 0");
    }
    config.minDelayMs = v;
  }

  if (maxDelayMs !== undefined) {
    const v = Number(maxDelayMs);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error("maxDelayMs must be a number >= 0");
    }
    config.maxDelayMs = v;
  }

  // Sanity check: max must be >= min
  if (config.maxDelayMs < config.minDelayMs) {
    throw new Error("maxDelayMs must be >= minDelayMs");
  }

  return getConfig();
}

/**
 * Wait a random amount of time between min and max.
 * The queue calls this between actions.
 *
 * @returns {Promise<number>} how long we waited, in ms (for logging)
 */
async function waitBeforeNextAction() {
  const { minDelayMs, maxDelayMs } = config;
  const spread = Math.max(0, maxDelayMs - minDelayMs);
  const delay = minDelayMs + Math.random() * spread;

  await sleep(delay);
  return delay;
}

module.exports = { waitBeforeNextAction, getConfig, updateConfig };