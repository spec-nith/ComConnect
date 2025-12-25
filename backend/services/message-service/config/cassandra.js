const cassandra = require('cassandra-driver');

const client = new cassandra.Client({
  contactPoints: process.env.CASSANDRA_CONTACT_POINTS?.split(',') || ['localhost'],
  localDataCenter: process.env.CASSANDRA_LOCAL_DATACENTER || 'datacenter1',
  // Don't specify keyspace here - we'll create it first, then use it
  credentials: {
    username: process.env.CASSANDRA_USERNAME || 'cassandra',
    password: process.env.CASSANDRA_PASSWORD || 'cassandra',
  },
  socketOptions: {
    connectTimeout: 30000,
  },
});

const Connection = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to Cassandra successfully');

    // Create keyspace if it doesn't exist
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS ${process.env.CASSANDRA_KEYSPACE || 'comconnect'}
      WITH replication = {
        'class': 'SimpleStrategy',
        'replication_factor': 1
      }
    `);

    // Use the keyspace
    await client.execute(`USE ${process.env.CASSANDRA_KEYSPACE || 'comconnect'}`);

    // Create messages table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id UUID PRIMARY KEY,
        chat_id TEXT,
        sender_id TEXT,
        content TEXT,
        media_url TEXT,
        media_type TEXT,
        media_thumbnail TEXT,
        read_by SET<TEXT>,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);

    // Create index on chat_id for querying messages by chat
    await client.execute(`
      CREATE INDEX IF NOT EXISTS ON messages (chat_id)
    `);

    // Create index on sender_id
    await client.execute(`
      CREATE INDEX IF NOT EXISTS ON messages (sender_id)
    `);

    // Create chats table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS chats (
        chat_id TEXT PRIMARY KEY,
        chat_name TEXT,
        is_group_chat BOOLEAN,
        users LIST<TEXT>,
        latest_message_id UUID,
        group_admin TEXT,
        workspace_id TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);

    // Create index on workspace_id
    await client.execute(`
      CREATE INDEX IF NOT EXISTS ON chats (workspace_id)
    `);

    console.log('✅ Cassandra tables created/verified');
    return client;
  } catch (error) {
    console.error('❌ Cassandra Connection Error:', error.message);
    throw error;
  }
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await client.shutdown();
});

module.exports = Connection;
module.exports.client = client;

