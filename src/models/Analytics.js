import mongoose from "mongoose";

/**
 * Analytics Model - StoreWallet
 *
 * Tracks financial activity per user so the dashboard can display
 * spending summaries, deposit history, and balance trends over time.
 * Each user has ONE analytics document that gets updated whenever
 * a transaction occurs.
 */
const analyticsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // Links analytics data to a specific user.
      // Required so we always know whose numbers we're tracking.
    },

    totalTransactions: {
      type: Number,
      default: 0,
      // Counts every transaction ever made by the user (deposits + withdrawals).
      // Used to show activity level on the dashboard.
    },

    totalDeposits: {
      type: Number,
      default: 0,
      // Cumulative amount deposited into the wallet.
      // Helps users see how much money they've added over time.
    },

    totalWithdrawals: {
      type: Number,
      default: 0,
      // Cumulative amount withdrawn from the wallet.
      // Helps users track their spending and outflow.
    },

    totalBalance: {
      type: Number,
      default: 0,
      // Current wallet balance (totalDeposits - totalWithdrawals).
      // Stored here for quick reads without recalculating every time.
    },

    monthlyData: [
      {
        month: {
          type: String,
          // Format: "YYYY-MM" e.g. "2024-03"
          // Used to group transactions by month for charts and reports.
        },
        deposits: {
          type: Number,
          default: 0,
          // Total deposited in this specific month.
          // Powers the monthly income chart on the dashboard.
        },
        withdrawals: {
          type: Number,
          default: 0,
          // Total withdrawn in this specific month.
          // Powers the monthly spending chart on the dashboard.
        },
        transactions: {
          type: Number,
          default: 0,
          // Total number of transactions in this specific month.
          // Used to show activity trends over months.
        },
      },
    ],
  },
  {
    timestamps: true,
    // Automatically adds createdAt and updatedAt fields.
    // Useful for knowing when analytics were first created and last updated.
  }
);

const Analytics = mongoose.model("Analytics", analyticsSchema);

export default Analytics;