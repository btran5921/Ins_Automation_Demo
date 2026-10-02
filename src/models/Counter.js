// src/models/Counter.js
//
// FILE PURPOSE:
// A tiny counters collection used to generate sequential, human-readable
// IDs like "action_001". Using an atomic $inc via findOneAndUpdate
// avoids the race conditions you'd get from "look at max _id, add 1".
//
// We use one document with _id = "action" and one with _id = "account".
// You can add more for other future ID types.

const { Schema, model } = require("mongoose");

const CounterSchema = new Schema({
  _id: { type: String, required: true }, // counter name, e.g. "action"
  seq: { type: Number, default: 0 }
});

module.exports = model("Counter", CounterSchema);