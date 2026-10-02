// src/db/connect.js
//
// FILE PURPOSE:
// Opens the Mongoose connection and wires up connection lifecycle
// events to the logger. Called once at server startup before anything
// else touches the database.
//
// All models (Action, Account, Counter) implicitly use whichever
// connection Mongoose has open. So requiring this file once at the top
// of server.js is enough.

const mongoose = require("mongoose");
const logger = require("../utils/logger");

/**
 * Connect to MongoDB.
 *
 * @param {string} uri - e.g. "mongodb://localhost:27017/instagram_demo"
 * @returns {Promise<void>} resolves once connected
 */
async function connect(uri) {
  mongoose.connection.on("connected", () =>
    logger.log("MongoDB connected")
  );
  mongoose.connection.on("disconnected", () =>
    logger.log("MongoDB disconnected", "warn")
  );
  mongoose.connection.on("error", (err) =>
    logger.log(`MongoDB error: ${err.message}`, "error")
  );

  await mongoose.connect(uri);
}

/**
 * Close the connection cleanly. Used on shutdown.
 */
async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect, mongoose };