import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createServer } from "net";

import mpesaRoutes from "./routes/mpesa.js";
import authRoutes from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);

app.get("/", (req, res) => res.send("Monexia Backend Running 🚀"));

// MongoDB connection with auto-reconnect
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5004});
    console.log("MongoDB connected ✅");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    console.log("Retrying in 5 seconds...");
    setTimeout(connectDB, 5004);
  }
};

connectDB();

// ✅ Permanent fix: check if port is in use before starting
const PORT = process.env.PORT || 5004;

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const tester = createServer()
      .once("error", () => resolve(true))   // port is busy
      .once("listening", () => {
        tester.close();
        resolve(false);                      // port is free
      })
      .listen(port);
  });

const startServer = async () => {
  const inUse = await isPortInUse(PORT);

  if (inUse) {
    console.warn(`⚠️  Port ${PORT} is in use. Trying port ${Number(PORT) + 1}...`);
    const fallback = Number(PORT) + 1;
    app.listen(fallback, () =>
      console.log(`Server running on fallback port ${fallback} 🚀`)
    );
  } else {
    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT} 🚀`)
    );
  }
};

startServer();