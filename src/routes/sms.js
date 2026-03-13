// server/routes/sms.js
// ─────────────────────────────────────────────────────────────────────────────
// Africa's Talking SMS OTP sender
//
// Install: npm install africastalking
//
// Add to your server .env (NOT the frontend .env):
//   AT_API_KEY=your_africas_talking_api_key
//   AT_USERNAME=your_username   (use "sandbox" for testing)
// ─────────────────────────────────────────────────────────────────────────────

const express  = require("express");
const router   = express.Router();
const AfricasTalking = require("africastalking");

const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME || "sandbox",
});
const sms = at.SMS;

// POST /api/sms/send-otp
router.post("/send-otp", async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ success: false, error: "Phone and OTP required." });
  }

  // Sanitize: only allow digits, +, spaces
  const cleanPhone = String(phone).replace(/[^\d\s+]/g, "").trim();
  const cleanOtp   = String(otp).replace(/\D/g, "").slice(0, 6);

  if (!cleanPhone || !cleanOtp) {
    return res.status(400).json({ success: false, error: "Invalid phone or OTP." });
  }

  try {
    await sms.send({
      to:      [cleanPhone],
      message: `Your StoreWallet verification code is: ${cleanOtp}. Valid for 10 minutes. Do not share this code.`,
      from:    "StoreWlt", // your registered sender ID (or remove for sandbox)
    });

    res.json({ success: true });
  } catch (err) {
    console.error("AT SMS error:", err);
    res.status(500).json({ success: false, error: "Failed to send SMS." });
  }
});

module.exports = router;


// ─────────────────────────────────────────────────────────────────────────────
// Add to your server/index.js or server/app.js:
//
//   const smsRoutes = require("./routes/sms");
//   app.use("/api/sms", smsRoutes);
// ─────────────────────────────────────────────────────────────────────────────