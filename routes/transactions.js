import express from 'express';
import jwt from 'jsonwebtoken';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { sendTransactionAlert } from '../utils/mailer.js';

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────
const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /api/transactions
router.get('/', protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/transactions
router.post('/', protect, async (req, res) => {
  try {
    const { description, amount, type, date, phone, category } = req.body;

    if (!description || !amount || !type)
      return res.status(400).json({ message: 'description, amount and type are required' });

    const transaction = await Transaction.create({
      user:        req.userId,
      description,
      amount:      Number(amount),
      type,
      phone:       phone || '',
      category:    category || 'General',
      date:        date || Date.now(),
    });

    // ── Transaction alert email (non-fatal) ──────────────────
    try {
      const user = await User.findById(req.userId).select('email');
      if (user?.email) {
        // Calculate running balance
        const allTx = await Transaction.find({ user: req.userId });
        const balance = allTx.reduce((sum, tx) => {
          return tx.type === 'credit' ? sum + tx.amount : sum - tx.amount;
        }, 0);

        await sendTransactionAlert(user.email, {
          type:    type.charAt(0).toUpperCase() + type.slice(1),
          amount:  Number(amount).toLocaleString(),
          balance: balance.toLocaleString(),
        });
      }
    } catch (emailErr) {
      console.error('⚠️  Transaction alert email failed (non-fatal):', emailErr.message);
    }

    res.status(201).json(transaction);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/transactions/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, user: req.userId });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    const { description, amount, type, category, phone, date } = req.body;
    if (description) transaction.description = description;
    if (amount)      transaction.amount      = Number(amount);
    if (type)        transaction.type        = type;
    if (category)    transaction.category    = category;
    if (phone)       transaction.phone       = phone;
    if (date)        transaction.date        = date;

    await transaction.save();
    res.json(transaction);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, user: req.userId });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    await transaction.deleteOne();
    res.json({ message: 'Deleted successfully' });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;