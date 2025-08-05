const Event = require("../models/event");
const Student = require("../models/student");
const APIFeatures = require("../utils/apiFeatures"); // For filtering/sorting/pagination

// @desc    Create new event (Organizer only)
// @route   POST /api/events/create
// @access  Private/Organizer
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      location,
      maxParticipants,
      category,
      eventURL,
      enableRegistration,
      digitalCertificates,
      sendReminders,
    } = req.body;

    const newEvent = await Event.create({
      title,
      description,
      date,
      location,
      maxParticipants,
      category,
      eventURL,
      enableRegistration,
      digitalCertificates,
      sendReminders,
      organizer: req.student._id,
    });

    res.status(201).json({
      status: "success",
      data: {
        event: newEvent,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

// @desc    Update event details (Organizer only)
// @route   PUT /api/events/update/:eventId
// @access  Private/Organizer
// Update the updateEvent function
exports.updateEvent = async (req, res) => {
  try {
    const eventId = req.params.eventId || req.params.id;
    const event = await Event.findOneAndUpdate(
      {
        _id: eventId,
        organizer: req.student._id,
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("organizer", "name email")
      .populate("participants", "name email year branch");

    if (!event) {
      // Return proper 404 if event not found
      return res.status(404).json({
        status: "fail",
        message: "Event not found",
      });
    }

    // Return success response with updated event
    res.status(200).json({
      status: "success",
      data: {
        event,
      },
    });
  } catch (err) {
    next(err); // Pass to error handler middleware
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
        events,
      },
    });
  } catch (err) {
    res.status(404).json({
      status: "fail",
      message: err.message,
    });
  }
};

exports.getRecentEvents = async (req, res) => {
  try {
    // Get the limit from query params or default to 3
    const limit = parseInt(req.query.limit) || 3;

    const student = await Student.findById(req.student._id);

    const features = new APIFeatures(
      Event.find({ _id: { $in: student.enrolledEvents } }),
      {
        sort: "-startDate", // Sort by newest first
        limit: limit, // Use the limit from frontend
      }
    )
      .sort()
      .limitFields()
      .paginate();

    const events = await features.query
      .populate("organizer", "name email")
      .populate({
        path: "participants",
        select: "name",
        options: { limit: 3 }, // Only get first 3 participants
      });

    res.status(200).json({
      status: "success",
      results: events.length,
      data: {
        events,
      },
    });
  } catch (err) {
    res.status(404).json({
      status: "fail",
      message: err.message,
    });
  }
};

exports.getPopularEvents = async (req, res) => {
  try {
    const student = await Student.findById(req.student._id);

    // First get the count of participants for each event
    const events = await Event.aggregate([
      { $match: { _id: { $in: student.enrolledEvents } } },
      { $addFields: { participantsCount: { $size: "$participants" } } },
      { $sort: { participantsCount: -1 } },
      { $limit: req.query.limit || 3 },
      {
        $lookup: {
          from: "students",
          localField: "organizer",
          foreignField: "_id",
          as: "organizer",
        },
      },
      { $unwind: "$organizer" },
      {
        $project: {
          title: 1,
          description: 1,
          startDate: 1,
          endDate: 1,
          participantsCount: 1,
          organizer: { name: 1, email: 1 },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        events,
      },
    });
  } catch (err) {
    res.status(404).json({
      status: "fail",
      message: err.message,
    });
  }
};

exports.getUpcomingEvents = async (req, res) => {
  try {
    const student = await Student.findById(req.student._id);
    const currentDate = new Date();

    const features = new APIFeatures(
      Event.find({
        _id: { $in: student.enrolledEvents },
        startDate: { $gt: currentDate },
      }),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const events = await features.query.populate("organizer", "name email");

    res.status(200).json({
      status: "success",
      data: {
        events,
      },
    });
  } catch (err) {
    res.status(404).json({
      status: "fail",
      message: err.message,
    });
  }
};

// @desc    Get all events a student is enrolled in
// @route   GET /api/students/:studentId/events
// @access  Private (student can only access their own events)
exports.getStudentEvents = async (req, res) => {
  try {    
    // Verify student is accessing their own data
    if (req.params.studentId !== req.student._id.toString()) {
      return res.status(403).json({
        status: "fail",
        message: "Unauthorized access",
      });
    }

    const student = await Student.findById(req.params.studentId)
      .select('enrolledEvents');
      
    if (!student) {
      return res.status(404).json({
        status: "fail",
        message: "Student not found",
      });
    }

    // Create base query
    const baseQuery = Event.find({ _id: { $in: student.enrolledEvents } });

    // Apply APIFeatures
    const features = new APIFeatures(baseQuery, req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const events = await features.query.populate("organizer", "name email");
    
    res.status(200).json({
      status: "success",
      results: events.length,
      data: {
        events,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
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
        message: "No event found with that ID",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        event,
      },
    });
  } catch (err) {
    res.status(404).json({
      status: "fail",
      message: err.message,
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
        message: "Event not found",
      });
    }

    // Check if event is full
    if (event.participants.length >= event.maxParticipants) {
      return res.status(400).json({
        status: "fail",
        message: "Event has reached maximum capacity",
      });
    }

    // Check if already enrolled
    if (event.participants.includes(req.student._id)) {
      return res.status(400).json({
        status: "fail",
        message: "You are already enrolled in this event",
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
        event,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
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
        message: "Event not found",
      });
    }

    // Check if actually enrolled
    if (!event.participants.includes(req.student._id)) {
      return res.status(400).json({
        status: "fail",
        message: "You are not enrolled in this event",
      });
    }

    // Remove from participants
    event.participants = event.participants.filter(
      (participant) => !participant.equals(req.student._id)
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
      message: "Successfully unenrolled from event",
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
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
      organizer: req.student._id, // Only organizer can delete
    });

    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "No event found with that ID or you're not the organizer",
      });
    }

    // Remove event from all participants' enrolledEvents
    await Student.updateMany(
      { enrolledEvents: event._id },
      { $pull: { enrolledEvents: event._id } }
    );

    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
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
        message: "Event not found",
      });
    }

    // Verify organizer ownership
    if (!event.organizer.equals(req.student._id)) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to modify this event",
      });
    }

    // Check if student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        status: "fail",
        message: "Student not found",
      });
    }

    if (action === "add") {
      // Check if already enrolled
      if (event.participants.includes(studentId)) {
        return res.status(400).json({
          status: "fail",
          message: "Student already enrolled",
        });
      }

      // Check capacity
      if (event.participants.length >= event.maxParticipants) {
        return res.status(400).json({
          status: "fail",
          message: "Event has reached maximum capacity",
        });
      }

      event.participants.push(studentId);
      await Student.findByIdAndUpdate(studentId, {
        $addToSet: { enrolledEvents: event._id },
      });
    } else if (action === "remove") {
      if (!event.participants.includes(studentId)) {
        return res.status(400).json({
          status: "fail",
          message: "Student not enrolled in this event",
        });
      }

      event.participants = event.participants.filter(
        (id) => !id.equals(studentId)
      );
      await Student.findByIdAndUpdate(studentId, {
        $pull: { enrolledEvents: event._id },
      });
    } else {
      return res.status(400).json({
        status: "fail",
        message: "Invalid action. Use 'add' or 'remove'",
      });
    }

    await event.save();
    res.status(200).json({
      status: "success",
      data: {
        event,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

// ...existing code...
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
// Middleware to check if event exists and attach to request
exports.checkEventExists = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "No event found with that ID",
      });
    }
    req.event = event; // Attach event to request
    next();
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

