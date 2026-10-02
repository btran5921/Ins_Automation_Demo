// src/routes/accountRoutes.js
//
// FILE PURPOSE:
// URL definitions for account endpoints. Mounted in server.js at
// "/api/accounts", so the paths below become:
//
//   GET    /api/accounts
//   POST   /api/accounts
//   GET    /api/accounts/:id
//   DELETE /api/accounts/:id

const express = require("express");
const controller = require("../controllers/accountController");

const router = express.Router();

router.get("/", controller.listAccounts);
router.post("/", controller.createAccount);
router.get("/:id", controller.getAccount);
router.delete("/:id", controller.deleteAccount);

module.exports = router;