const mongoose = require("mongoose");
const mysql = require('mysql2/promise');
require('dotenv').config();

const Connection = async (username, password) => {
    console.log('Environment check:');
    console.log('DB_USERNAME exists:', !!process.env.DB_USERNAME);
    console.log('DB_PASSWORD exists:', !!process.env.DB_PASSWORD);
    console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
    
    const URL = process.env.MONGODB_URI;
    
    // Log the connection URL (with masked password)
    const maskedURL = URL.replace(/:([^@]+)@/, ':****@');
    console.log('Attempting to connect with URL:', maskedURL);

    try {
        await mongoose.connect(URL, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 60000,
            maxPoolSize: 10
        });
        console.log('✅ Database Connected Successfully to MongoDB Atlas');
    } catch (error) {
        console.error('❌ Database Connection Error:', error.message);
        throw error;
    }
};

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const connectDB = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('MySQL Connected Successfully');
  } catch (error) {
    console.error('Error connecting to MySQL:', error);
    process.exit(1);
  }
};

module.exports = { Connection, connectDB, pool };