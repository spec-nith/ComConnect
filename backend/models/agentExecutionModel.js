const mongoose = require("mongoose");

const agentExecutionSchema = new mongoose.Schema(
  {
    executionId: { type: String, required: true, unique: true, index: true },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    source: { type: String, required: true },
    status: {
      type: String,
      enum: ["executing", "completed"],
      default: "executing",
    },
    taskCount: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AgentExecution", agentExecutionSchema);
