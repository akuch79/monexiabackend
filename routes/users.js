import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /api/users/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/me
router.put('/me', auth, async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name)  user.name  = name.trim();
    if (email) user.email = email.toLowerCase().trim();

    if (currentPassword && newPassword) {
      if (newPassword.length < 6)
        return res.status(400).json({ message: 'New password must be at least 6 characters' });

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch)
        return res.status(400).json({ message: 'Current password is incorrect' });

      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json({ message: 'Profile updated successfully' });

  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;