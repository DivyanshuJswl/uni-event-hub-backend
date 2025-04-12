const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');

// Add a test route for debugging
router.get('/test', (req, res) => {
  res.status(200).json({ message: "Wallet route is working!" });
});

router.patch(
  '/',
  authMiddleware.protect,
  walletController.updateWallet
);

module.exports = router;