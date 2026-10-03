// src/server.js
//
// FILE PURPOSE:
// Entry point. Boot order matters here:
//   1. Load environment (.env)
//   2. Connect to MongoDB
//   3. Hydrate the queue with pending actions from Mongo
//   4. Start listening
//
// If any of those fail, we log clearly and exit. Better than silently
// running with a broken database connection.

require("dotenv").config();

const express = require("express");
const path = require("path");

const { connect } = require("./db/connect");
const logger = require("./utils/logger");
const actionRoutes = require("./routes/actionRoutes");
const accountRoutes = require("./routes/accountRoutes");
const candidateRoutes = require("./routes/candidateRoutes");
const systemRoutes = require("./routes/systemRoutes");
const queue = require("./services/actionQueue");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/instagram_demo";

app.use(express.json());
// Allow the bookmarklet (running on instagram.com) to POST here.
// Fine for a local-only tool. If you ever deploy this publicly,
// scope Access-Control-Allow-Origin down to your own domain.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/actions", actionRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api", systemRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.log(`Unhandled error: ${err.message}`, "error");
  res.status(500).json({ error: "Internal server error" });
});

async function main() {
  try {
    await connect(MONGODB_URI);
    await queue.hydrate();

    app.listen(PORT, () => {
      logger.log(`Server running on http://localhost:${PORT}`);
      if (!process.env.ANTHROPIC_API_KEY) {
        logger.log(
          "ANTHROPIC_API_KEY not set — AI suggestions will be disabled",
          "warn"
        );
      }
    });
  } catch (error) {
    logger.log(`Startup failed: ${error.message}`, "error");
    process.exit(1);
  }
}

main();

module.exports = app;
