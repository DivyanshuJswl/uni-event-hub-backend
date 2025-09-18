const jwt = require("jsonwebtoken");
const AppError = require("../utils/appError");
const axios = require("axios");
const Student = require("../models/student");

// Utility function to sign JWT tokens with complete student data
const signToken = (student) => {
  // Create safe payload without sensitive data
  const payload = {
    id: student._id,
    _id: student._id,
    name: student.name,
    year: student.year,
    isVerified: student.isVerified,
    email: student.email,
    branch: student.branch,
    role: student.role,
    enrolledEvents: student.enrolledEvents,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    googleId: student.googleId,
    avatar: student.avatar,
    metaMaskAddress: student.metaMaskAddress,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Helper function to send token response
const sendTokenResponse = (student, token, statusCode, res) => {
  // Create safe response object without sensitive data
  const studentResponse = {
    id: student._id.toString(),
    name: student.name,
    year: student.year,
    isVerified: student.isVerified,
    email: student.email,
    branch: student.branch,
    role: student.role,
    enrolledEvents: student.enrolledEvents,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    googleId: student.googleId,
    avatar: student.avatar,
    metaMaskAddress: student.metaMaskAddress,
  };

  console.log(`Token generated for student ${student.email}: ${token}`);

  res.status(statusCode).json({
    status: true,
    token,
    student: studentResponse,
    role: student.role,
  });
};

// Create and send token with response
const createSendToken = (student, statusCode, res) => {
  const token = signToken(student);

  // Initialize tokens array if undefined
  if (!student.tokens) {
    student.tokens = [];
  }

  // Store token in student's tokens array
  student.tokens.push({ token });

  // Save the student document
  student
    .save({ validateBeforeSave: false })
    .then(() => {
      sendTokenResponse(student, token, statusCode, res);
    })
    .catch((err) => {
      console.error("Error saving token:", err);
      res.status(500).json({
        status: "error",
        message: "Error saving token",
      });
    });
};

// @desc    Verify hCaptcha token
async function verifyCaptcha(token) {
  try {
    const response = await axios.post(
      "https://hcaptcha.com/siteverify",
      new URLSearchParams({
        secret: process.env.HCAPTCHA_SECRET_KEY,
        response: token,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return response.data.success;
  } catch (error) {
    console.error("Captcha verification failed:", error);
    return false;
  }
}

// @desc    Sign up a new student
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res, next) => {
  try {
    const { name, year, email, password, branch, role, captchaToken } =
      req.body;

    // 1) Validate captcha token if provided and required
    if (
      process.env.REQUIRE_CAPTCHA === "true" &&
      !(await verifyCaptcha(captchaToken))
    ) {
      return res.status(400).json({ message: "Captcha verification failed" });
    }

    // 2) Check if email already exists
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      return next(new AppError("Email already in use", 400));
    }

    // 3) Create new student
    const newStudent = await Student.create({
      name,
      year,
      email,
      password,
      branch,
      role: role || "participant",
    });

    // 4) Generate JWT and send response
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
    const { email, password, captchaToken } = req.body;

    // 1) Validate captcha token if provided and required
    if (
      process.env.REQUIRE_CAPTCHA === "true" &&
      !(await verifyCaptcha(captchaToken))
    ) {
      return res.status(400).json({ message: "Captcha verification failed" });
    }

    // 2) Check if email and password exist
    if (!email || !password) {
      return next(new AppError("Please provide email and password", 400));
    }

    // 3) Check if student exists and password is correct
    const student = await Student.findOne({ email, active: true }).select(
      "+password"
    );

    if (!student) {
      return next(new AppError("Incorrect email or password", 401));
    }

    // Check if this is a Google account trying to use password login
    if (student.googleId) {
      return next(
        new AppError("Please use Google login for this account", 401)
      );
    }

    // Verify password
    if (!(await student.correctPassword(password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    // 4) If everything ok, send token to client
    createSendToken(student, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Logout student (clear token)
// @route   POST /api/auth/logout
// @access  Private

// Utility function to verify and decode JWT token
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error("Error verifying token:", error.message);
    return null;
  }
};

// Updated logout function using token decoding
exports.logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(400).json({
        status: "fail",
        message: "No token provided",
      });
    }

    // Decode token to get user ID
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid token",
      });
    }

    const userId = decoded._id || decoded.id;
    const student = await Student.findById(userId);

    if (!student) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Remove the current token from tokens array
    student.tokens = student.tokens.filter(
      (tokenObj) => tokenObj.token !== token
    );

    await student.save({ validateBeforeSave: false });

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Error during logout",
    });
  }
};

