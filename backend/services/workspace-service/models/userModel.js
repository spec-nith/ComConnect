const mongoose = require('mongoose');

const userSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    workspaces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }],
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

module.exports = User;

