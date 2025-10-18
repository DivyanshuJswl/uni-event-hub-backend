const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");

// All admin routes require admin role
router.use(authMiddleware.protect, authMiddleware.restrictTo("admin"));

router.get(
  "/students/:email",
  authMiddleware.protect,
  authMiddleware.restrictToAdmin,
  adminController.getStudentByEmail
);

router.post("/events/update-status", adminController.manualStatusUpdate);
router.get("/events/status-service", adminController.getStatusServiceInfo);
router.get("/events/pending-updates", adminController.getPendingStatusUpdates);

module.exports = router;
