const mongoose = require("mongoose");

const workspaceKnowledgeStateSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      unique: true,
      index: true,
    },
    indexVersion: { type: String, required: true, default: "pending" },
    documentCount: { type: Number, required: true, default: 0 },
    indexedAt: { type: Date },
    backend: { type: String, default: "unknown" },
    status: {
      type: String,
      enum: ["indexing", "ready", "failed"],
      default: "indexing",
      index: true,
    },
    leaseUntil: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "WorkspaceKnowledgeState",
  workspaceKnowledgeStateSchema
);
