const { mysqlPool } = require('../config/mysql');

class WorkspaceSQL {
  static async create({ name, createdBy, roles }) {
    const connection = await mysqlPool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Create workspace
      const [workspaceResult] = await connection.execute(
        'INSERT INTO workspaces (uuid, name, created_by) VALUES (UUID(), ?, ?)',
        [name, createdBy]
      );
      
      const workspaceId = workspaceResult.insertId;

      // Create roles
      for (const role of roles) {
        const [roleResult] = await connection.execute(
          'INSERT INTO workspace_roles (workspace_id, name) VALUES (?, ?)',
          [workspaceId, role]
        );
      }

      // Add creator as member with all roles
      const [rolesResult] = await connection.execute(
        'SELECT id FROM workspace_roles WHERE workspace_id = ?',
        [workspaceId]
      );

      for (const role of rolesResult) {
        await connection.execute(
          'INSERT INTO workspace_members (workspace_id, user_id, role_id) VALUES (?, ?, ?)',
          [workspaceId, createdBy, role.id]
        );
      }

      await connection.commit();
      return workspaceId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findById(id) {
    const [workspace] = await mysqlPool.execute(
      `SELECT w.*, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', wr.id,
            'name', wr.name
          )
        ) as roles
       FROM workspaces w
       LEFT JOIN workspace_roles wr ON w.id = wr.workspace_id
       WHERE w.id = ?
       GROUP BY w.id`,
      [id]
    );
    return workspace[0];
  }

  static async getUserWorkspaces(userId) {
    const [workspaces] = await mysqlPool.execute(
      `SELECT DISTINCT w.*, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', wr.id,
            'name', wr.name
          )
        ) as roles
       FROM workspaces w
       JOIN workspace_members wm ON w.id = wm.workspace_id
       JOIN workspace_roles wr ON wm.role_id = wr.id
       WHERE wm.user_id = ?
       GROUP BY w.id`,
      [userId]
    );
    return workspaces;
  }

  static async addRole(workspaceId, roleName) {
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        'INSERT INTO workspace_roles (workspace_id, name) VALUES (?, ?)',
        [workspaceId, roleName]
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

  static async getRoles(workspaceId) {
    const [roles] = await mysqlPool.execute(
      'SELECT * FROM workspace_roles WHERE workspace_id = ?',
      [workspaceId]
    );
    return roles;
  }

  static async addMember(workspaceId, userId, roleId) {
    await mysqlPool.execute(
      'INSERT INTO workspace_members (workspace_id, user_id, role_id) VALUES (?, ?, ?)',
      [workspaceId, userId, roleId]
    );
  }
}

module.exports = { WorkspaceSQL };
