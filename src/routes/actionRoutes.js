// src/routes/actionRoutes.js
//
// FILE PURPOSE:
// Defines the URL paths for action-related endpoints and maps each
// one to a handler in actionController.js. This file is intentionally
// thin: it only handles routing, no business logic.
//
// The router is mounted in server.js at "/api/actions", so the paths
// declared here are relative to that. For example, router.post("/")
// becomes POST /api/actions.

const express = require("express");
const controller = require("../controllers/actionController");

const router = express.Router();

// IMPORTANT: /stats must be declared BEFORE /:id.
// Otherwise Express would match "/stats" as an :id and call getAction.
router.get("/stats", controller.getStats);

// Create a new action.
//   POST /api/actions
router.post("/", controller.createAction);

// List all actions (with optional filters).
//   GET /api/actions
router.get("/", controller.listActions);

// Fetch a single action.
//   GET /api/actions/:id
router.get("/:id", controller.getAction);

// Cancel a pending action.
//   DELETE /api/actions/:id
router.delete("/:id", controller.cancelAction);

module.exports = router;