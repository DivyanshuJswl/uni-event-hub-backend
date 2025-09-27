// routes/logRoutes.js
const express = require("express");
const logController = require("../controllers/logController");
const auth = require("../middleware/authMiddleware");
const router = express.Router();

// Protect all routes (admin only)
router.use(auth.protect);

// Check if user is admin
router.use((req, res, next) => {
  if (req.student.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Access denied. Admin privileges required.",
    });
  }
  next();
});

router.get("/", logController.getLogs);
router.get("/stats", logController.getLogStats);
router.delete("/cleanup", logController.cleanupLogs);

module.exports = router;
