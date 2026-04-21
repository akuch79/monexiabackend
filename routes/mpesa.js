import express from "express";
import axios from "axios";
import Transaction from "../models/Transaction.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
  CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
  PASSKEY: process.env.MPESA_PASSKEY,
  SHORT_CODE: process.env.MPESA_SHORT_CODE || "174379",
  B2C_SHORT_CODE: process.env.MPESA_B2C_SHORT_CODE || "600000",
  B2C_INITIATOR: process.env.MPESA_B2C_INITIATOR || "testapi",
  B2C_SECURITY_CREDENTIAL: process.env.MPESA_B2C_SECURITY_CREDENTIAL,
  BASE_URL: process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke",
  CALLBACK_URL: process.env.MPESA_CALLBACK_URL || process.env.BACKEND_URL || "https://your-server.com",
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

async function getAccessToken() {
  if (!CONFIG.CONSUMER_KEY || !CONFIG.CONSUMER_SECRET) {
    throw new Error("M-Pesa CONSUMER_KEY or CONSUMER_SECRET not configured");
  }
  const auth = Buffer.from(`${CONFIG.CONSUMER_KEY}:${CONFIG.CONSUMER_SECRET}`).toString("base64");
  const res = await axios.get(`${CONFIG.BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return res.data.access_token;
}

function getStkCredentials() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .slice(0, 14);
  const password = Buffer.from(`${CONFIG.SHORT_CODE}${CONFIG.PASSKEY}${timestamp}`).toString("base64");
  return { timestamp, password };
}

function formatPhone(phone) {
  // Normalize to 2547XXXXXXXX format
  const str = String(phone).replace(/\s+/g, "");
  if (str.startsWith("07") || str.startsWith("01")) return "254" + str.slice(1);
  if (str.startsWith("+254")) return str.slice(1);
  return str;
}

// ─── DIAGNOSTIC ────────────────────────────────────────────────────────────

// GET /api/mpesa/token — test credentials
router.get("/token", protect, async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({ success: true, message: "M-Pesa credentials valid", preview: token.slice(0, 20) + "..." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── STK PUSH ──────────────────────────────────────────────────────────────

// POST /api/mpesa/stk-push
router.post("/stk-push", protect, async (req, res) => {
  try {
    let { phone, amount, accountRef = "Payment", description = "Monexia Payment" } = req.body;
    if (!phone || !amount) return res.status(400).json({ success: false, error: "phone and amount required" });

    phone = formatPhone(phone);
    amount = Math.round(Number(amount));

    const token = await getAccessToken();
    const { timestamp, password } = getStkCredentials();

    const payload = {
      BusinessShortCode: CONFIG.SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: CONFIG.SHORT_CODE,
      PhoneNumber: phone,
      CallBackURL: `${CONFIG.CALLBACK_URL}/api/mpesa/stk-callback`,
      AccountReference: accountRef,
      TransactionDesc: description,
    };

    const response = await axios.post(
      `${CONFIG.BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Save pending transaction to DB
    await Transaction.create({
      user: req.user._id,
      type: "stk_push",
      phone,
      amount,
      accountRef,
      status: "pending",
      checkoutRequestId: response.data.CheckoutRequestID,
      merchantRequestId: response.data.MerchantRequestID,
      raw: response.data,
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("[STK Push Error]", err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/mpesa/stk-query
router.post("/stk-query", protect, async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    if (!checkoutRequestId) return res.status(400).json({ success: false, error: "checkoutRequestId required" });

    const token = await getAccessToken();
    const { timestamp, password } = getStkCredentials();

    const response = await axios.post(
      `${CONFIG.BASE_URL}/mpesa/stkpushquery/v1/query`,
      { BusinessShortCode: CONFIG.SHORT_CODE, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Update transaction status in DB
    const resultCode = response.data.ResultCode;
    await Transaction.findOneAndUpdate(
      { checkoutRequestId },
      { status: resultCode === "0" ? "completed" : "failed", raw: response.data }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/mpesa/stk-callback  (called by Safaricom — no auth)
router.post("/stk-callback", async (req, res) => {
  try {
    const { Body } = req.body;
    const callback = Body?.stkCallback;
    const checkoutRequestId = callback?.CheckoutRequestID;
    const resultCode = callback?.ResultCode;

    console.log("[STK Callback]", JSON.stringify(callback, null, 2));

    if (checkoutRequestId) {
      const status = resultCode === 0 ? "completed" : "failed";
      const metadata = callback?.CallbackMetadata?.Item || [];
      const mpesaRef = metadata.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

      await Transaction.findOneAndUpdate(
        { checkoutRequestId },
        { status, mpesaRef, raw: callback }
      );
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("[STK Callback Error]", err.message);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // Always respond 200 to Safaricom
  }
});

// ─── C2B ───────────────────────────────────────────────────────────────────

// POST /api/mpesa/c2b/register
router.post("/c2b/register", protect, async (req, res) => {
  try {
    const token = await getAccessToken();
    const response = await axios.post(
      `${CONFIG.BASE_URL}/mpesa/c2b/v1/registerurl`,
      {
        ShortCode: CONFIG.SHORT_CODE,
        ResponseType: "Completed",
        ConfirmationURL: `${CONFIG.CALLBACK_URL}/api/mpesa/c2b-confirmation`,
        ValidationURL: `${CONFIG.CALLBACK_URL}/api/mpesa/c2b-validation`,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/mpesa/c2b/simulate  (sandbox only)
router.post("/c2b/simulate", protect, async (req, res) => {
  try {
    let { phone, amount, billRefNumber = "TestRef" } = req.body;
    if (!phone || !amount) return res.status(400).json({ success: false, error: "phone and amount required" });

    phone = formatPhone(phone);
    const token = await getAccessToken();

    const response = await axios.post(
      `${CONFIG.BASE_URL}/mpesa/c2b/v1/simulate`,
      { ShortCode: CONFIG.SHORT_CODE, CommandID: "CustomerPayBillOnline", Amount: Math.round(amount), Msisdn: phone, BillRefNumber: billRefNumber },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/mpesa/c2b-confirmation  (called by Safaricom — no auth)
router.post("/c2b-confirmation", async (req, res) => {
  console.log("[C2B Confirmation]", JSON.stringify(req.body, null, 2));
  try {
    await Transaction.create({
      type: "c2b",
      phone: req.body.MSISDN,
      amount: req.body.TransAmount,
      mpesaRef: req.body.TransID,
      accountRef: req.body.BillRefNumber,
      status: "completed",
      raw: req.body,
    });
  } catch (e) { console.error("[C2B Confirmation DB Error]", e.message); }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// POST /api/mpesa/c2b-validation  (called by Safaricom — no auth)
router.post("/c2b-validation", async (req, res) => {
  console.log("[C2B Validation]", JSON.stringify(req.body, null, 2));
  // Add your own validation logic here (check account exists, etc.)
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ─── B2C ───────────────────────────────────────────────────────────────────

// POST /api/mpesa/b2c
router.post("/b2c", protect, async (req, res) => {
  try {
    let { phone, amount, remarks = "Payment", occasion = "" } = req.body;
    if (!phone || !amount) return res.status(400).json({ success: false, error: "phone and amount required" });

    phone = formatPhone(phone);
    amount = Math.round(Number(amount));

    const token = await getAccessToken();
    const originatorId = `B2C-${Date.now()}`;

    const response = await axios.post(
      `${CONFIG.BASE_URL}/mpesa/b2c/v3/paymentrequest`,
      {
        OriginatorConversationID: originatorId,
        InitiatorName: CONFIG.B2C_INITIATOR,
        SecurityCredential: CONFIG.B2C_SECURITY_CREDENTIAL,
        CommandID: "BusinessPayment",
        Amount: amount,
        PartyA: CONFIG.B2C_SHORT_CODE,
        PartyB: phone,
        Remarks: remarks,
        QueueTimeOutURL: `${CONFIG.CALLBACK_URL}/api/mpesa/b2c-timeout`,
        ResultURL: `${CONFIG.CALLBACK_URL}/api/mpesa/b2c-result`,
        Occasion: occasion,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    await Transaction.create({
      user: req.user._id,
      type: "b2c",
      phone,
      amount,
      status: "pending",
      originatorId,
      conversationId: response.data.ConversationID,
      raw: response.data,
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("[B2C Error]", err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/mpesa/b2c-result  (called by Safaricom — no auth)
router.post("/b2c-result", async (req, res) => {
  console.log("[B2C Result]", JSON.stringify(req.body, null, 2));
  try {
    const result = req.body.Result;
    if (result?.ConversationID) {
      const status = result.ResultCode === 0 ? "completed" : "failed";
      await Transaction.findOneAndUpdate({ conversationId: result.ConversationID }, { status, raw: result });
    }
  } catch (e) { console.error("[B2C Result DB Error]", e.message); }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

router.post("/b2c-timeout", async (req, res) => {
  console.log("[B2C Timeout]", JSON.stringify(req.body, null, 2));
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ─── TRANSACTION STATUS ────────────────────────────────────────────────────

// POST /api/mpesa/transaction-status
router.post("/transaction-status", protect, async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ success: false, error: "transactionId required" });

    const token = await getAccessToken();
    const response = await axios.post(
      `${CONFIG.BASE_URL}/mpesa/transactionstatus/v1/query`,
      {
        Initiator: CONFIG.B2C_INITIATOR,
        SecurityCredential: CONFIG.B2C_SECURITY_CREDENTIAL,
        CommandID: "TransactionStatusQuery",
        TransactionID: transactionId,
        PartyA: CONFIG.SHORT_CODE,
        IdentifierType: "4",
        ResultURL: `${CONFIG.CALLBACK_URL}/api/mpesa/status-result`,
        QueueTimeOutURL: `${CONFIG.CALLBACK_URL}/api/mpesa/status-timeout`,
        Remarks: "Status check",
        Occasion: "",
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

router.post("/status-result", async (req, res) => {
  console.log("[Status Result]", JSON.stringify(req.body, null, 2));
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

router.post("/status-timeout", async (req, res) => {
  console.log("[Status Timeout]", JSON.stringify(req.body, null, 2));
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ─── TRANSACTION HISTORY ──────────────────────────────────────────────────

// GET /api/mpesa/transactions — fetch logged-in user's M-Pesa transactions
router.get("/transactions", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const filter = { user: req.user._id };
    if (type) filter.type = type;
    if (status) filter.status = status;

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Transaction.countDocuments(filter);

    res.json({ success: true, data: transactions, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;