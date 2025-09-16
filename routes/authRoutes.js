const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const oauthController = require('../controllers/oauthController');
const authMiddleware = require('../middleware/authMiddleware');

// @desc    Register new student
// @route   POST /api/auth/signup
// @access  Public
router.post('/signup', authController.signup);

router.post('/google', oauthController.googleLogin);

// @desc    Login student
// @route   POST /api/auth/login
// @access  Public
router.post('/login', authController.login);

// @desc    Logout student
// @route   GET /api/auth/logout
// @access  Private
router.post('/logout', authMiddleware.protect, authController.logout);

// @desc    Get current logged-in student
// @route   GET /api/auth/me
// @access  Private
router.get('/me', authMiddleware.protect, authController.getMe);

// @desc    Update student details
// @route   PUT /api/auth/update-me
// @access  Private
router.put('/update-me', authMiddleware.protect, authController.updateMe);

// @desc    Delete student account
// @route   DELETE /api/auth/delete-me
// @access  Private
router.delete('/delete-me', authMiddleware.protect, authController.deleteMe);

// @desc    Change password
// @route   PATCH /api/auth/update-password
// @access  Private
router.patch('/update-password', authMiddleware.protect, authController.updatePassword);

module.exports = router;