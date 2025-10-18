const Student = require("../models/student");
const eventStatusService = require("../services/eventStatusService");
const Event = require("../models/event");
const AppError = require("../utils/appError");

// @desc Get Student Information by mail
// @route GET /api/admin/students/:email
// @access Private/Admin
exports.getStudentByEmail = async (req, res, next) => {
  try {
    const student = await Student.findOne({ email: req.params.email }).select(
      "-password -tokens -__v"
    );

    if (!student) {
      return next(new AppError("No student found with that email", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        student,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Manually trigger event status update
// @route   POST /api/admin/events/update-status
// @access  Private/Admin
exports.manualStatusUpdate = async (req, res) => {
  try {
    const result = await eventStatusService.manualUpdate();

    res.status(200).json({
      status: "success",
      message: "Event status update completed",
      data: {
        triggeredAt: new Date(),
        serviceStatus: eventStatusService.getStatus(),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// @desc    Get event status service info
// @route   GET /api/admin/events/status-service
// @access  Private/Admin
exports.getStatusServiceInfo = async (req, res) => {
  try {
    const statusCounts = await Event.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusSummary = {};
    statusCounts.forEach((stat) => {
      statusSummary[stat._id] = stat.count;
    });

    res.status(200).json({
      status: "success",
      data: {
        service: eventStatusService.getStatus(),
        eventSummary: statusSummary,
        totalEvents: await Event.countDocuments(),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// @desc    Get events needing status update
// @route   GET /api/admin/events/pending-updates
// @access  Private/Admin
exports.getPendingStatusUpdates = async (req, res) => {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const pendingEvents = await Event.find({
      status: { $ne: "cancelled" },
      $or: [
        { lastStatusUpdate: { $lt: fiveMinutesAgo } },
        { lastStatusUpdate: { $exists: false } },
      ],
    })
      .select("title date status lastStatusUpdate participants")
      .sort({ date: 1 })
      .limit(50);

    res.status(200).json({
      status: "success",
      results: pendingEvents.length,
      data: {
        events: pendingEvents,
        lastUpdateThreshold: fiveMinutesAgo,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
