// src/models/Candidate.js
//
// FILE PURPOSE:
// A "candidate" is a post the user has saved for manual engagement.
// It's not an action — nothing here is ever executed by the queue.
// It's a to-do item that holds the post's context, AI-generated
// comment suggestions, and the user's own notes.
//
// Status flow:
//   new       → just added, no suggestions yet
//   ready     → suggestions generated, waiting on the user
//   acted     → user engaged with it on Instagram manually
//   skipped   → user decided not to engage

// src/models/Candidate.js
const { Schema, model } = require("mongoose");

const CandidateSchema = new Schema(
  {
    _id: { type: String, required: true },
    sourceUrl: { type: String, default: null },
    author: { type: String, default: null },
    caption: { type: String, default: "" },
    notes: { type: String, default: "" },

    // --- New: fetched/displayed post details ---
    imageUrl: { type: String, default: null },
    musicTitle: { type: String, default: null },
    musicArtist: { type: String, default: null },
    metadataError: { type: String, default: null },
    metadataFetchedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["new", "ready", "acted", "skipped"],
      default: "new",
      index: true
    },
    suggestions: { type: [String], default: [] },
    chosenComment: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
    actedAt: { type: Date, default: null }
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

module.exports = model("Candidate", CandidateSchema);