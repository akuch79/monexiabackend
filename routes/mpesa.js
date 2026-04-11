import express from 'express';
import axios from 'axios';
import auth from '../middleware/auth.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

const getAccessToken = async () => {
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  );
  return data.access_token;
};

// STK Push
router.post('/stkpush', auth, async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone || !amount) return res.status(400).json({ error: 'Phone and amount required' });

  try {
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: `${process.env.SERVER_URL}/api/mpesa/callback`,
        AccountReference: 'Monexia',
        TransactionDesc: 'Payment'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Save transaction
    await Transaction.create({
      user: req.user.id,
      phone,
      amount,
      status: 'Pending'
    });

    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Get all transactions for a user
router.get('/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Callback
router.post('/callback', (req, res) => {
  console.log('📱 M-Pesa Callback:', req.body);
  res.sendStatus(200);
});
export default router;