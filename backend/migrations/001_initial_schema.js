const { mysqlPool } = require('../config/mysql');

async function up() {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    // Create Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        uuid VARCHAR(36) NOT NULL UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        profile_picture_url VARCHAR(255),
        status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_uuid (uuid)
      ) ENGINE=InnoDB;
    `);

    // Create Workspaces table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        uuid VARCHAR(36) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id BIGINT NOT NULL,
        status ENUM('active', 'archived', 'deleted') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id),
        INDEX idx_workspace_name (name)
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