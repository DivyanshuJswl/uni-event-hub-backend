const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const authMiddleware = require('../middleware/authMiddleware');
const { checkEventExists } = require('../middleware/eventMiddleware');

// Public routes (no authentication required)
router.get('/', eventController.getAllEvents);
router.get('/:eventId', checkEventExists, eventController.getEvent);




// Protected routes (require authentication)
router.use(authMiddleware.protect);

// Participant-specific routes
router.post('/enroll/:eventId', 
  authMiddleware.restrictTo('participant'),
  checkEventExists,
  eventController.enrollInEvent
);

router.post('/unenroll/:eventId', 
  authMiddleware.restrictTo('participant'),
  checkEventExists,
  eventController.unenrollFromEvent
);

// Organizer-specific routes
router.use(authMiddleware.restrictTo('organizer'));

router.post('/create', eventController.createEvent);

router.put('/update/:eventId', 
  checkEventExists,
  authMiddleware.isEventOrganizer,
  eventController.updateEvent
);

router.delete('/delete/:eventId', 
  checkEventExists,
  authMiddleware.isEventOrganizer,
  eventController.deleteEvent
);

router.put('/modify-participants/:eventId', 
  checkEventExists,
  authMiddleware.isEventOrganizer,
  eventController.modifyParticipants
);

module.exports = router;