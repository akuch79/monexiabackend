import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createServer } from "net";

import mpesaRoutes from "./routes/mpesa.js";
import authRoutes from "./routes/auth.js";
import transactionRoutes from "./routes/transactions.js";
import userRoutes from "./routes/users.js";
import walletRoutes from "./routes/wallet.js";
import { getTransporter } from "./utils/mailer.js";

const app = express();

// ── Env validation ───────────────────────────────────────────
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const OPTIONAL_ENV = {
  email:  ["EMAIL_USER", "EMAIL_PASS"],
  mpesa:  ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY", "MPESA_SHORT_CODE", "MPESA_CALLBACK_URL"],
};

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error("❌ Missing required env variables:", missingEnv.join(", "));
  if (missingEnv.includes("MONGO_URI"))  console.error("⚠️  MongoDB connection will fail without MONGO_URI");
  if (missingEnv.includes("JWT_SECRET")) console.error("⚠️  JWT authentication will fail without JWT_SECRET");
}

// M-Pesa specific validation
const missingMpesa = OPTIONAL_ENV.mpesa.filter((key) => !process.env[key]);
if (missingMpesa.length) {
  console.warn("⚠️  M-Pesa partially configured. Missing:", missingMpesa.join(", "));
  if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET) {
    console.warn("   ↳ STK Push, C2B, B2C will fail without CONSUMER_KEY + CONSUMER_SECRET");
  }
  if (!process.env.MPESA_PASSKEY || !process.env.MPESA_SHORT_CODE) {
    console.warn("   ↳ STK Push will fail without PASSKEY + SHORT_CODE");
  }
  if (!process.env.MPESA_CALLBACK_URL && !process.env.BACKEND_URL) {
    console.warn("   ↳ Safaricom callbacks won't reach your server without MPESA_CALLBACK_URL or BACKEND_URL");
  }
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("⚠️  Email notifications disabled — missing EMAIL_USER or EMAIL_PASS");
}

// Startup summary
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Monexia Backend — Service Status");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("📧 Email:        ", process.env.EMAIL_USER ? "✅ configured" : "❌ missing");
console.log("🔐 JWT Secret:   ", process.env.JWT_SECRET ? "✅ configured" : "❌ missing");
console.log("💳 M-Pesa Key:   ", process.env.MPESA_CONSUMER_KEY ? "✅ configured" : "❌ missing");
console.log("💳 M-Pesa Secret:", process.env.MPESA_CONSUMER_SECRET ? "✅ configured" : "❌ missing");
console.log("🔑 M-Pesa Passkey:", process.env.MPESA_PASSKEY ? "✅ configured" : "⚠️  missing (STK Push)");
console.log("📟 Short Code:   ", process.env.MPESA_SHORT_CODE ? "✅ " + process.env.MPESA_SHORT_CODE : "⚠️  using sandbox default 174379");
console.log("🌍 Environment:  ", process.env.MPESA_ENV === "production" ? "🔴 PRODUCTION" : "🟡 sandbox");
console.log("📡 Callback URL: ", process.env.MPESA_CALLBACK_URL || process.env.BACKEND_URL || "❌ not set");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// ── Init email transporter ───────────────────────────────────
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  try {
    getTransporter();
    console.log("✅ Email transporter initialized");
  } catch (error) {
    console.error("❌ Email transporter failed:", error.message);
  }
} else {
  console.warn("⚠️  Email transporter skipped — EMAIL_USER or EMAIL_PASS missing.");
}

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/wallet",       walletRoutes);

// ── Root health check ────────────────────────────────────────
app.get("/", (_req, res) => res.json({
  status: "ok",
  message: "Monexia Backend Running 🚀",
  version: "1.0.0",
  timestamp: new Date().toISOString(),
  services: {
    email:    process.env.EMAIL_USER ? "configured ✅" : "missing ❌",
    database: mongoose.connection.readyState === 1 ? "connected ✅" : "disconnected ❌",
    mpesa:    process.env.MPESA_CONSUMER_KEY ? "configured ✅" : "missing ❌",
    wallet:   "enabled ✅",
  },
}));

