const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'user',
  password: process.env.MYSQL_PASSWORD || '7878',
  database: process.env.MYSQL_DATABASE || 'chatapp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function up() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Users Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        uuid VARCHAR(36) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        pic VARCHAR(255) DEFAULT 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg',
        is_admin BOOLEAN DEFAULT FALSE,
        fcm_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_uuid (uuid)
      ) ENGINE=InnoDB;
    `);

    // Workspaces Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        uuid VARCHAR(36) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        created_by BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_uuid (uuid)
      ) ENGINE=InnoDB;
    `);

    // Workspace Roles Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS workspace_roles (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        workspace_id BIGINT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE KEY unique_workspace_role (workspace_id, name)
      ) ENGINE=InnoDB;
    `);

    // Workspace Members Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS workspace_members (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        workspace_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        role_id BIGINT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES workspace_roles(id) ON DELETE CASCADE,
        UNIQUE KEY unique_workspace_user (workspace_id, user_id)
      ) ENGINE=InnoDB;
    `);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { up }; 