import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    phone:       { type: String, default: "" },          // ✅ no longer required
    description: { type: String, required: true, trim: true },
    amount:      { type: Number, required: true },
    type:        { type: String, enum: ["income", "expense"], required: true },
    category:    { type: String, default: "General" },   // ✅ added for UI
    date:        { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);