// ── Detailed health check ─────────────────────────────────────
app.get("/health", (_req, res) => {
  const dbState = mongoose.connection.readyState; // 0=disconnected 1=connected 2=connecting 3=disconnecting
  const dbStateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

  const mpesaConfigured = !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET);
  const mpesaStkReady   = mpesaConfigured && !!(process.env.MPESA_PASSKEY && process.env.MPESA_SHORT_CODE);
  const mpesaB2cReady   = mpesaConfigured && !!(process.env.MPESA_B2C_SECURITY_CREDENTIAL);
  const callbackSet     = !!(process.env.MPESA_CALLBACK_URL || process.env.BACKEND_URL);

  const isHealthy = dbState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status:    isHealthy ? "healthy" : "unhealthy",
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || "development",
    services: {
      database: {
        status: dbStateMap[dbState] || "unknown",
        healthy: dbState === 1,
      },
      api: { status: "up", healthy: true },
      email: {
        status:  process.env.EMAIL_USER ? "configured" : "missing",
        healthy: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
      },
      mpesa: {
        env:          process.env.MPESA_ENV || "sandbox",
        credentials:  mpesaConfigured  ? "ok"      : "missing",
        stk_push:     mpesaStkReady     ? "ready"   : "incomplete",
        b2c:          mpesaB2cReady     ? "ready"   : "incomplete — missing MPESA_B2C_SECURITY_CREDENTIAL",
        callback_url: callbackSet       ? "set"     : "⚠️ not configured",
        healthy:      mpesaConfigured,
      },
      wallet: { status: "enabled", healthy: true },
    },
  });
});

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
    return res.status(409).json({ success: false, message: `Duplicate value for ${field}.` });
  }
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ success: false, message: "Invalid authentication token" });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Authentication token has expired" });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ── MongoDB connection with retry logic ───────────────────────
const connectDB = async (retryCount = 0) => {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 5000;

  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI environment variable is not defined");

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });

    console.log("✅ MongoDB connected successfully");

    mongoose.connection.on("error",       (err) => console.error("❌ MongoDB error:", err));
    mongoose.connection.on("disconnected", ()   => console.warn("⚠️  MongoDB disconnected"));
    mongoose.connection.on("reconnected",  ()   => console.log("✅ MongoDB reconnected"));

  } catch (err) {
    console.error(`❌ MongoDB attempt ${retryCount + 1} failed:`, err.message);

    const isWhitelist = ["security-whitelist", "IP", "whitelist"].some((s) => err.message.includes(s));
    if (isWhitelist) {
      console.error("❌ MongoDB Atlas IP whitelist issue — add your IP at https://cloud.mongodb.com → Network Access");
    }

    if (retryCount < MAX_RETRIES) {
      console.log(`🔄 Retrying in ${RETRY_DELAY / 1000}s... (${retryCount + 1}/${MAX_RETRIES})`);
      setTimeout(() => connectDB(retryCount + 1), RETRY_DELAY);
    } else {
      console.error("❌ Max retries reached. Exiting.");
      process.exit(1);
    }
  }
};

connectDB();

// ── Port management ───────────────────────────────────────────
const PORT = Number(process.env.PORT) || 5003;

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const tester = createServer()
      .once("error",     (err) => resolve(err.code === "EADDRINUSE"))
      .once("listening", ()    => { tester.close(); resolve(false); })
      .listen(port);
  });

const startServer = async () => {
  try {
    const inUse = await isPortInUse(PORT);
    let activePort = PORT;

    if (inUse) {
      console.warn(`⚠️  Port ${PORT} in use`);
      activePort = PORT + 1;
      const altInUse = await isPortInUse(activePort);
      if (altInUse) {
        console.error(`❌ Port ${activePort} also in use. Set a different PORT in .env`);
        process.exit(1);
      }
    }

    const server = app.listen(activePort, () => {
      console.log(`\n🚀 Server running on port ${activePort}`);
      console.log(`📡 API:          http://localhost:${activePort}`);
      console.log(`❤️  Health:       http://localhost:${activePort}/health`);
      console.log(`💳 M-Pesa API:   http://localhost:${activePort}/api/mpesa`);
      console.log(`👛 Wallet API:   http://localhost:${activePort}/api/wallet\n`);
    });

    server.on("error", (err) => { console.error("❌ Server error:", err); process.exit(1); });

  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

mongoose.connection.once("connected", () => {
  console.log("🎉 Database ready — starting server...");
  startServer();
});

mongoose.connection.on("error", () => {
  console.error("❌ Database failed. Server not started.");
});

// ── Graceful shutdown ─────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  try {
    await mongoose.connection.close();
    console.log("✅ MongoDB closed");
    process.exit(0);
  } catch (err) {
    console.error("❌ Shutdown error:", err);
    process.exit(1);
  }
};

process.on("SIGTERM",            () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",             () => gracefulShutdown("SIGINT"));
process.on("uncaughtException",  (err) => { console.error("❌ Uncaught Exception:", err); gracefulShutdown("uncaughtException"); });
process.on("unhandledRejection", (reason) => { console.error("❌ Unhandled Rejection:", reason); gracefulShutdown("unhandledRejection"); });

export default app;