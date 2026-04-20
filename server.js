import dotenv from "dotenv";
dotenv.config(); // ✅ MUST be first

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createServer } from "net";

import mpesaRoutes       from "./routes/mpesa.js";
import authRoutes        from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js";
import userRoutes        from "./routes/users.js";

const app = express();

// ✅ DEBUG (to confirm env is working)
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "Loaded ✅" : "Missing ❌");

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.use("/api/mpesa",        mpesaRoutes);
app.use("/api/auth",         authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users",        userRoutes);

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => res.send("Monexia Backend Running 🚀"));

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// ── MongoDB connection ───────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected ✅");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    console.log("Retrying in 5 seconds...");
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// ── Port management ──────────────────────────────────────────
const PORT = process.env.PORT || 5003;

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const tester = createServer()
      .once("error", () => resolve(true))
      .once("listening", () => {
        tester.close();
        resolve(false);
      })
      .listen(port);
  });

const startServer = async () => {
  const inUse = await isPortInUse(PORT);
  if (inUse) {
    const fallback = Number(PORT) + 1;
    console.warn(`⚠️ Port ${PORT} in use — switching to ${fallback}`);
    app.listen(fallback, () =>
      console.log(`Server running on port ${fallback} 🚀`)
    );
  } else {
    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT} 🚀`)
    );
  }
};

startServer();