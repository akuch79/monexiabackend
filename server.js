import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createServer } from "net";

import mpesaRoutes       from "./routes/mpesa.js";
import authRoutes        from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js";
import userRoutes        from "./routes/users.js";   // ✅ was missing

dotenv.config();

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: "*",                                        // ✅ allow all origins (tighten in production)
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.use("/api/mpesa",        mpesaRoutes);
app.use("/api/auth",         authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users",        userRoutes);             // ✅ was missing

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => res.send("Monexia Backend Running 🚀"));

// ── 404 handler — catches any unknown route ──────────────────
app.use((req, res) => {                               // ✅ new — shows exactly what's missing
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// ── MongoDB connection with auto-reconnect ───────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5003,                 // ✅ clean number
    });
    console.log("MongoDB connected ✅");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    console.log("Retrying in 5 seconds...");
    setTimeout(connectDB, 5003);
  }
};

connectDB();

// ── Port management ──────────────────────────────────────────
const PORT = process.env.PORT || 5003;               // ✅ back to 5003

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const tester = createServer()
      .once("error", () => resolve(true))
      .once("listening", () => { tester.close(); resolve(false); })
      .listen(port);
  });

const startServer = async () => {
  const inUse = await isPortInUse(PORT);
  if (inUse) {
    const fallback = Number(PORT) + 1;
    console.warn(`⚠️  Port ${PORT} in use — switching to ${fallback}`);
    app.listen(fallback, () => console.log(`Server running on port ${fallback} 🚀`));
  } else {
    app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
  }
};

startServer();