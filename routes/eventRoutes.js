const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { checkEventExists } = require("../middleware/eventMiddleware");
const upload = require("../middleware/upload");

// Public routes (no authentication required)
router.get("/", eventController.getAllEvents);

router.get("/:eventId", checkEventExists, eventController.getEvent);

// Protected routes (require authentication)
router.use(authMiddleware.protect);

// Upload routes
router.post(
  "/:eventId/upload-image",
  authMiddleware.restrictTo("organizer"),
  checkEventExists,
  upload.single("image"),
  eventController.uploadEventImage
);

// Participant-specific routes
router.post(
  "/enroll/:eventId",
  authMiddleware.restrictTo("participant"),
  checkEventExists,
  eventController.enrollInEvent
);

router.post(
  "/unenroll/:eventId",
  authMiddleware.restrictTo("participant"),
  checkEventExists,
  eventController.unenrollFromEvent
);

// Organizer-specific routes
router.use(authMiddleware.restrictTo("organizer"));

router.post("/create", eventController.createEvent);

router.patch(
  "/:eventId",
  checkEventExists,
  authMiddleware.isEventOrganizer,
  eventController.updateEvent
);

router.delete(
  "/:eventId",
  checkEventExists,
  authMiddleware.isEventOrganizer,
  eventController.deleteEvent
);

router.put(
  "/modify-participants/:eventId",
  checkEventExists,
  authMiddleware.isEventOrganizer,
  eventController.modifyParticipants
);

module.exports = router;
