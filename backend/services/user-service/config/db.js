const mongoose = require("mongoose");

const Connection = async () => {
    console.log('Environment check:');
    console.log('DB_USERNAME exists:', !!process.env.DB_USERNAME);
    console.log('DB_PASSWORD exists:', !!process.env.DB_PASSWORD);
    console.log('MONGODB_URI exists:', !!process.env.MONGO_URI);
    

    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not defined in environment variables');
    }
    if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
        throw new Error('DB_USERNAME or DB_PASSWORD is not defined in environment variables');
    }
    

    const mongoURI = process.env.MONGO_URI
        .replace("<username>", process.env.DB_USERNAME)
        .replace("<password>", process.env.DB_PASSWORD);

    // Log the connection URL (with masked password)
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

