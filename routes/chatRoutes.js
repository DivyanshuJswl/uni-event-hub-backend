// routes/chat.js
const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const authMiddleware = require("../middleware/authMiddleware");

// Protect all routes - require authentication
router.use(authMiddleware.protect);

// Chat routes
router.post("/", chatController.chatWithAI);
router.get("/suggestions", chatController.getChatSuggestions);
router.get("/categories", chatController.getEventCategories);

module.exports = router;
