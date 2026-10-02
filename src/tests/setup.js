// tests/setup.js
//
// FILE PURPOSE:
// Shared test helper. Starts an ephemeral MongoDB instance in memory,
// connects Mongoose to it, and provides helpers to reset state between
// tests. Used by tests that touch the database.
//
// mongodb-memory-server downloads a MongoDB binary on first run (~50MB)
// and caches it. Subsequent runs are fast.

const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let server = null;

/**
 * Start an in-memory MongoDB and connect Mongoose to it.
 * Call once per test file (before tests).
 */
async function start() {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
}

/**
 * Disconnect and stop the in-memory MongoDB.
 * Call once per test file (after tests).
 */
async function stop() {
  await mongoose.disconnect();
  if (server) await server.stop();
}

/**
 * Wipe all collections. Call between tests that share a connection.
 */
async function clear() {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }
}

module.exports = { start, stop, clear };