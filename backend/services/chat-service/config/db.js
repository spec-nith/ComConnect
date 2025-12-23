const mongoose = require("mongoose");

const Connection = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not defined in environment variables');
    }
    if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
        throw new Error('DB_USERNAME or DB_PASSWORD is not defined in environment variables');
    }
    
    const mongoURI = process.env.MONGO_URI
        .replace("<username>", process.env.DB_USERNAME)
        .replace("<password>", process.env.DB_PASSWORD);

    const maskedURL = mongoURI.replace(/:([^@]+)@/, ':****@');
    console.log('Attempting to connect with URL:', maskedURL);

    try {
        await mongoose.connect(mongoURI, {
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

module.exports = Connection;

