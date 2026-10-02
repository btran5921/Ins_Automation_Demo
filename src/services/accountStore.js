// src/services/accountStore.js
//
// FILE PURPOSE:
// All MongoDB access for accounts, mirroring actionStore.

const Account = require("../models/Account");
const Counter = require("../models/Counter");

/**
 * Generate the next account ID, e.g. "account_003".
 */
async function nextAccountId() {
  const counter = await Counter.findOneAndUpdate(
    { _id: "account" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `account_${counter.seq}`;
}

async function findAll() {
  return Account.find().sort({ createdAt: 1 });
}

async function findById(id) {
  return Account.findById(id);
}

async function findByUsername(username) {
  return Account.findOne({ username });
}

async function create(data) {
  return Account.create(data);
}

async function removeById(id) {
  return Account.findByIdAndDelete(id);
}

module.exports = {
  nextAccountId,
  findAll,
  findById,
  findByUsername,
  create,
  removeById
};