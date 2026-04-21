import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // nullable for C2B callbacks
    type: {
      type: String,
      enum: ["stk_push", "c2b", "b2c", "status_query"],
      required: true,
    },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
    accountRef: String,
    mpesaRef: String,            // M-Pesa receipt number (e.g. OEI2AK4Q16)
    checkoutRequestId: String,   // STK Push
    merchantRequestId: String,   // STK Push
    conversationId: String,      // B2C
    originatorId: String,        // B2C
    raw: mongoose.Schema.Types.Mixed, // Full Safaricom response
  },
  { timestamps: true }
);

// Indexes for fast lookups
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ checkoutRequestId: 1 });
transactionSchema.index({ conversationId: 1 });
transactionSchema.index({ mpesaRef: 1 });

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;