// @desc    Get current user from JWT token
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const student = await Student.findById(req.student._id);

    if (!student) {
      return next(new AppError("User not found", 404));
    }

    sendTokenResponse(student, req.token, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Update current user profile
// @route   PATCH /api/auth/update-me
// @access  Private
exports.updateMe = async (req, res, next) => {
  try {
    const { name, year, branch } = req.body;

    // Filter allowed fields to update
    const filteredBody = {};
    if (name) filteredBody.name = name;
    if (year) filteredBody.year = year;
    if (branch) filteredBody.branch = branch;

    const student = await Student.findByIdAndUpdate(
      req.student._id,
      filteredBody,
      { new: true, runValidators: true }
    );

    if (!student) {
      return next(new AppError("User not found", 404));
    }

    sendTokenResponse(student, req.token, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Change password
// @route   PATCH /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new AppError("Please provide current and new password", 400));
    }

    const student = await Student.findById(req.student._id).select("+password");

    if (!(await student.correctPassword(currentPassword))) {
      return next(new AppError("Current password is incorrect", 401));
    }

    student.password = newPassword;
    await student.save();

    // Generate new token after password change
    createSendToken(student, 200, res);
  } catch (err) {
    next(err);
  }
};

// // @desc    Update current student details
// // @route   PUT /api/auth/update-me
// // @access  Private
// exports.updateMe = async (req, res, next) => {
//   try {
//     // 1) Create error if user POSTs password data
//     if (req.body.password || req.body.passwordConfirm) {
//       return next(
//         new AppError(
//           "This route is not for password updates. Please use /update-password",
//           400
//         )
//       );
//     }

//     // 2) Filtered out unwanted fields
//     const filteredBody = {};
//     const allowedFields = ["name", "email", "branch", "year"];
//     allowedFields.forEach((field) => {
//       if (req.body[field] !== undefined) {
//         filteredBody[field] = req.body[field];
//       }
//     });

//     // 3) Update student document
//     const updatedStudent = await Student.findByIdAndUpdate(
//       req.student._id,
//       filteredBody,
//       { new: true, runValidators: true }
//     );

//     res.status(200).json({
//       status: "success",
//       data: {
//         student: updatedStudent,
//       },
//     });
//   } catch (err) {
//     next(err);
//   }
// };

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

const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// @desc    Upload avatar for student
// @route   PATCH /api/user/avatar
// @access  Private
exports.uploadAvatar = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file) {
      return next(new AppError('Please upload an image file', 400));
    }

    // Check file size (additional validation)
    if (req.file.size > 5 * 1024 * 1024) {
      return next(new AppError('File size too large. Maximum 5MB allowed.', 400));
    }

    // Upload to Cloudinary using promise-based approach
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'avatars',
          resource_type: 'image',
          public_id: `student_${req.student._id}_${Date.now()}`,
          transformation: [
            { width: 500, height: 500, crop: 'limit' },
            { quality: 'auto' },
            { format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      // Pipe the file buffer to Cloudinary
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    // Wait for the upload to complete
    const result = await uploadPromise;

    // Update student's avatar in database
    await Student.findByIdAndUpdate(
      req.student._id,
      { avatar: result.secure_url },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: 'success',
      message: 'Avatar uploaded successfully',
      avatarUrl: result.secure_url
    });
  } catch (err) {
    next(new AppError('Error uploading avatar: ' + err.message, 500));
  }
};

exports.deleteAvatar = async (req, res, next) => {
  try {
    // Set avatar to null or default
    await Student.findByIdAndUpdate(
      req.student._id,
      { avatar: null },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: 'success',
      message: 'Avatar removed successfully'
    });
  } catch (err) {
    next(new AppError('Error removing avatar: ' + err.message, 500));
  }
};
