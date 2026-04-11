import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import mpesaRoutes from "./routes/mpesa.js";
import authRoutes from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js"; // ✅ Added

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes); // ✅ Added

app.get("/", (req, res) => res.send("Monexia Backend Running 🚀"));

// MongoDB connection with auto-reconnect
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5002});
    console.log("MongoDB connected ✅");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    console.log("Retrying in 5 seconds...");
    setTimeout(connectDB, 5002);
  }
};

connectDB();

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));