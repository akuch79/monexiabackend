import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';                          // ✅ added
import User from '../models/User.js';

const router = express.Router();

// ── Signup ───────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: normalizedEmail, password: hashedPassword });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user: { id: user._id, name, email: normalizedEmail }, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, name: user.name, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ── Forgot Password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link was sent.' });

    // Generate reset token
    const resetToken      = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000;    // 1 hour from now

    user.resetToken       = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // ✅ In production replace this with nodemailer/sendgrid email
    console.log('Reset link:', resetLink);

    res.json({
      message:   'Reset link generated.',
      resetLink,                                      // ✅ returned so frontend can redirect
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Reset Password ───────────────────────────────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token }    = req.params;
    const { password } = req.body;

    if (!password)
      return res.status(400).json({ message: 'New password is required' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const user = await User.findOne({
      resetToken:       token,
      resetTokenExpiry: { $gt: Date.now() },          // token not expired
    });

    if (!user)
      return res.status(400).json({ message: 'Invalid or expired reset token' });

    // Hash new password before saving
    user.password         = await bcrypt.hash(password, 10); // ✅ manually hash
    user.resetToken       = undefined;                // ✅ clear token
    user.resetTokenExpiry = undefined;
    await user.save();

    // ✅ Auto-login after reset — return a fresh token
    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({
      message: 'Password reset successfully',
      token:   authToken,                             // ✅ frontend can auto-login
      name:    user.name,
      email:   user.email,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;