import express from "express";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";

const router = express.Router();

// Add transaction
router.post("/add", async (req, res) => {
  const { userId, amount, type } = req.body;
  try {
    const wallet = await Wallet.findOne({ userId });
    if(type === "debit" && wallet.balance < amount) 
      return res.status(400).json({ error: "Insufficient balance" });
    
    wallet.balance = type === "credit" ? wallet.balance + amount : wallet.balance - amount;
    await wallet.save();

    const transaction = await Transaction.create({ userId, amount, type });
    res.json({ message: "Transaction successful", transaction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get transactions
router.get("/:userId", async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;