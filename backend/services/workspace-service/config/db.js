const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const Connection = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }

  try {
    // Test the connection
    await prisma.$connect();
    console.log('✅ Database Connected Successfully to PostgreSQL');
    
    return prisma;
  } catch (error) {
    console.error('❌ Database Connection Error:', error.message);
    throw error;
  }
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = Connection;
module.exports.prisma = prisma;
