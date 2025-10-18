const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { uploadImage } = require('../middleware/uploadMiddleware');

// @desc    Register new student
// @route   POST /api/auth/signup
// @access  Public
router.post('/signup', authController.signup);

// @desc    Login new student
// @route   POST /api/auth/google
// @access  Public
router.post('/google', authController.googleLogin);

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
router.patch('/update-me', authMiddleware.protect, authController.updateMe);

// Avatar upload route
router.patch(
  '/avatar',
  authMiddleware.protect,
  uploadImage.single('avatar'),
  authController.uploadAvatar
);

router.delete(
  '/avatar',
  authMiddleware.protect,
  authController.deleteAvatar
);

// @desc    Delete student account
// @route   DELETE /api/auth/delete-me
// @access  Private
router.delete('/delete-me', authMiddleware.protect, authController.deleteMe);

// @desc    Change password
// @route   PATCH /api/auth/update-password
// @access  Private
router.patch('/update-password', authMiddleware.protect, authController.updatePassword);

// @desc    Change role
// @route   PATCH /api/auth/upgrade-to-organizer
// @access  Private
router.patch(
  "/upgrade-to-organizer",
  authMiddleware.protect,
  authController.upgradeToOrganizer
);

module.exports = router;