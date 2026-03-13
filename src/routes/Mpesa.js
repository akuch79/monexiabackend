const axios = require('axios');
const { z } = require('zod');

// 1. Validation Schema
const MpesaSchema = z.object({
  phoneNumber: z.string().regex(/^254\d{9}$/, "Must be in format 2547XXXXXXXX"),
  amount: z.number().min(1)
});

// 2. Token Middleware (Daraja 3.0)
const generateToken = async (req, res, next) => {
  const secret = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  try {
    const { data } = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${secret}` }
    });
    req.token = data.access_token;
    next();
  } catch (err) {
    res.status(500).json({ error: "Failed to authenticate with Safaricom" });
  }
};

// 3. STK Push Route
app.post('/api/mpesa/stk', generateToken, async (req, res) => {
  const validation = MpesaSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json(validation.error);

  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  try {
    const { data } = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: validation.data.amount,
      PartyA: validation.data.phoneNumber,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: validation.data.phoneNumber,
      CallBackURL: "https://your-domain.com/api/mpesa/callback",
      AccountReference: "StoreWallet",
      TransactionDesc: "Payment for Goods"
    }, {
      headers: { Authorization: `Bearer ${req.token}` }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || "STK Push Failed" });
  }
});