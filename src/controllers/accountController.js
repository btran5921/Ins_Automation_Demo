// src/controllers/accountController.js
//
// FILE PURPOSE:
// Account endpoints, now backed by MongoDB through accountStore.

const accountStore = require("../services/accountStore");
const logger = require("../utils/logger");

async function listAccounts(req, res, next) {
  try {
    res.json(await accountStore.findAll());
  } catch (error) {
    next(error);
  }
}

async function getAccount(req, res, next) {
  try {
    const account = await accountStore.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
}

async function createAccount(req, res, next) {
  try {
    const body = req.body || {};
    const username =
      typeof body.username === "string"
        ? body.username.trim().replace(/^@/, "")
        : "";

    if (!username) {
      return res.status(400).json({ error: "username is required" });
    }

    const existing = await accountStore.findByUsername(username);
    if (existing) {
      return res
        .status(409)
        .json({ error: `Account "${username}" already exists` });
    }

    const id = await accountStore.nextAccountId();

    const account = await accountStore.create({
      _id: id,
      username,
      status: "active",
      createdAt: new Date()
    });

    logger.log(`Account ${account.id} (@${username}) created`);
    res.status(201).json(account);
  } catch (error) {
    // Duplicate-key race: unique index caught it after our check.
    if (error && error.code === 11000) {
      return res.status(409).json({ error: "Account already exists" });
    }
    next(error);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const removed = await accountStore.removeById(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: "Account not found" });
    }
    logger.log(`Account ${removed.id} (@${removed.username}) removed`, "warn");
    res.json(removed);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listAccounts,
  getAccount,
  createAccount,
  deleteAccount
};