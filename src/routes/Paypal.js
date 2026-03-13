// PayPal relies on a two-step process: Create Order -> Capture Order
app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const { data } = await axios.post('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: "USD", value: req.body.amount }
      }]
    }, {
      auth: {
        username: process.env.PAYPAL_CLIENT_ID,
        password: process.env.PAYPAL_CLIENT_SECRET
      }
    });
    res.json(data); // Send the Order ID to your frontend
  } catch (err) {
    res.status(500).json({ error: "PayPal Order Creation Failed" });
  }
});

// Capture after user approves on frontend
app.post('/api/paypal/capture-order/:orderId', async (req, res) => {
  try {
    const { data } = await axios.post(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${req.params.orderId}/capture`, {}, {
      auth: {
        username: process.env.PAYPAL_CLIENT_ID,
        password: process.env.PAYPAL_CLIENT_SECRET
      }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Payment Capture Failed" });
  }
});