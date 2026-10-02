// src/models/Account.js
//
// FILE PURPOSE:
// Mongoose schema for the optional mock accounts. Same _id-as-String
// convention as Action, and same toJSON transform.

const { Schema, model } = require("mongoose");

const AccountSchema = new Schema(
  {
    _id: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active"
    },
    createdAt: { type: Date, default: Date.now }
  },
  {
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      }
    }
  }
);

module.exports = model("Account", AccountSchema);