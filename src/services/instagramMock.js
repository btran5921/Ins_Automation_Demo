// src/services/instagramMock.js
//
// FILE PURPOSE:
// This file pretends to be the real Instagram API. It exposes the same
// three actions the real API would (follow, like, comment) but instead of
// sending HTTP requests to Instagram, it:
//   1. Waits a bit, to simulate network latency
//   2. Sometimes throws an error, to simulate failures
//   3. Returns a fake success response
//
// NOTHING here talks to the internet. That is intentional — this project
// is a safe learning demo, not a real automation tool.
//
// USAGE:
//   const instagramMock = require("./instagramMock");
//   await instagramMock.follow("@user123");
//   await instagramMock.like("post123");
//   await instagramMock.comment("post456", "Nice post!");

const sleep = require("../utils/sleep");
const logger = require("../utils/logger");

// ---------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------
// These values are used by every mock API call. They can be changed
// at runtime through updateConfig().
const config = {
  failureRate: 0.1, // 0.0 = never fail, 1.0 = always fail
  latencyMs: 200    // base "network" delay in milliseconds
};

/**
 * Return a copy of the current config so callers can't accidentally
 * mutate the internal object.
 */
function getConfig() {
  return { ...config };
}

/**
 * Update config values. Validates inputs and throws on bad data.
 * Will be called from the /api/config route later.
 *
 * @param {object} [opts]
 * @param {number} [opts.failureRate] - between 0 and 1
 * @param {number} [opts.latencyMs]   - between 0 and 10000
 * @returns {object} the new config
 */
function updateConfig({ failureRate, latencyMs } = {}) {
  if (failureRate !== undefined) {
    const v = Number(failureRate);
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error("failureRate must be a number between 0 and 1");
    }
    config.failureRate = v;
  }

  if (latencyMs !== undefined) {
    const v = Number(latencyMs);
    if (!Number.isFinite(v) || v < 0 || v > 10000) {
      throw new Error("latencyMs must be a number between 0 and 10000");
    }
    config.latencyMs = v;
  }

  return getConfig();
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

/**
 * Wait a small random amount of time, to feel like a real network call.
 * Adds up to 200ms of jitter so responses don't come back too uniformly.
 */
async function simulateNetwork() {
  const jitter = Math.random() * 200;
  await sleep(config.latencyMs + jitter);
}

/**
 * Roll the dice and maybe throw an error. This is how we test the
 * queue's error handling and retry logic.
 *
 * @param {string} context - short description for the error message
 */
function maybeFail(context) {
  if (Math.random() < config.failureRate) {
    throw new Error(`Mock Instagram API error while ${context}`);
  }
}

// ---------------------------------------------------------------
// Public "API" methods
// ---------------------------------------------------------------

/**
 * Pretend to follow a user.
 * @param {string} username - e.g. "@example_user"
 * @returns {Promise<object>} fake success response
 */
async function follow(username) {
  logger.log(`Mock API → FOLLOW ${username}`);
  await simulateNetwork();
  maybeFail(`following ${username}`);

  return {
    success: true,
    action: "FOLLOW",
    target: username,
    at: new Date().toISOString()
  };
}

/**
 * Pretend to like a post.
 * @param {string} postId - e.g. "post_123"
 * @returns {Promise<object>} fake success response
 */
async function like(postId) {
  logger.log(`Mock API → LIKE ${postId}`);
  await simulateNetwork();
  maybeFail(`liking ${postId}`);

  return {
    success: true,
    action: "LIKE",
    target: postId,
    at: new Date().toISOString()
  };
}

/**
 * Pretend to comment on a post.
 * @param {string} postId
 * @param {string} text
 * @returns {Promise<object>} fake success response
 */
async function comment(postId, text) {
  logger.log(`Mock API → COMMENT on ${postId}: "${text}"`);
  await simulateNetwork();
  maybeFail(`commenting on ${postId}`);

  return {
    success: true,
    action: "COMMENT",
    target: postId,
    text,
    at: new Date().toISOString()
  };
}

module.exports = {
  follow,
  like,
  comment,
  getConfig,
  updateConfig
};