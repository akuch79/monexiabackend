/* ================================================================
   StoreWallet Backend API
   Node.js + Express
   ================================================================ */

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = 5000;

/* ---------------------- Middleware ---------------------- */

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ---------------------- Wallet State ---------------------- */

let wallet = {
  balance: 0,
  totalDeposited: 0,
  totalWithdrawn: 0,
  transactions: []
};

/* ---------------------- Helpers ---------------------- */

function rnd() {
  return Math.random().toString(36).substring(2, 10);
}

function nowTime() {
  return new Date().toLocaleString("en-KE");
}

/* ================================================================
   Routes
   ================================================================ */

/* ---------------------- Get Wallet ---------------------- */

app.get("/api/wallet", (req, res) => {
  res.json(wallet);
});


/* ---------------------- Bank Deposit ---------------------- */

app.post("/api/deposit/bank", (req, res) => {

  const { amount, name, bank } = req.body;

  if (!amount || !name || !bank) {
    return res.status(400).json({ error: "Fill all required fields" });
  }

  if (amount < 100) {
    return res.status(400).json({ error: "Minimum deposit is KES 100" });
  }

  const ref = `SW-BANK-${rnd()}`;

  wallet.balance += Number(amount);
  wallet.totalDeposited += Number(amount);

  wallet.transactions.unshift({
    kind: "deposit",
    type: "bank",
    name: `Bank — ${bank}`,
    ref,
    amount: Number(amount),
    time: nowTime()
  });

  res.json({
    success: true,
    ref,
    amount
  });
});


/* ---------------------- Mpesa Deposit ---------------------- */

app.post("/api/deposit/mpesa", (req, res) => {

  const { phone, amount } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ error: "Phone and amount required" });
  }

  if (amount < 10) {
    return res.status(400).json({ error: "Minimum is KES 10" });
  }

  const receipt = `MPE${rnd().toUpperCase()}`;

  wallet.balance += Number(amount);
  wallet.totalDeposited += Number(amount);

  wallet.transactions.unshift({
    kind: "deposit",
    type: "mpesa",
    name: "M-Pesa",
    ref: receipt,
    amount: Number(amount),
    time: nowTime()
  });

  res.json({
    success: true,
    receipt,
    amount
  });

});


/* ---------------------- PayPal Deposit ---------------------- */

app.post("/api/deposit/paypal", (req, res) => {

  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({ error: "Amount required" });
  }

  const USD_KES = 130;
  const kes = amount * USD_KES;

  const captureId = `CAP-${rnd()}`;

  wallet.balance += kes;
  wallet.totalDeposited += kes;

  wallet.transactions.unshift({
    kind: "deposit",
    type: "paypal",
    name: "PayPal",
    ref: captureId,
    amount: kes,
    time: nowTime()
  });

  res.json({
    success: true,
    captureId,
    kes
  });

});


/* ---------------------- Withdraw ---------------------- */

app.post("/api/withdraw", (req, res) => {

  const { amount, method } = req.body;

  if (!amount) {
    return res.status(400).json({ error: "Enter amount" });
  }

  if (amount > wallet.balance) {
    return res.status(400).json({
      error: `Insufficient balance. Available: KES ${wallet.balance}`
    });
  }

  if (amount < 100) {
    return res.status(400).json({
      error: "Minimum withdrawal is KES 100"
    });
  }

  const ref = `SW-OUT-${rnd()}`;

  wallet.balance -= Number(amount);
  wallet.totalWithdrawn += Number(amount);

  wallet.transactions.unshift({
    kind: "withdraw",
    type: method || "bank",
    name: "Withdrawal",
    ref,
    amount: Number(amount),
    time: nowTime()
  });

  res.json({
    success: true,
    ref,
    amount
  });

});


/* ---------------------- Transaction History ---------------------- */

app.get("/api/transactions", (req, res) => {
  res.json(wallet.transactions);
});


/* ================================================================
   Start Server
   ================================================================ */

app.listen(PORT, () => {
  console.log(`🚀 StoreWallet API running on http://localhost:${PORT}`);
});