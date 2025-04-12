const Student = require("../models/student");
const AppError = require("../utils/appError");

exports.upgradeToOrganizer = async (req, res, next) => {
  try {
    // 1) Check if already an organizer
    if (req.student.role === "organizer") {
      return next(new AppError("You are already an organizer", 400));
    }

    // 2) Upgrade to organizer
    const student = await Student.findByIdAndUpdate(
      req.student._id,
      { role: "organizer" },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: "success",
      message: "You are now an organizer!",
      data: {
        student: {
          id: student._id,
          name: student.name,
          role: student.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
