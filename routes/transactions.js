import express from "express";
import jwt from "jsonwebtoken";
import Transaction from "../models/Transaction.js";

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────
const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

// GET /api/transactions — get all for logged-in user
router.get("/", protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/transactions — add new transaction
router.post("/", protect, async (req, res) => {
  try {
    const { description, amount, type, date } = req.body;
    if (!description || !amount || !type)
      return res.status(400).json({ message: "description, amount and type are required" });

    const transaction = await Transaction.create({
      user: req.userId,
      description,
      amount,
      type,
      date: date || Date.now(),
    });
    res.status(201).json(transaction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/transactions/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, user: req.userId });
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    await transaction.deleteOne();
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;