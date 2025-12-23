const mongoose = require('mongoose');

const workspaceSchema = mongoose.Schema(
  {
    workspaceName: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roles: [
      {
        roleName: { type: String, required: true },
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      },
    ],
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
  },
  { timestamps: true }
);

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;

