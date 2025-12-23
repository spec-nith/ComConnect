const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  heading: { type: String, required: true },
  description: { type: String, required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, default: 'to-do' },
  comments: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, comment: String }],
  attachments: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

module.exports = mongoose.model('Task', taskSchema);

