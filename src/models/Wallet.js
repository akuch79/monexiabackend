// ================================================================
// wallet.js — In-memory wallet store
// Replace with real DB (MongoDB / PostgreSQL / MySQL) in production
// ================================================================

const wallets      = {};
const transactions = {};

// ── Get or create wallet ──────────────────────────────────────────
function getWallet(userId) {
  if (!wallets[userId]) {
    wallets[userId] = { userId, balance: 0, currency: 'KES', createdAt: new Date().toISOString() };
  }
  return wallets[userId];
}

// ── Get or create transaction list ───────────────────────────────
function getTxns(userId) {
  if (!transactions[userId]) transactions[userId] = [];
  return transactions[userId];
}

// ── Credit wallet ─────────────────────────────────────────────────
function creditWallet(userId, amount, meta = {}) {
  const wallet = getWallet(userId);
  wallet.balance += amount;
  getTxns(userId).unshift({
    ...meta,
    type:      'credit',
    amount,
    balanceAfter: wallet.balance,
    createdAt: new Date().toISOString(),
  });
  console.log(`✅ Credited KES ${amount} → user ${userId} | Balance: ${wallet.balance}`);
  return wallet;
}

// ── Debit wallet ──────────────────────────────────────────────────
function debitWallet(userId, amount, meta = {}) {
  const wallet = getWallet(userId);
  if (wallet.balance < amount) throw new Error('Insufficient balance');
  wallet.balance -= amount;
  getTxns(userId).unshift({
    ...meta,
    type:      'debit',
    amount,
    balanceAfter: wallet.balance,
    createdAt: new Date().toISOString(),
  });
  console.log(`💸 Debited KES ${amount} → user ${userId} | Balance: ${wallet.balance}`);
  return wallet;
}

module.exports = { getWallet, getTxns, creditWallet, debitWallet };