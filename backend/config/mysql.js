const mysql = require('mysql2/promise');

const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const testMySQLConnection = async () => {
  try {
    await mysqlPool.query('SELECT 1');
    console.log('✅ MySQL Database Connected Successfully');
    return true;
  } catch (error) {
    console.error('❌ MySQL Database Connection Error:', error);
    return false;
  }
};

module.exports = { mysqlPool, testMySQLConnection }; 