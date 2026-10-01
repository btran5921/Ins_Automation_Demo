// src/server.js
//
// FILE PURPOSE:
// The entry point of the app. Creates the Express server, mounts
// middleware, registers routes, and starts listening on a port.
//
// Right now only /api/health exists. As you add routes for actions,
// accounts, queue, logs, and config, they get mounted here.

const express = require("express");
const logger = require("./utils/logger");

const app = express();
const PORT = 3000;

// ---------- Middleware ----------
// Parse JSON request bodies so req.body works in controllers.
app.use(express.json());

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.json({ message: "Instagram Automation Demo API" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  logger.log(`Server running on http://localhost:${PORT}`);
  logger.log("Mock Instagram API only — no real requests will be made.");
});

module.exports = app;

