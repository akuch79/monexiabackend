import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: Number,
  type: String, // "credit" or "debit"
  date: { type: Date, default: Date.now },
});

export default mongoose.model("Transaction", TransactionSchema);