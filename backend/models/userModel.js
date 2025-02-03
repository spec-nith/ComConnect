const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { mysqlPool } = require('../config/mysql');

// MySQL User operations
class UserSQL {
  static async create(userData) {
    const { name, email, password, pic } = userData;
    const connection = await mysqlPool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const [result] = await connection.execute(
        `INSERT INTO users (uuid, name, email, password_hash, pic) 
         VALUES (UUID(), ?, ?, ?, ?)`,
        [name, email, hashedPassword, pic]
      );

      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findByEmail(email) {
    const [rows] = await mysqlPool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await mysqlPool.execute(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  static async searchUsers(keyword, excludeUserId) {
    const [rows] = await mysqlPool.execute(
      `SELECT * FROM users 
       WHERE id != ? 
       AND (name LIKE ? OR email LIKE ?)`,
      [excludeUserId, `%${keyword}%`, `%${keyword}%`]
    );
    return rows;
  }

  static async verifyPassword(hashedPassword, password) {
    return await bcrypt.compare(password, hashedPassword);
  }

  static async updateFCMToken(userId, token) {
    await mysqlPool.execute(
      'UPDATE users SET fcm_token = ? WHERE id = ?',
      [token, userId]
    );
  }
}

// Keep the mongoose schema for backward compatibility
const userSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    pic: {
      type: String,
      required: true,
      default: 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg',
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },
    workspaces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }],
    fcmToken: {
      type: String,
      required: false,
    }
  },
  { timestamps: true }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next(); // Make sure to proceed to the next middleware
});

const User = mongoose.model('User', userSchema);

module.exports = { User, UserSQL };

