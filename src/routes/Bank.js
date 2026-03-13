// ================================================================
// routes/bank.js
// ================================================================

const express = require('express')
const axios = require('axios')
const crypto = require('crypto')



const router = express.Router()

// example wallet function
const creditWallet = (userId, amount) => {
  console.log(`Wallet credited for ${userId} with ${amount}`)
}

// initiate bank transfer
router.post('/', async (req, res) => {

  const { userId, amount, email } = req.body

  if (!amount || amount < 100) {
    return res.status(400).json({
      success: false,
      message: "Minimum deposit is 100"
    })
  }

  const tx_ref = `SW-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`

  try {

    const response = await axios.post(
      "https://api.flutterwave.com/v3/charges?type=bank_transfer",
      {
        tx_ref,
        amount,
        currency: "KES",
        email
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    res.json({
      success: true,
      tx_ref,
      data: response.data
    })

  } catch (error) {

    console.error(error.message)

    res.status(500).json({
      success: false,
      message: "Bank transfer failed"
    })

  }

})

// webhook
router.post('/webhook', (req, res) => {

  const event = req.body

  if (event.event === "charge.completed") {

    const { amount, meta } = event.data

    creditWallet(meta.userId, amount)

  }

  res.sendStatus(200)

})

module.exports = router