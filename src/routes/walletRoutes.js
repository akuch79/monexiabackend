// ================================================================
// src/routes/wallet.js  —  Wallet API routes
// ================================================================
// GET /api/wallet/:userId                  — Get balance
// GET /api/wallet/:userId/transactions     — Get transaction history

const express = require("express");
const router  = express.Router();
const { getWallet, getTxns } = require("../wallet");

// ── GET /api/wallet/:userId ───────────────────────────────────────
router.get("/:userId", (req, res) => {
  const wallet = getWallet(req.params.userId);
  res.json({ success: true, wallet });
});

// ── GET /api/wallet/:userId/transactions ──────────────────────────
router.get("/:userId/transactions", (req, res) => {
  const txns   = getTxns(req.params.userId);
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  res.json({
    success:      true,
    transactions: txns.slice(offset, offset + limit),
    total:        txns.length,
    hasMore:      offset + limit < txns.length,
  });
});

module.exports = router;