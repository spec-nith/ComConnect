const mongoose = require('mongoose');

const workspaceSchema = mongoose.Schema(
  {
    workspaceName: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;

