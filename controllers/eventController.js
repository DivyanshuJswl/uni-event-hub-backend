const Event = require("../models/event");
const Student = require("../models/student");
const APIFeatures = require("../utils/apiFeatures"); // For filtering/sorting/pagination


// @desc    Create new event (Organizer only)
// @route   POST /api/events/create
// @access  Private/Organizer
exports.createEvent = async (req, res) => {
  try {
    const { title, description, date, location, maxParticipants, category } = req.body;

    const newEvent = await Event.create({
      title,
      description,
      date,
      location,
      maxParticipants,
      category,
      organizer: req.student._id
    });

    res.status(201).json({
      status: "success",
      data: {
        event: newEvent
      }
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message
    });
  }
};

// @desc    Get all events (with filtering/sorting/pagination)
// @route   GET /api/events
// @access  Public
exports.getAllEvents = async (req, res) => {
  try {
    const features = new APIFeatures(Event.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const events = await features.query.populate("organizer", "name email");

    res.status(200).json({
      status: "success",
      results: events.length,
      data: {
        events
      }
    });
  } catch (err) {
    res.status(404).json({
      status: "fail",
      message: err.message
    });
  }
};

// @desc    Get single event details
// @route   GET /api/events/:eventId
// @access  Public
exports.getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
      .populate("organizer", "name email branch")
      .populate("participants", "name email year branch");

    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "No event found with that ID"
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        event
      }
    });
  } catch (err) {
    res.status(404).json({
      status: "fail",
      message: err.message
    });
  }
};

// @desc    Enroll in event (Participant only)
// @route   POST /api/events/enroll/:eventId
// @access  Private/Participant
exports.enrollInEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "Event not found"
      });
    }

    // Check if event is full
    if (event.participants.length >= event.maxParticipants) {
      return res.status(400).json({
        status: "fail",
        message: "Event has reached maximum capacity"
      });
    }

    // Check if already enrolled
    if (event.participants.includes(req.student._id)) {
      return res.status(400).json({
        status: "fail",
        message: "You are already enrolled in this event"
      });
    }

    // Add to participants and save
    event.participants.push(req.student._id);
    await event.save();

    // Add event to student's enrolledEvents
    await Student.findByIdAndUpdate(
      req.student._id,
      { $addToSet: { enrolledEvents: event._id } },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: "Successfully enrolled in event",
      data: {
        event
      }
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message
    });
  }
};

// @desc    Unenroll from event
// @route   POST /api/events/unenroll/:eventId
// @access  Private/Participant
exports.unenrollFromEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "Event not found"
      });
    }

    // Check if actually enrolled
    if (!event.participants.includes(req.student._id)) {
      return res.status(400).json({
        status: "fail",
        message: "You are not enrolled in this event"
      });
    }

    // Remove from participants
    event.participants = event.participants.filter(
      participant => !participant.equals(req.student._id)
    );
    await event.save();

    // Remove from student's enrolledEvents
    await Student.findByIdAndUpdate(
      req.student._id,
      { $pull: { enrolledEvents: event._id } },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: "Successfully unenrolled from event"
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message
    });
  }
};

// @desc    Update event details (Organizer only)
// @route   PUT /api/events/update/:eventId
// @access  Private/Organizer
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate(
      {
        _id: req.params.eventId,
        organizer: req.student._id // Only organizer can update
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "No event found with that ID or you're not the organizer"
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        event
      }
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message
    });
  }
};

// @desc    Delete event (Organizer only)
// @route   DELETE /api/events/delete/:eventId
// @access  Private/Organizer
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findOneAndDelete({
      _id: req.params.eventId,
      organizer: req.student._id // Only organizer can delete
    });

    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "No event found with that ID or you're not the organizer"
      });
    }

    // Remove event from all participants' enrolledEvents
    await Student.updateMany(
      { enrolledEvents: event._id },
      { $pull: { enrolledEvents: event._id } }
    );

    res.status(204).json({
      status: "success",
      data: null
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message
    });
  }
};

// @desc    Modify participants list (Organizer only)
// @route   PUT /api/events/modify-participants/:eventId
// @access  Private/Organizer
exports.modifyParticipants = async (req, res) => {
  try {
    const { action, studentId } = req.body;
    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "Event not found"
      });
    }

    // Verify organizer ownership
    if (!event.organizer.equals(req.student._id)) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to modify this event"
      });
    }

    // Check if student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        status: "fail",
        message: "Student not found"
      });
    }

    if (action === "add") {
      // Check if already enrolled
      if (event.participants.includes(studentId)) {
        return res.status(400).json({
          status: "fail",
          message: "Student already enrolled"
        });
      }

      // Check capacity
      if (event.participants.length >= event.maxParticipants) {
        return res.status(400).json({
          status: "fail",
          message: "Event has reached maximum capacity"
        });
      }

      event.participants.push(studentId);
      await Student.findByIdAndUpdate(
        studentId,
        { $addToSet: { enrolledEvents: event._id } }
      );
    } else if (action === "remove") {
      if (!event.participants.includes(studentId)) {
        return res.status(400).json({
          status: "fail",
          message: "Student not enrolled in this event"
        });
      }

      event.participants = event.participants.filter(
        id => !id.equals(studentId)
      );
      await Student.findByIdAndUpdate(
        studentId,
        { $pull: { enrolledEvents: event._id } }
      );
    } else {
      return res.status(400).json({
        status: "fail",
        message: "Invalid action. Use 'add' or 'remove'"
      });
    }

    await event.save();
    res.status(200).json({
      status: "success",
      data: {
        event
      }
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message
    });
  }
};