const Student = require("../models/student");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const AppError = require("../utils/appError");

// Utility function to sign JWT tokens
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Create and send token with response
const createSendToken = (student, statusCode, res) => {
  const token = signToken(student._id);
  
  // Initialize tokens array if undefined
  if (!student.tokens) {
    student.tokens = [];
  }
  
  // Store token in student's tokens array
  student.tokens.push({ token });
  
  // Save the student document
  student.save({ validateBeforeSave: false })
    .then(() => {
      // Remove sensitive data from output
      student.password = undefined;
      student.tokens = undefined;
      student.active = undefined;

      res.status(statusCode).json({
        status: "success",
        token,
        data: {
          student,
        },
      });
    })
    .catch(err => {
      res.status(500).json({
        status: "error",
        message: "Error saving token"
      });
    });
};

// @desc    Sign up a new student
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res, next) => {
  try {
    const { name, year, email, password, branch, role } = req.body;

    // 1) Check if email already exists
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      return next(new AppError("Email already in use", 400));
    }

    // 2) Create new student
    const newStudent = await Student.create({
      name,
      year,
      email,
      password,
      branch,
      role: role || "participant",
    });

    // 3) Generate JWT and send response
    createSendToken(newStudent, 201, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Login student
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
      return next(new AppError("Please provide email and password", 400));
    }

    // 2) Check if student exists and password is correct
    const student = await Student.findOne({ email, active: true }).select("+password");

    if (!student || !(await student.correctPassword(password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    // 3) If everything ok, send token to client
    createSendToken(student, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Logout student
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // Remove the current token from the student's tokens array
    req.student.tokens = req.student.tokens.filter(
      (tokenObj) => tokenObj.token !== req.token
    );
    await req.student.save();

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (err) {
    next(new AppError("Error logging out", 500));
  }
};

// @desc    Update current student details
// @route   PUT /api/auth/update-me
// @access  Private
exports.updateMe = async (req, res, next) => {
  try {
    // 1) Create error if user POSTs password data
    if (req.body.password || req.body.passwordConfirm) {
      return next(
        new AppError(
          "This route is not for password updates. Please use /update-password",
          400
        )
      );
    }

    // 2) Filtered out unwanted fields
    const filteredBody = {};
    const allowedFields = ["name", "email", "branch", "year"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        filteredBody[field] = req.body[field];
      }
    });

    // 3) Update student document
    const updatedStudent = await Student.findByIdAndUpdate(
      req.student._id,
      filteredBody,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: "success",
      data: {
        student: updatedStudent,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete current student account
// @route   DELETE /api/auth/delete-me
// @access  Private
exports.deleteMe = async (req, res, next) => {
  try {
    await Student.findByIdAndUpdate(req.student._id, { active: false });

    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (err) {
    next(new AppError("Error deleting account", 500));
  }
};

// @desc    Update password
// @route   PATCH /api/auth/update-password
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    // 1) Get student from collection
    const student = await Student.findById(req.student._id).select("+password");

    // 2) Check if POSTed current password is correct
    if (!(await student.correctPassword(req.body.currentPassword))) {
      return next(new AppError("Your current password is wrong", 401));
    }

    // 3) If so, update password
    student.password = req.body.newPassword;
    student.passwordChangedAt = Date.now() - 1000;
    await student.save();

    // 4) Log student in, send JWT
    createSendToken(student, 200, res);
  } catch (err) {
    next(err);
  }
};