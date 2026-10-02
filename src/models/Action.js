// src/models/Action.js
//
// FILE PURPOSE:
// Mongoose schema and model for actions. This replaces the old
// in-memory `src/data/actions.js` array.
//
// Design choices:
//   - _id is a String (e.g. "action_001"), not an ObjectId. This keeps
//     the IDs human-readable and identical to what the API returned
//     before. Existing clients don't need to change.
//   - toJSON renames `_id` → `id` and strips `__v`, so the JSON shape
//     returned by the API matches the old version exactly.

const { Schema, model } = require("mongoose");

const ActionSchema = new Schema(
  {
    _id: { type: String, required: true },
    accountId: { type: String, default: null },
    type: {
      type: String,
      enum: ["LIKE", "FOLLOW", "COMMENT"],
      required: true
    },
    target: { type: String, required: true },
    text: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "cancelled"],
      default: "pending",
      index: true // we query by status often
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    error: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
  },
  {
    // Don't add a __v field. There's no schema version to track here.
    versionKey: false,
    // When a doc is serialized to JSON (e.g. res.json(action)), rename
    // _id → id and drop the internal fields, matching the old shape.
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      }
    }
  }
);

module.exports = model("Action", ActionSchema);