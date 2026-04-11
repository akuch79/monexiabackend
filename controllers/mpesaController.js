import axios from 'axios';
import base64 from 'base-64';
import moment from 'moment';

export const stkPush = async (req, res) => {
  const { phone, amount, description } = req.body;

  try {
    // 1️⃣ Generate OAuth Token
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const auth = base64.encode(`${consumerKey}:${consumerSecret}`);

    const tokenRes = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${auth}` }
    });

    const accessToken = tokenRes.data.access_token;

    // 2️⃣ Prepare STK Push request
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const password = base64.encode(shortcode + passkey + timestamp);

    const stkRes = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: 'https://your-server.com/api/mpesa/callback',
        AccountReference: 'Monexia',
        TransactionDesc: description
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    res.json(stkRes.data);
  } catch (err) {
    console.error('M-Pesa STK Push Error:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: 'M-Pesa payment failed' });
  }
};