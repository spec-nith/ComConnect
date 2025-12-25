const { Client } = require('@elastic/elasticsearch');

class ElasticsearchService {
  constructor() {
    const node = process.env.ELASTICSEARCH_NODE || 'http://elasticsearch:9200';
    
    try {
      this.client = new Client({
        node,
        requestTimeout: 60000,
        pingTimeout: 3000,
        maxRetries: 3,
        // For development - disable SSL verification
        ssl: {
          rejectUnauthorized: false
        }
      });
    } catch (error) {
      console.warn('⚠️ Failed to create Elasticsearch client:', error.message);
      this.client = null;
    }

    this.indexPrefix = process.env.ELASTICSEARCH_INDEX_PREFIX || 'comconnect';
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!this.client) {
      console.warn('⚠️ Elasticsearch client not available');
      return;
    }

    try {
      // Test connection
      const health = await this.client.cluster.health();
      console.log('✅ Elasticsearch connected:', {
        cluster: health.cluster_name,
        status: health.status,
        nodes: health.number_of_nodes
      });

      // Create indices if they don't exist
      await this.createIndices();
      
      this.initialized = true;
    } catch (error) {
      console.error('❌ Elasticsearch connection error:', error.message);
      throw error;
    }
  }

  async createIndices() {
    const indices = [
      {
        name: `${this.indexPrefix}-messages`,
        body: {
          mappings: {
            properties: {
              messageId: { type: 'keyword' },
              chatId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              content: { 
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
              workspaceId: { type: 'keyword' }
            }
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                message_analyzer: {
                  type: 'standard',
                  stopwords: '_english_'
                }
              }
            }
          }
        }
      },
      {
        name: `${this.indexPrefix}-users`,
        body: {
          mappings: {
            properties: {
              userId: { type: 'keyword' },
              name: { 
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              email: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' }
            }
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0
          }
        }
      },
      {
        name: `${this.indexPrefix}-workspaces`,
        body: {
          mappings: {
            properties: {
              workspaceId: { type: 'keyword' },
              workspaceName: { 
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              createdBy: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' }
            }
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0
          }
        }
      },
      {
        name: `${this.indexPrefix}-tasks`,
        body: {
          mappings: {
            properties: {
              taskId: { type: 'keyword' },
              title: { 
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              description: { 
                type: 'text',
                analyzer: 'standard'
              },
              status: { type: 'keyword' },
              assigneeId: { type: 'keyword' },
              workspaceId: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
              dueDate: { type: 'date' }
            }
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0
          }
        }
      }
    ];

    for (const index of indices) {
      try {
        const exists = await this.client.indices.exists({ index: index.name });
        if (!exists) {
          await this.client.indices.create({
            index: index.name,
            body: index.body
          });
          console.log(`✅ Created Elasticsearch index: ${index.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to create index ${index.name}:`, error.message);
      }
    }
  }

  // Index a message
  async indexMessage(message) {
    if (!this.client || !this.initialized) {
      return; // Silently fail if Elasticsearch is not available
    }
    try {
      await this.client.index({
        index: `${this.indexPrefix}-messages`,
        id: message.messageId || message._id,
        body: {
          messageId: message.messageId || message._id,
          chatId: message.chatId || message.chat?._id,
          senderId: message.senderId || message.sender?._id,
          content: message.content,
          createdAt: message.createdAt || new Date().toISOString(),
          updatedAt: message.updatedAt || new Date().toISOString(),
          workspaceId: message.workspaceId
        }
      });
    } catch (error) {
      console.error('❌ Failed to index message:', error.message);
      throw error;
    }
  }

  // Index a user
  async indexUser(user) {
    try {
      await this.client.index({
        index: `${this.indexPrefix}-users`,
        id: user.userId || user._id,
        body: {
          userId: user.userId || user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt || new Date().toISOString(),
          updatedAt: user.updatedAt || new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('❌ Failed to index user:', error.message);
      throw error;
    }
  }

  // Index a workspace
  async indexWorkspace(workspace) {
    try {
      await this.client.index({
        index: `${this.indexPrefix}-workspaces`,
        id: workspace.workspaceId || workspace._id,
        body: {
          workspaceId: workspace.workspaceId || workspace._id,
          workspaceName: workspace.workspaceName || workspace.name,
          createdBy: workspace.createdBy,
          createdAt: workspace.createdAt || new Date().toISOString(),
          updatedAt: workspace.updatedAt || new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('❌ Failed to index workspace:', error.message);
      throw error;
    }
  }

  // Index a task
  async indexTask(task) {
    try {
      await this.client.index({
        index: `${this.indexPrefix}-tasks`,
        id: task.taskId || task._id,
        body: {
          taskId: task.taskId || task._id,
          title: task.title,
          description: task.description,
          status: task.status,
          assigneeId: task.assigneeId || task.assignee?._id,
          workspaceId: task.workspaceId || task.workspace?._id,
          createdAt: task.createdAt || new Date().toISOString(),
          updatedAt: task.updatedAt || new Date().toISOString(),
          dueDate: task.dueDate
        }
      });
    } catch (error) {
      console.error('❌ Failed to index task:', error.message);
      throw error;
    }
  }

  // Search messages
  async searchMessages(query, options = {}) {
    if (!this.client || !this.initialized) {
      throw new Error('Elasticsearch not initialized');
    }
    try {
      const {
        chatId,
        workspaceId,
        senderId,
        from = 0,
        size = 20,
        sort = [{ createdAt: { order: 'desc' } }]
      } = options;

      const must = [];
      
      if (query) {
        must.push({
          multi_match: {
            query,
            fields: ['content'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        });
      }

      if (chatId) {
        must.push({ term: { chatId } });
      }

      if (workspaceId) {
        must.push({ term: { workspaceId } });
      }

      if (senderId) {
        must.push({ term: { senderId } });
      }

      const body = {
        query: {
          bool: {
            must: must.length > 0 ? must : { match_all: {} }
          }
        },
        from,
        size,
        sort
      };

      const result = await this.client.search({
        index: `${this.indexPrefix}-messages`,
        body
      });

      return {
        hits: result.body.hits.hits.map(hit => ({
          ...hit._source,
          score: hit._score
        })),
        total: result.body.hits.total.value,
        took: result.body.took
      };
    } catch (error) {
      console.error('❌ Search messages error:', error.message);
      throw error;
    }
  }

  // Search users
  async searchUsers(query, options = {}) {
    try {
      const { from = 0, size = 20 } = options;

      const body = {
        query: {
          multi_match: {
            query,
            fields: ['name^2', 'email'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        },
        from,
        size
      };

      const result = await this.client.search({
        index: `${this.indexPrefix}-users`,
        body
      });

      return {
        hits: result.body.hits.hits.map(hit => ({
          ...hit._source,
          score: hit._score
        })),
        total: result.body.hits.total.value,
        took: result.body.took
      };
    } catch (error) {
      console.error('❌ Search users error:', error.message);
      throw error;
    }
  }

  // Search workspaces
  async searchWorkspaces(query, options = {}) {
    try {
      const { from = 0, size = 20 } = options;

      const body = {
        query: {
          multi_match: {
            query,
            fields: ['workspaceName^2'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        },
        from,
        size
      };

      const result = await this.client.search({
        index: `${this.indexPrefix}-workspaces`,
        body
      });

      return {
        hits: result.body.hits.hits.map(hit => ({
          ...hit._source,
          score: hit._score
        })),
        total: result.body.hits.total.value,
        took: result.body.took
      };
    } catch (error) {
      console.error('❌ Search workspaces error:', error.message);
      throw error;
    }
  }

  // Search tasks
  async searchTasks(query, options = {}) {
    try {
      const {
        workspaceId,
        assigneeId,
        status,
        from = 0,
        size = 20
      } = options;

      const must = [];

      if (query) {
        must.push({
          multi_match: {
            query,
            fields: ['title^2', 'description'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        });
      }

      if (workspaceId) {
        must.push({ term: { workspaceId } });
      }

      if (assigneeId) {
        must.push({ term: { assigneeId } });
      }

      if (status) {
        must.push({ term: { status } });
      }

      const body = {
        query: {
          bool: {
            must: must.length > 0 ? must : { match_all: {} }
          }
        },
        from,
        size,
        sort: [{ updatedAt: { order: 'desc' } }]
      };

      const result = await this.client.search({
        index: `${this.indexPrefix}-tasks`,
        body
      });

      return {
        hits: result.body.hits.hits.map(hit => ({
          ...hit._source,
          score: hit._score
        })),
        total: result.body.hits.total.value,
        took: result.body.took
      };
    } catch (error) {
      console.error('❌ Search tasks error:', error.message);
      throw error;
    }
  }

  // Delete document
  async deleteDocument(index, id) {
    try {
      await this.client.delete({
        index: `${this.indexPrefix}-${index}`,
        id
      });
    } catch (error) {
      if (error.meta?.statusCode !== 404) {
        console.error(`❌ Failed to delete document from ${index}:`, error.message);
        throw error;
      }
    }
  }

  // Update document
  async updateDocument(index, id, doc) {
    try {
      await this.client.update({
        index: `${this.indexPrefix}-${index}`,
        id,
        body: {
          doc: {
            ...doc,
            updatedAt: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      console.error(`❌ Failed to update document in ${index}:`, error.message);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const health = await this.client.cluster.health();
      return {
        status: health.status,
        cluster: health.cluster_name,
        nodes: health.number_of_nodes
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

// Singleton instance
let instance = null;

function getElasticsearchService() {
  if (!instance) {
    instance = new ElasticsearchService();
  }
  return instance;
}

module.exports = getElasticsearchService();

