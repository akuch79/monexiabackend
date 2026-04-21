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
import walletRoutes from "./routes/wallet.js"; // ✅ Added wallet routes
import { getTransporter } from "./utils/mailer.js";

const app = express();

// ── Env validation ───────────────────────────────────────────
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length) {
  console.error("❌ Missing required env variables:", missingEnv.join(", "));
  if (missingEnv.includes("MONGO_URI")) {
    console.error("⚠️  MongoDB connection will fail without MONGO_URI");
  }
  if (missingEnv.includes("JWT_SECRET")) {
    console.error("⚠️  JWT authentication will fail without JWT_SECRET");
  }
}

// Optional env warnings
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("⚠️  Email notifications disabled - missing EMAIL_USER or EMAIL_PASS");
}

console.log("📧 Email configured:", process.env.EMAIL_USER ? "✅" : "❌");
console.log("🔐 JWT Secret:", process.env.JWT_SECRET ? "✅" : "❌");
console.log("💳 M-Pesa:", process.env.MPESA_CONSUMER_KEY ? "✅" : "❌");

// ── Init email transporter (verifies SMTP on startup) ────────
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  try {
    getTransporter();
    console.log("✅ Email transporter initialized successfully");
  } catch (error) {
    console.error("❌ Email transporter initialization failed:", error.message);
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
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallet", walletRoutes); // ✅ Wallet routes added

// ── Health check ─────────────────────────────────────────────
app.get("/", (_req, res) => res.json({
  status: "ok",
  message: "Monexia Backend Running 🚀",
  version: "1.0.0",
  timestamp: new Date().toISOString(),
  services: {
    email: process.env.EMAIL_USER ? "configured ✅" : "missing ❌",
    database: mongoose.connection.readyState === 1 ? "connected ✅" : "disconnected ❌",
    mpesa: process.env.MPESA_CONSUMER_KEY ? "configured ✅" : "missing ❌",
    wallet: "enabled ✅",
  },
}));

// Detailed health check endpoint
app.get("/health", (_req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const health = {
    status: dbStatus === 1 ? "healthy" : "unhealthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus === 1 ? "up" : "down",
      api: "up",
    },
  };
  res.status(dbStatus === 1 ? 200 : 503).json(health);
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

  // Mongoose validation error
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] ?? "field";
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}. Please use a different value.`,
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Authentication token has expired",
    });
  }

  // Default error
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
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI environment variable is not defined");
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    
    console.log("✅ MongoDB connected successfully");
    
    // Handle connection events
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected");
    });

  } catch (err) {
    console.error(`❌ MongoDB connection attempt ${retryCount + 1} failed:`, err.message);
    
    const isWhitelist = err.message.includes("security-whitelist") ||
                        err.message.includes("IP") ||
                        err.message.includes("whitelist");

    if (isWhitelist) {
      console.error("❌ MongoDB Atlas IP whitelist issue detected!");
      console.error("   Please add your IP address to MongoDB Atlas Network Access:");
      console.error("   1. Go to https://cloud.mongodb.com");
      console.error("   2. Navigate to Network Access");
      console.error("   3. Add IP address 0.0.0.0/0 (for development) or your specific IP");
      console.error("   4. Wait a few minutes for changes to propagate");
    }

    if (retryCount < MAX_RETRIES) {
      console.log(`🔄 Retrying connection in ${RETRY_DELAY / 1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      setTimeout(() => connectDB(retryCount + 1), RETRY_DELAY);
    } else {
      console.error("❌ Failed to connect to MongoDB after maximum retries");
      console.error("   Please check your MONGO_URI and network settings");
      process.exit(1);
    }
  }
};

// Start database connection
connectDB();

// ── Port management with conflict resolution ──────────────────
const PORT = Number(process.env.PORT) || 5003;

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const tester = createServer()
      .once("error", (err) => {
        if (err.code === "EADDRINUSE") resolve(true);
        else resolve(false);
      })
      .once("listening", () => {
        tester.close();
        resolve(false);
      })
      .listen(port);
  });

const startServer = async () => {
  try {
    const inUse = await isPortInUse(PORT);
    let activePort = PORT;

    if (inUse) {
      console.warn(`⚠️  Port ${PORT} is in use`);
      activePort = PORT + 1;
      console.log(`🔄 Attempting to use port ${activePort} instead`);
      
      // Check if the alternative port is also in use
      const altInUse = await isPortInUse(activePort);
      if (altInUse) {
        console.error(`❌ Port ${activePort} is also in use`);
        console.error("   Please free up a port or change the PORT environment variable");
        process.exit(1);
      }
    }

    const server = app.listen(activePort, () => {
      console.log(`🚀 Server running on port ${activePort}`);
      console.log(`📡 API URL: http://localhost:${activePort}`);
      console.log(`❤️  Health check: http://localhost:${activePort}/health`);
      console.log(`👛 Wallet API: http://localhost:${activePort}/api/wallet`);
    });

    server.on("error", (err) => {
      console.error("❌ Server error:", err);
      process.exit(1);
    });

  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

// Start the server only after DB connection is established
mongoose.connection.once("connected", () => {
  console.log("🎉 Database ready, starting server...");
  startServer();
});

// If DB connection fails, don't start server
mongoose.connection.on("error", (err) => {
  console.error("❌ Database connection failed. Server not started.");
  if (process.env.NODE_ENV === "development") {
    console.error("   Please check your MongoDB connection string and network settings");
  }
});

// ── Graceful shutdown ────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    await mongoose.connection.close();
    console.log("✅ MongoDB connection closed");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during graceful shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  gracefulShutdown("Uncaught Exception");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("Unhandled Rejection");
});

export default app;