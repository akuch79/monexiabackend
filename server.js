import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createServer } from "net";

import mpesaRoutes       from "./routes/mpesa.js";
import authRoutes        from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js";
import userRoutes        from "./routes/users.js";
import { getTransporter } from "./utils/mailer.js";

const app = express();

// ── Env validation ───────────────────────────────────────────
const REQUIRED_ENV = ["MONGO_URI", "EMAIL_USER", "EMAIL_PASS"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length) {
  console.error("❌ Missing required env variables:", missingEnv.join(", "));
  process.exit(1);
}

console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS length:", process.env.EMAIL_PASS.length);

// ── Init email transporter (verifies SMTP on startup) ────────
getTransporter();

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// ── Request logger ───────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use("/api/mpesa",        mpesaRoutes);
app.use("/api/auth",         authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users",        userRoutes);

// ── Health check ─────────────────────────────────────────────
app.get("/", (_req, res) => res.json({ status: "ok", message: "Monexia Backend Running 🚀" }));

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}`, err);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] ?? "field";
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
    });
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
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
const PORT = Number(process.env.PORT) || 5003;

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const tester = createServer()
      .once("error", () => resolve(true))
      .once("listening", () => { tester.close(); resolve(false); })
      .listen(port);
  });

const startServer = async () => {
  const inUse = await isPortInUse(PORT);
  const activePort = inUse ? PORT + 1 : PORT;

  if (inUse) console.warn(`⚠️  Port ${PORT} in use — switching to ${activePort}`);

  app.listen(activePort, () =>
    console.log(`Server running on port ${activePort} 🚀`)
  );
};

startServer();