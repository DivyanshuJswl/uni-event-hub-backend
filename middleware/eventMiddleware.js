const mongoose = require('mongoose');
const Event = require('../models/event');
const AppError = require('../utils/appError');

exports.checkEventExists = async (req, res, next) => {
  try {
    // Verify valid MongoDB ID format first
    if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
      return next(new AppError('Invalid event ID format', 400));
    }

    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return next(new AppError('No event found with that ID', 404));
    }
    
    req.event = event;
    next();
  } catch (err) {
    next(err);
  }
};

exports.checkEventCapacity = async (req, res, next) => {
  try {
    // Refresh the event data in case of concurrent updates
    await req.event.populate('participants');
    
    if (req.event.participants.length >= req.event.maxParticipants) {
      return next(new AppError('This event has reached maximum capacity', 400));
    }
    next();
  } catch (err) {
    next(err);
  }
};