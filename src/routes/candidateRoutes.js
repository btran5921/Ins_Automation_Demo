// src/routes/candidateRoutes.js
//
// FILE PURPOSE:
// URL definitions for candidate endpoints. Mounted at /api/candidates.

const express = require("express");
const controller = require("../controllers/candidateController");

const router = express.Router();

// /counts must be declared before /:id.
router.get("/counts", controller.getCounts);

router.post("/", controller.createCandidate);
router.get("/", controller.listCandidates);
router.get("/:id", controller.getCandidate);
router.post("/:id/suggest", controller.suggest);
router.post("/:id/refresh-metadata", controller.refreshMetadata);
router.patch("/:id", controller.updateCandidate);
router.delete("/:id", controller.deleteCandidate);

module.exports = router;