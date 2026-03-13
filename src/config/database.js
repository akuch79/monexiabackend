const mongoose = require('mongoose');

const connectDB = async () => {
  // Event listeners for real-time status
  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB Event: Connected successfully');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Event: Error!', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB Event: Disconnected');
  });

  try {
    console.log('⏳ Attempting to connect to MongoDB...');
    
    // Check if we already have a connection
    if (mongoose.connection.readyState === 1) {
      console.log('✅ MongoDB is already connected.');
      return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    
  } catch (error) {
    console.error("❌ Initial Connection Failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;