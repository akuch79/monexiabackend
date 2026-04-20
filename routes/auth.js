import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import User from '../models/User.js';

const router = express.Router();

// ── Email transporter (lazy — created on first use so env vars are loaded) ───
let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return _transporter;
}

// ── Twilio client (lazy — same reason) ──────────────────────────────────────
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
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber)
      return res.status(400).json({ message: 'Email or phone number is required' });

    const user = email
      ? await User.findOne({ email: email.toLowerCase().trim() })
      : await User.findOne({ phoneNumber });

    if (!user)
      return res.json({ message: 'If that account exists, a reset link was sent.' });

    const resetToken      = crypto.randomBytes(32).toString('hex');
    user.resetToken       = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    console.log('🔗 Reset link generated:', resetLink);

    // ── Send EMAIL ───────────────────────────────────────────
    if (email) {
      try {
        await getTransporter().sendMail({
          from:    `"Monexia" <${process.env.EMAIL_USER}>`,
          to:      user.email,
          subject: 'Reset Your Monexia Password',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;
                        background:#0a0f0d;color:#f8fafc;border-radius:16px;">
              <h2 style="color:#10b981;margin-bottom:0.5rem;">Reset Your Password</h2>
              <p style="color:#94a3b8;margin-bottom:1.5rem;">
                Click the button below to reset your Monexia password.
                This link expires in <strong style="color:#f8fafc;">1 hour</strong>.
              </p>
              <a href="${resetLink}"
                 style="display:inline-block;background:#10b981;color:#064e3b;
                        padding:14px 32px;border-radius:10px;text-decoration:none;
                        font-weight:700;font-size:1rem;">
                Reset Password
              </a>
              <p style="margin-top:2rem;color:#64748b;font-size:0.8rem;">
                If you didn't request this, you can safely ignore this email.
                Your password will not change.
              </p>
              <hr style="border-color:#1e293b;margin:1.5rem 0;">
              <p style="color:#475569;font-size:0.75rem;">
                Or copy this link into your browser:<br>
                <span style="color:#10b981;">${resetLink}</span>
              </p>
            </div>
          `,
        });

        console.log('✅ Reset email sent to:', user.email);
        return res.json({ message: 'Reset link sent to your email!' });

      } catch (emailError) {
        console.error('❌ Email send failed:', emailError.message);
        return res.status(500).json({
          message: 'Failed to send reset email. Please check your email config.',
        });
      }
    }

    // ── Send SMS ─────────────────────────────────────────────
    if (phoneNumber) {
      try {
        await getTwilioClient().messages.create({
          body: `Monexia: Reset your password here → ${resetLink} (expires in 1 hour). If you didn't request this, ignore this message.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   phoneNumber,
        });

        console.log('✅ Reset SMS sent to:', phoneNumber);
        return res.json({ message: 'Reset link sent to your phone!' });

      } catch (smsError) {
        console.error('❌ SMS send failed:', smsError.message);
        return res.status(500).json({
          message: 'Failed to send reset SMS. Please check your Twilio config.',
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