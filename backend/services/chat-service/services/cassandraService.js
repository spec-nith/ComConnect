const { v4: uuidv4 } = require('uuid');
const { client } = require('../config/cassandra');

class CassandraService {
  /**
   * Save chat to Cassandra
   */
  async saveChat(chatData) {
    const chatId = chatData.chatId || chatData.id || chatData._id || uuidv4();
    const now = new Date();
    
    const query = `
      INSERT INTO chats (
        chat_id, chat_name, is_group_chat, users, latest_message_id,
        group_admin, workspace_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await client.execute(query, [
      chatId,
      chatData.chatName || chatData.chat_name || null,
      chatData.isGroupChat !== undefined ? chatData.isGroupChat : (chatData.is_group_chat || false),
      chatData.users || [],
      chatData.latestMessageId || chatData.latest_message_id || null,
      chatData.groupAdmin || chatData.group_admin || null,
      chatData.workspaceId || chatData.workspace_id || null,
      chatData.createdAt || chatData.created_at || now,
      now,
    ], { prepare: true });

    return await this.getChatById(chatId);
  }

  /**
   * Get chat by ID
   */
  async getChatById(chatId) {
    const query = `SELECT * FROM chats WHERE chat_id = ?`;
    const result = await client.execute(query, [chatId], { prepare: true });
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      _id: row.chat_id,
      id: row.chat_id,
      chat_id: row.chat_id,
      chatName: row.chat_name,
      chat_name: row.chat_name,
      isGroupChat: row.is_group_chat,
      is_group_chat: row.is_group_chat,
      users: row.users || [],
      latestMessage: row.latest_message_id,
      latest_message_id: row.latest_message_id,
      groupAdmin: row.group_admin,
      group_admin: row.group_admin,
      workspace: row.workspace_id,
      workspace_id: row.workspace_id,
      createdAt: row.created_at,
      created_at: row.created_at,
      updatedAt: row.updated_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Find chats by criteria
   */
  async findChats(criteria) {
    // Cassandra doesn't support complex queries like MongoDB
    // We'll need to fetch by workspace and filter in application
    const workspaceId = criteria.workspace || criteria.workspaceId;
    
    if (!workspaceId) {
      return [];
    }

    const query = `SELECT * FROM chats WHERE workspace_id = ?`;
    const result = await client.execute(query, [workspaceId], { prepare: true });
    
    let chats = result.rows.map(row => ({
      _id: row.chat_id,
      id: row.chat_id,
      chat_id: row.chat_id,
      chatName: row.chat_name,
      chat_name: row.chat_name,
      isGroupChat: row.is_group_chat,
      is_group_chat: row.is_group_chat,
      users: row.users || [],
      latestMessage: row.latest_message_id,
      latest_message_id: row.latest_message_id,
      groupAdmin: row.group_admin,
      group_admin: row.group_admin,
      workspace: row.workspace_id,
      workspace_id: row.workspace_id,
      createdAt: row.created_at,
      created_at: row.created_at,
      updatedAt: row.updated_at,
      updated_at: row.updated_at,
    }));

    // Filter by isGroupChat if specified
    if (criteria.isGroupChat !== undefined) {
      chats = chats.filter(chat => chat.isGroupChat === criteria.isGroupChat);
    }

    // Filter by users if specified
    if (criteria.users) {
      const userIds = Array.isArray(criteria.users) ? criteria.users : [criteria.users];
      chats = chats.filter(chat => {
        const chatUserIds = chat.users || [];
        return userIds.every(userId => chatUserIds.includes(userId.toString()));
      });
    }

    return chats;
  }

  /**
   * Update chat
   */
  async updateChat(chatId, updateData) {
    const now = new Date();
    const updates = [];
    const values = [];

    if (updateData.chatName !== undefined || updateData.chat_name !== undefined) {
      updates.push('chat_name = ?');
      values.push(updateData.chatName || updateData.chat_name);
    }

    if (updateData.users !== undefined) {
      updates.push('users = ?');
      values.push(updateData.users);
    }

    if (updateData.groupAdmin !== undefined || updateData.group_admin !== undefined) {
      updates.push('group_admin = ?');
      values.push(updateData.groupAdmin || updateData.group_admin);
    }

    if (updateData.latestMessageId !== undefined || updateData.latest_message_id !== undefined) {
      updates.push('latest_message_id = ?');
      values.push(updateData.latestMessageId || updateData.latest_message_id);
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(chatId);

    if (updates.length === 1) {
      // Only updated_at, no other updates
      return await this.getChatById(chatId);
    }

    const query = `UPDATE chats SET ${updates.join(', ')} WHERE chat_id = ?`;
    await client.execute(query, values, { prepare: true });

    return await this.getChatById(chatId);
  }

  /**
   * Get chats by workspace and user
   */
  async getChatsByWorkspaceAndUser(workspaceId, userId) {
    const query = `SELECT * FROM chats WHERE workspace_id = ?`;
    const result = await client.execute(query, [workspaceId], { prepare: true });
    
    // Filter in application layer (Cassandra limitation)
    return result.rows
      .filter(row => (row.users || []).includes(userId))
      .map(row => ({
        _id: row.chat_id,
        id: row.chat_id,
        chat_id: row.chat_id,
        chatName: row.chat_name,
        chat_name: row.chat_name,
        isGroupChat: row.is_group_chat,
        is_group_chat: row.is_group_chat,
        users: row.users || [],
        latestMessage: row.latest_message_id,
        latest_message_id: row.latest_message_id,
        groupAdmin: row.group_admin,
        group_admin: row.group_admin,
        workspace: row.workspace_id,
        workspace_id: row.workspace_id,
        createdAt: row.created_at,
        created_at: row.created_at,
        updatedAt: row.updated_at,
        updated_at: row.updated_at,
      }))
      .sort((a, b) => {
        // Sort by updated_at descending
        const aTime = a.updatedAt || a.updated_at || a.createdAt || a.created_at;
        const bTime = b.updatedAt || b.updated_at || b.createdAt || b.created_at;
        return new Date(bTime) - new Date(aTime);
      });
  }
}

module.exports = new CassandraService();