// Middleware to verify organizer
exports.verifyOrganizer = (req, res, next) => {
  if (!req.event.organizer.equals(req.student._id)) {
    return res.status(403).json({
      status: "fail",
      message: "You are not the organizer of this event",
    });
  }
  next();
};
// @desc    Upload event image (Organizer only)
// @route   POST /api/events/:eventId/upload-image
exports.uploadEventImage = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ status: "fail", message: "No file uploaded" });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "events",
          resource_type: "image",
          public_id: `event_${req.params.eventId}_${Date.now()}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    // Get current event to check if it's the first image
    const currentEvent = await Event.findById(req.params.eventId);
    const isFirstImage =
      !currentEvent.images || currentEvent.images.length === 0;

    // Prepare image data
    const imageData = {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      isFeatured: isFirstImage,
    };

    // Update both images array and featuredImage if it's the first image
    const update = {
      $push: { images: imageData },
    };

    if (isFirstImage) {
      update.featuredImage = imageData;
    }

    const event = await Event.findByIdAndUpdate(req.params.eventId, update, {
      new: true,
    });

    if (!event) {
      return res
        .status(404)
        .json({ status: "fail", message: "Event not found" });
    }

    res.status(200).json({
      status: "success",
      data: {
        url: result.secure_url,
        event,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "fail", message: err.message });
  }
};

exports.setFeaturedImage = async (req, res) => {
  try {
    const { imageId } = req.body;

    // Find the image in the event's images array
    const event = await Event.findById(req.params.eventId);
    const imageToFeature = event.images.find((img) => img._id.equals(imageId));

    if (!imageToFeature) {
      return res
        .status(404)
        .json({ status: "fail", message: "Image not found" });
    }

    // Update both featuredImage and isFeatured flags
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.eventId,
      {
        featuredImage: imageToFeature,
        $set: { "images.$[].isFeatured": false }, // Reset all flags
        $set: { "images.$[elem].isFeatured": true }, // Set new featured
      },
      {
        new: true,
        arrayFilters: [{ "elem._id": imageId }],
      }
    );

    res.status(200).json({ status: "success", data: { event: updatedEvent } });
  } catch (err) {
    res.status(500).json({ status: "fail", message: err.message });
  }
};
