import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import twilio from 'twilio';
import User from '../models/User.js';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from '../utils/mailer.js';

const router = express.Router();

// ── Twilio client (lazy) ─────────────────────────────────────
let _twilioClient = null;

function getTwilioClient() {
  if (!_twilioClient) {
    _twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return _twilioClient;
}

// ── Signup ───────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const normalizedEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: normalizedEmail, password: hashedPassword });

    // ── Welcome email (non-fatal) ────────────────────────────
    try {
      await sendWelcomeEmail(normalizedEmail, name);
    } catch (emailErr) {
      console.error('⚠️  Welcome email failed (non-fatal):', emailErr.message);
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user: { id: user._id, name, email: normalizedEmail }, token });

  } catch (err) {
    console.error('Signup error:', err);
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
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber)
      return res.status(400).json({ message: 'Email or phone number is required' });

    const user = email
      ? await User.findOne({ email: email.toLowerCase().trim() })
      : await User.findOne({ phoneNumber });

    // Always 200 — prevents user enumeration
    if (!user)
      return res.json({ message: 'If that account exists, a reset link was sent.' });

    const resetToken      = crypto.randomBytes(32).toString('hex');
    user.resetToken       = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    console.log('🔗 Reset link generated:', resetLink);

    // ── Send EMAIL ───────────────────────────────────────────
    if (email) {
      try {
        await sendPasswordResetEmail(user.email, resetLink);
        console.log('✅ Reset email sent to:', user.email);
        return res.json({ message: 'Reset link sent to your email!' });
      } catch (emailError) {
        console.error('❌ Email send failed:', emailError.message);
        console.error('   Code   :', emailError.code);
        console.error('   Command:', emailError.command);
        return res.status(500).json({
          message: 'Failed to send reset email.',
          ...(process.env.NODE_ENV === 'development' && { error: emailError.message }),
        });
      }
    }

    // ── Send SMS ─────────────────────────────────────────────
    if (phoneNumber) {
      try {
        await getTwilioClient().messages.create({
          body: `Monexia: Reset your password → ${resetLink} (expires in 1 hour). Ignore if you didn't request this.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   phoneNumber,
        });
        console.log('✅ Reset SMS sent to:', phoneNumber);
        return res.json({ message: 'Reset link sent to your phone!' });
      } catch (smsError) {
        console.error('❌ SMS send failed:', smsError.message);
        return res.status(500).json({
          message: 'Failed to send reset SMS.',
          ...(process.env.NODE_ENV === 'development' && { error: smsError.message }),
        });
      }
    }

  } catch (err) {
    console.error('Forgot password error:', err);
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
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: 'Invalid or expired reset token' });

    user.password         = await bcrypt.hash(password, 10);
    user.resetToken       = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    console.log('✅ Password reset for:', user.email);

    // ── Confirmation email (non-fatal) ───────────────────────
    try {
      await sendPasswordChangedEmail(user.email);
    } catch (emailErr) {
      console.error('⚠️  Confirmation email failed (non-fatal):', emailErr.message);
    }

    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({
      message: 'Password reset successfully!',
      token:   authToken,
      name:    user.name,
      email:   user.email,
    });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;