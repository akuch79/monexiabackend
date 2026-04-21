import express from 'express';
import jwt from 'jsonwebtoken';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

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

// GET /api/wallet/balance - Get wallet balance
router.get('/balance', protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.userId });
    const balance = transactions.reduce((sum, tx) => {
      return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
    }, 0);
    
    res.json({
      success: true,
      balance,
      currency: 'KES'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/wallet/stats - Get wallet statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.userId });
    
    const income = transactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const expenses = transactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const savings = income - expenses;
    
    const monthlyData = transactions.reduce((acc, tx) => {
      const month = new Date(tx.date).toLocaleString('default', { month: 'short' });
      if (!acc[month]) acc[month] = { income: 0, expenses: 0 };
      if (tx.type === 'income') acc[month].income += tx.amount;
      else acc[month].expenses += tx.amount;
      return acc;
    }, {});
    
    res.json({
      success: true,
      stats: {
        income,
        expenses,
        savings,
        totalTransactions: transactions.length
      },
      monthlyData
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/wallet/send - Send money to another user
router.post('/send', protect, async (req, res) => {
  try {
    const { recipientPhone, amount, description } = req.body;
    
    if (!recipientPhone || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid recipient and amount required' });
    }
    
    // Check if sender has sufficient balance
    const senderTransactions = await Transaction.find({ user: req.userId });
    const senderBalance = senderTransactions.reduce((sum, tx) => {
      return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
    }, 0);
    
    if (senderBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Find recipient by phone number
    const recipient = await User.findOne({ phoneNumber: recipientPhone });
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    
    // Create debit transaction for sender
    const debitTransaction = await Transaction.create({
      user: req.userId,
      description: description || `Sent to ${recipientPhone}`,
      amount: Number(amount),
      type: 'expense',
      category: 'Transfer',
      phone: recipientPhone,
      date: Date.now(),
    });
    
    // Create credit transaction for recipient
    await Transaction.create({
      user: recipient._id,
      description: description || `Received from ${req.userId}`,
      amount: Number(amount),
      type: 'income',
      category: 'Transfer',
      phone: req.userId,
      date: Date.now(),
    });
    
    res.json({
      success: true,
      message: 'Money sent successfully',
      transaction: debitTransaction
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/wallet/deposit - Deposit money
router.post('/deposit', protect, async (req, res) => {
  try {
    const { amount, method, reference } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount required' });
    }
    
    const transaction = await Transaction.create({
      user: req.userId,
      description: `Deposit via ${method}`,
      amount: Number(amount),
      type: 'income',
      category: 'Deposit',
      phone: reference || '',
      date: Date.now(),
    });
    
    res.json({
      success: true,
      message: 'Deposit successful',
      transaction
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/wallet/withdraw - Withdraw money
router.post('/withdraw', protect, async (req, res) => {
  try {
    const { amount, method, phoneNumber } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount required' });
    }
    
    // Check balance
    const transactions = await Transaction.find({ user: req.userId });
    const balance = transactions.reduce((sum, tx) => {
      return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
    }, 0);
    
    if (balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    const transaction = await Transaction.create({
      user: req.userId,
      description: `Withdrawal to ${method}`,
      amount: Number(amount),
      type: 'expense',
      category: 'Withdrawal',
      phone: phoneNumber || '',
      date: Date.now(),
    });
    
    res.json({
      success: true,
      message: 'Withdrawal successful',
      transaction
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/wallet/transactions - Get all wallet transactions
router.get('/transactions', protect, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    
    const transactions = await Transaction.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Transaction.countDocuments({ user: req.userId });
    
    res.json({
      success: true,
      transactions,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: skip + limit < total
      }
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/wallet/mpesa-deposit - M-Pesa deposit
router.post('/mpesa-deposit', protect, async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    
    if (!phoneNumber || !amount) {
      return res.status(400).json({ message: 'Phone number and amount required' });
    }
    
    // This would integrate with M-Pesa API
    // For now, create a pending transaction
    const transaction = await Transaction.create({
      user: req.userId,
      description: `M-Pesa Deposit from ${phoneNumber}`,
      amount: Number(amount),
      type: 'income',
      category: 'M-Pesa',
      phone: phoneNumber,
      status: 'Pending',
      date: Date.now(),
    });
    
    res.json({
      success: true,
      message: 'M-Pesa deposit initiated',
      transaction
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/wallet/exchange-rates - Get currency exchange rates
router.get('/exchange-rates', async (req, res) => {
  try {
    // Base rates (in KES)
    const rates = {
      KES: 1,
      USD: 128.5,
      SSP: 0.00077,
      EUR: 139.2,
      GBP: 162.8,
      UGX: 0.034,
      TZS: 0.051,
      RWF: 0.099,
    };
    
    res.json({
      success: true,
      base: 'KES',
      rates,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;