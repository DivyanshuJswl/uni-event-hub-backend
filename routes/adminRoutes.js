const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

router.get(
  '/students/:email',
  authMiddleware.protect,
  authMiddleware.restrictToAdmin,
  adminController.getStudentByEmail
);

module.exports = router;