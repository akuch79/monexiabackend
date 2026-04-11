// src/config/connectDB.js
import mongoose from "mongoose";

let retries = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5004; // 5 seconds

const connectDB = async () => {
  try {
    const mongoURI =
      process.env.MONGO_URI ||
      ""; // fallback to local DB

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🚀 Monexia Server Started");
    console.log("🌐 Environment:", process.env.NODE_ENV || "development");
    console.log("🗄️ Database:", mongoose.connection.name);
    console.log("✅ MongoDB Connected Successfully");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);

    retries++;
    if (retries <= MAX_RETRIES) {
      console.log(`🔁 Retrying in ${RETRY_DELAY / 1000}s... (${retries}/${MAX_RETRIES})`);
      setTimeout(connectDB, RETRY_DELAY);
    } else {
      console.error("🚨 Could not connect after 5 attempts. Exiting.");
      process.exit(1);
    }
  }
};

export default connectDB;