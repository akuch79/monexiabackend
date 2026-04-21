import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { sendTransactionAlert } from '../utils/mailer.js';

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

// ── M-Pesa access token ──────────────────────────────────────
const getAccessToken = async () => {
  const creds = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const { data } = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  );
  return data.access_token;
};

// ── STK Push ─────────────────────────────────────────────────
router.post('/stkpush', auth, async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone || !amount)
    return res.status(400).json({ error: 'Phone and amount required' });

  try {
    const token     = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const password  = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            amount,
        PartyA:            phone,
        PartyB:            process.env.MPESA_SHORTCODE,
        PhoneNumber:       phone,
        CallBackURL:       `${process.env.SERVER_URL}/api/mpesa/callback`,
        AccountReference:  'Monexia',
        TransactionDesc:   'Payment',
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    await Transaction.create({
      user:        req.user.id,
      phone,
      amount:      Number(amount),
      type:        'debit',
      description: 'M-Pesa Payment',
      category:    'M-Pesa',
      status:      'Pending',
    });

    res.json(response.data);

  } catch (err) {
    console.error('STK Push error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── M-Pesa Callback ──────────────────────────────────────────
router.post('/callback', async (req, res) => {
  try {
    console.log('📱 M-Pesa Callback received:', JSON.stringify(req.body, null, 2));

    const body         = req.body?.Body?.stkCallback;
    const resultCode   = body?.ResultCode;
    const metadata     = body?.CallbackMetadata?.Item || [];

    if (resultCode === 0) {
      // Payment successful
      const getValue = (name) => metadata.find((i) => i.Name === name)?.Value;

      const amount      = getValue('Amount');
      const mpesaCode   = getValue('MpesaReceiptNumber');
      const phone       = String(getValue('PhoneNumber'));

      // Update the pending transaction
      const transaction = await Transaction.findOneAndUpdate(
        { phone, status: 'Pending' },
        { status: 'Completed', description: `M-Pesa ${mpesaCode}` },
        { new: true, sort: { createdAt: -1 } }
      );

      console.log(`✅ M-Pesa payment confirmed: ${mpesaCode} — KES ${amount}`);

      // ── Send transaction alert email (non-fatal) ──────────
      if (transaction) {
        try {
          const user = await User.findById(transaction.user).select('email');
          if (user?.email) {
            const allTx  = await Transaction.find({ user: transaction.user });
            const balance = allTx.reduce((sum, tx) => {
              return tx.type === 'credit' ? sum + tx.amount : sum - tx.amount;
            }, 0);

            await sendTransactionAlert(user.email, {
              type:    'M-Pesa Payment',
              amount:  Number(amount).toLocaleString(),
              balance: balance.toLocaleString(),
            });
          }
        } catch (emailErr) {
          console.error('⚠️  M-Pesa alert email failed (non-fatal):', emailErr.message);
        }
      }

    } else {
      console.warn('⚠️  M-Pesa payment failed. ResultCode:', resultCode);
      await Transaction.findOneAndUpdate(
        { status: 'Pending' },
        { status: 'Failed' },
        { sort: { createdAt: -1 } }
      );
    }

    res.sendStatus(200);

  } catch (err) {
    console.error('Callback error:', err.message);
    res.sendStatus(200); // Always 200 to M-Pesa
  }
});

// GET /api/mpesa/transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({
      user:     req.user.id,
      category: 'M-Pesa',
    }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;