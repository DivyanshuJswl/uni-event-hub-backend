const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const authMiddleware = require("../middleware/authMiddleware");
const { checkEventExists } = require("../middleware/eventMiddleware");
const { uploadImage } = require("../middleware/uploadMiddleware");

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
  uploadImage.single("image"),
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

// Get recent events
router.get(
  "/recent-events",
  authMiddleware.restrictTo("participant"),
  eventController.getRecentEvents
);
// Get popular events
router.get(
  "/popular-events",
  authMiddleware.restrictTo("participant"),
  eventController.getPopularEvents
);
// Get upcoming events
router.get(
  "/upcoming-events",
  authMiddleware.restrictTo("participant"),
  eventController.getUpcomingEvents
);

// Get all events a student is enrolled in
router.get(
  "/students/:studentId",
  authMiddleware.restrictTo("participant"),
  eventController.getStudentEvents
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
