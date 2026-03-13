const express = require('express');
const router = express.Router();
const User = require('../src/models/User');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user by email
    const user = await User.findOne({ email });
    
    // 2. Check if user exists and password matches
    if (user && user.password === password) {
      res.json({
        success: true,
        user: { id: user._id, email: user.email, balance: user.balance }
      });
    } else {
      res.status(401).json({ success: false, message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;