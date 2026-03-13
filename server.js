/* ================================================================
   StoreWallet Backend API - Node.js + Express
   ================================================================ */

require('dotenv').config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const helmet = require("helmet");
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------------------- Middleware ---------------------- */

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------------- Database Connection ---------------------- */

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/storewallet")
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

/* ---------------------- Schemas ---------------------- */

const UserSchema = new mongoose.Schema({
  fullName:    { type: String, required: true },
  email:       { type: String, unique: true, required: true },
  password:    { type: String, required: true },
  phoneNumber: { type: String, unique: true },
}, { timestamps: true });

const WalletSchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  balance:        { type: Number, default: 0 },
  totalDeposited: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  transactions: [{
    kind:   String,
    type:   String,
    name:   String,
    ref:    { type: String },
    amount: Number,
    time:   String
  }]
});

const User   = mongoose.model("User",   UserSchema);
const Wallet = mongoose.model("Wallet", WalletSchema);

/* ---------------------- Helpers ---------------------- */

const nowTime = () => new Date().toLocaleString("en-KE");

/* ================================================================
   AUTH ROUTES
   ================================================================ */

// ── REGISTER ──────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password } = req.body;

    // 1. Validate required fields
    if (!fullName || !email || !phoneNumber || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // 2. Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    // 3. Check if phone already exists
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(409).json({ error: "Phone number is already registered" });
    }

    // 4. Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5. Create user
    const newUser = await User.create({
      fullName,
      email,
      phoneNumber,
      password: hashedPassword
    });

    // 6. Create wallet for the new user
    await Wallet.create({ userId: newUser._id });

    res.status(201).json({ message: "Account created successfully" });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ── LOGIN ──────────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate fields
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // 2. Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // 3. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // 4. Return safe user data (never return password)
    res.status(200).json({
      message: "Login successful",
      user: {
        id:          user._id,
        fullName:    user.fullName,
        email:       user.email,
        phoneNumber: user.phoneNumber
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

/* ================================================================
   WALLET ROUTES
   ================================================================ */

// ── GET WALLET ─────────────────────────────────────────────────────
app.get("/api/wallet/:userId", async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.params.userId });
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================================================================
   START SERVER
   ================================================================ */

app.listen(PORT, () => {
  console.log(`🚀 StoreWallet API running on http://localhost:${PORT}`);
});