const { v4: uuidv4 } = require('uuid');
const { client } = require('../config/cassandra');

class CassandraService {
  /**
   * Save message to Cassandra
   */
  async saveMessage(messageData) {
    const messageId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO messages (
        message_id, chat_id, sender_id, content, media_url, media_type, media_thumbnail, read_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await client.execute(query, [
      messageId,
      messageData.chatId,
      messageData.senderId,
      messageData.content || null,
      messageData.mediaUrl || null,
      messageData.mediaType || null,
      messageData.mediaThumbnail || null,
      new Set(messageData.readBy || []),
      now,
      now,
    ], { prepare: true });

    return {
      id: messageId,
      message_id: messageId,
      chat_id: messageData.chatId,
      sender_id: messageData.senderId,
      content: messageData.content,
      media_url: messageData.mediaUrl,
      media_type: messageData.mediaType,
      media_thumbnail: messageData.mediaThumbnail,
      read_by: messageData.readBy || [],
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Get messages by chat ID
   */
  async getMessagesByChatId(chatId, limit = 100) {
    const query = `
      SELECT * FROM messages
      WHERE chat_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const result = await client.execute(query, [chatId, limit], { prepare: true });
    
    return result.rows.map(row => ({
      _id: row.message_id.toString(),
      id: row.message_id.toString(),
      message_id: row.message_id.toString(),
      chat: row.chat_id,
      chat_id: row.chat_id,
      sender: row.sender_id,
      sender_id: row.sender_id,
      content: row.content,
      readBy: Array.from(row.read_by || []),
      read_by: Array.from(row.read_by || []),
      createdAt: row.created_at,
      created_at: row.created_at,
      updatedAt: row.updated_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Update chat's latest message
   */
  async updateChatLatestMessage(chatId, messageId) {
    const query = `
      UPDATE chats
      SET latest_message_id = ?, updated_at = ?
      WHERE chat_id = ?
    `;

    await client.execute(query, [messageId, new Date(), chatId], { prepare: true });
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
   * Create or update chat
   */
  async saveChat(chatData) {
    const now = new Date();
    const query = `
      INSERT INTO chats (
        chat_id, chat_name, is_group_chat, users, latest_message_id,
        group_admin, workspace_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await client.execute(query, [
      chatData.chatId || chatData.id || chatData._id,
      chatData.chatName || chatData.chat_name || null,
      chatData.isGroupChat !== undefined ? chatData.isGroupChat : (chatData.is_group_chat || false),
      chatData.users || [],
      chatData.latestMessageId || chatData.latest_message_id || null,
      chatData.groupAdmin || chatData.group_admin || null,
      chatData.workspaceId || chatData.workspace_id || null,
      chatData.createdAt || chatData.created_at || now,
      now,
    ], { prepare: true });
  }

  /**
   * Get chats by workspace ID
   */
  async getChatsByWorkspaceId(workspaceId) {
    const query = `SELECT * FROM chats WHERE workspace_id = ?`;
    const result = await client.execute(query, [workspaceId], { prepare: true });
    
    return result.rows.map(row => ({
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
  }

  /**
   * Get chats by user ID (chats where user is a member)
   */
  async getChatsByUserId(userId, workspaceId) {
    // Note: Cassandra doesn't support filtering on list elements efficiently
    // This is a limitation - for production, consider denormalizing or using a different approach
    const query = `SELECT * FROM chats WHERE workspace_id = ?`;
    const result = await client.execute(query, [workspaceId], { prepare: true });
    
    // Filter in application layer (not ideal for large datasets)
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
      }));
  }
}

module.exports = new CassandraService();

