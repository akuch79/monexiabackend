import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    phone: { type: String, default: "" },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["income", "expense"], required: true },
    category: { type: String, default: "General" },
    status: { type: String, enum: ["Pending", "Completed", "Failed"], default: "Completed" },
    reference: { type: String, default: null },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Add index for faster queries
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ user: 1, type: 1 });
transactionSchema.index({ user: 1, category: 1 });

export default mongoose.model("Transaction", transactionSchema);