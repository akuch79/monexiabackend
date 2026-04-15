import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import twilio from "twilio";

// ── Email transporter ────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Twilio client ────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── Register ─────────────────────────────────────────────────
export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email, password: hashedPassword });

    await Wallet.create({ user: newUser._id, balance: 0 });

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.status(201).json({ user: newUser, token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Login ─────────────────────────────────────────────────────
export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.status(200).json({ user, token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Get Me ────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  res.status(200).json(req.user);
};

// ── Forgot Password ───────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  const { email, phoneNumber } = req.body;
  try {
    if (!email && !phoneNumber)
      return res.status(400).json({ message: "Email or phone number is required" });

    const user = email
      ? await User.findOne({ email: email.toLowerCase().trim() })
      : await User.findOne({ phoneNumber });

    if (!user)
      return res.json({ message: "If that account exists, a reset link was sent." });

    const resetToken      = crypto.randomBytes(32).toString("hex");
    user.resetToken       = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    if (email) {
      await transporter.sendMail({
        from:    `"Monexia" <${process.env.EMAIL_USER}>`,
        to:      user.email,
        subject: "Reset Your Monexia Password",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;
                      background:#0a0f0d;color:#f8fafc;border-radius:16px;">
            <h2 style="color:#10b981;">Reset Your Password</h2>
            <p style="color:#94a3b8;">
              Click below to reset your password. Expires in <strong style="color:#f8fafc;">1 hour</strong>.
            </p>
            <a href="${resetLink}"
               style="display:inline-block;margin-top:1rem;background:#10b981;
                      color:#064e3b;padding:14px 32px;border-radius:10px;
                      text-decoration:none;font-weight:700;">
              Reset Password
            </a>
            <p style="margin-top:2rem;color:#64748b;font-size:0.8rem;">
              Didn't request this? Ignore this email safely.
            </p>
          </div>
        `,
      });
      return res.json({ message: "Reset link sent to your email!" });
    }

    if (phoneNumber) {
      await twilioClient.messages.create({
        body: `Monexia: Reset your password → ${resetLink} (expires in 1 hour)`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to:   phoneNumber,
      });
      return res.json({ message: "Reset link sent to your phone!" });
    }

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ── Reset Password ────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  const { token }    = req.params;
  const { password } = req.body;
  try {
    if (!password)
      return res.status(400).json({ message: "New password is required" });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const user = await User.findOne({
      resetToken:       token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: "Invalid or expired reset token" });

    user.password         = await bcrypt.hash(password, 10);
    user.resetToken       = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.json({
      message: "Password reset successfully!",
      token:   authToken,
      name:    user.name,
      email:   user.email,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: error.message });
  }
};