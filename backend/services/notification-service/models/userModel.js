const mongoose = require('mongoose');

const userSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    fcmToken: {
      type: String,
      required: false,
    }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

module.exports = User;

