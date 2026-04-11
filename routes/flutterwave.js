import express from 'express';
const router = express.Router();

router.post('/initiate', async (req, res) => {
    try {
        const { amount, currency, email, name } = req.body;

        console.log('Flutterwave Request:', { amount, currency, email, name });

        // ⚠️ Test redirect (fake link for now)
        return res.json({
            checkoutUrl: 'https://flutterwave.com/pay/test-payment'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Flutterwave error' });
    }
});

export default router;