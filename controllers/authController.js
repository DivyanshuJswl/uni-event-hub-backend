const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const AppError = require("../utils/appError");
const Student = require("../models/student");

// Initialize the client properly
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Utility function to sign JWT tokens
const signToken = (student) => {
  const payload = {
    id: student._id,
    email: student.email,
    role: student.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Send token response
const sendTokenResponse = (student, token, statusCode, res) => {
  const studentResponse = {
    _id: student._id,
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
    createdAt: student.createdAt,
  };

  // Set cookie if needed
  res.cookie("jwt", token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "development",
  });

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
  console.log(`Token generated for student ${student.email}: ${token}`);

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

// Verify captcha
const verifyCaptcha = async (token) => {
  if (process.env.NODE_ENV === "test") return true;
  try {
    const response = await axios.post(
      "https://hcaptcha.com/siteverify",
      new URLSearchParams({
        secret: process.env.HCAPTCHA_SECRET_KEY,
        response: token,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      }
    );
    return response.data.success;
  } catch (error) {
    console.error("Captcha verification failed:", error);
    return false;
  }
};

// @desc    Sign up a new student
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res, next) => {
  try {
    const { name, year, email, password, branch, role, captchaToken } =
      req.body;

    // Validate required fields
    if (!name || !year || !email || !password || !branch) {
      return next(new AppError("All fields are required", 400));
    }

    // 1) Validate captcha token if provided and required
    if (
      process.env.REQUIRE_CAPTCHA === "true" &&
      !(await verifyCaptcha(captchaToken))
    ) {
      return res.status(400).json({ message: "Captcha verification failed" });
    }

    // Check if email exists
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      return next(new AppError("Email already in use", 400));
    }

    const newStudent = await Student.create({
      name: name.trim(),
      year: parseInt(year),
      email: email.toLowerCase().trim(),
      password,
      branch: branch.toUpperCase(),
      role: role || "participant",
    });

    // 4) Generate JWT and send response
    createSendToken(newStudent, 201, res);
  } catch (err) {
    // Handle duplicate key error
    if (err.code === 11000) {
      return next(new AppError("Email already in use", 400));
    }
    // Handle validation errors
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((error) => error.message);
      return next(new AppError(messages.join(", "), 400));
    }
    next(err);
  }
};

// @desc    Login student
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password, captchaToken } = req.body;

    if (!email || !password) {
      return next(new AppError("Please provide email and password", 400));
    }

    // Verify captcha
    if (process.env.REQUIRE_CAPTCHA === "true") {
      if (!captchaToken) {
        return next(new AppError("Captcha token is required", 400));
      }

      const captchaValid = await verifyCaptcha(captchaToken);
      if (!captchaValid) {
        return next(new AppError("Captcha verification failed", 400));
      }
    }

    // Find student with password
    const student = await Student.findOne({
      email: email.toLowerCase().trim(),
      active: true,
    }).select("+password +loginAttempts +lockUntil");

    if (!student) {
      return next(new AppError("Invalid email or password", 401));
    }

    // Check if account is locked
    if (student.isLocked) {
      return next(
        new AppError("Account temporarily locked. Try again later.", 423)
      );
    }

    // Verify password
    const isPasswordCorrect = await student.correctPassword(password);

    if (!isPasswordCorrect) {
      await student.incrementLoginAttempts();
      return next(new AppError("Invalid email or password", 401));
    }

    // Reset login attempts on successful login
    await student.resetLoginAttempts();
    createSendToken(student, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc Google Login
// @route POST /api/auth/google
// @desc Public
exports.googleLogin = async (req, res) => {
  console.log("Google Client ID:", process.env.GOOGLE_CLIENT_ID);

  try {
    const { credential } = req.body;

    if (!credential) {
      console.error("No credential provided in request body");
      return res.status(400).json({
        status: "fail",
        message: "Missing ID token",
        solution: "Ensure frontend sends credential parameter",
      });
    }

    // Verify token structure first
    if (!credential.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/)) {
      console.error(
        "Invalid JWT format received:",
        credential.slice(0, 20) + "..."
      );
      return res.status(400).json({
        status: "fail",
        message: "Invalid token format",
        expected: "JWT ID Token (starts with eyJ...)",
      });
    }

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    console.log("Successful authentication for:", payload.email);
    const { email, name, picture, sub: googleId } = payload;

    let student = await Student.findOne({ email });
    let isNewUser = false;

    if (!student) {
      isNewUser = true;
      student = new Student({
        name,
        email,
        googleId,
        avatar: picture,
        role: "participant",
        year: 1,
        branch: "CSE",
        password: crypto.randomBytes(16).toString("hex"), // Dummy password for schema validation
        isVerified: true,
      });
      await student.save();
    } else if (!student.googleId) {
      // Merge existing account with Google auth
      student.googleId = googleId;
      student.avatar = picture;
      student.isVerified = true;
      await student.save();
    }

    // Use the same signToken function for consistency
    const token = signToken(student);

    // For Google users, we might not need to save to tokens array
    // But let's maintain consistency with your existing approach
    if (student.tokens !== undefined) {
      if (!student.tokens) {
        student.tokens = [];
      }
      student.tokens.push({ token });
      await student.save({ validateBeforeSave: false });
    }

    // Create response matching your other auth endpoints
    const studentResponse = {
      _id: student._id,
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
    };

    res.status(200).json({
      status: "success",
      token,
      isNewUser,
      data: {
        student: studentResponse,
      },
    });
  } catch (error) {
    console.error("Complete authentication error:", {
      message: error.message,
      tokenReceived: req.body.credential
        ? req.body.credential.slice(0, 20) + "..."
        : "none",
      stack: error.stack,
    });

    res.status(401).json({
      status: "fail",
      message: "Authentication failed",
      details: error.message,
      required: "Valid Google ID Token (JWT)",
      solution: "Check frontend is sending credentialResponse.credential",
    });
  }
};

// @desc    Logout student
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(200).json({
        status: "success",
        message: "Logged out successfully",
      });
    }

    // Remove the current token
    req.student.tokens = req.student.tokens.filter(
      (tokenObj) => tokenObj.token !== token
    );

    await req.student.save({ validateBeforeSave: false });

    // Clear cookie
    res.clearCookie("jwt");

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (err) {
    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  }
};

// @desc    Get current user
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

// @desc    Update current user profile
// @route   PATCH /api/auth/update-me
// @access  Private
exports.updateMe = async (req, res, next) => {
  try {
    // Filter out restricted fields
    const restrictedFields = [
      "password",
      "role",
      "active",
      "tokens",
      "googleId",
    ];
    restrictedFields.forEach((field) => delete req.body[field]);

    // Validate email if being updated
    if (req.body.email && req.body.email !== req.student.email) {
      const existingStudent = await Student.findOne({
        email: req.body.email.toLowerCase().trim(),
      });
      if (existingStudent) {
        return next(new AppError("Email already in use", 400));
      }
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      req.student._id,
      req.body,
      {
        new: true,
        runValidators: true,
        context: "query",
      }
    );

    if (!updatedStudent) {
      return next(new AppError("User not found", 404));
    }
    if (req.token) {
      sendTokenResponse(updatedStudent, req.token, 200, res);
    } else {
      res.status(200).json({
        status: "success",
        data: {
          student: updatedStudent,
        },
      });
    }
  } catch (err) {
    if (err.code === 11000) {
      return next(new AppError("Email already in use", 400));
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((error) => error.message);
      return next(new AppError(messages.join(", "), 400));
    }
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

const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

// @desc    Upload avatar for student
// @route   PATCH /api/user/avatar
// @access  Private
exports.uploadAvatar = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file) {
      return next(new AppError("Please upload an image file", 400));
    }

    // Check file size (additional validation)
    if (req.file.size > 5 * 1024 * 1024) {
      return next(
        new AppError("File size too large. Maximum 5MB allowed.", 400)
      );
    }

    // Upload to Cloudinary using promise-based approach
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "avatars",
          resource_type: "image",
          public_id: `student_${req.student._id}_${Date.now()}`,
          transformation: [
            { width: 500, height: 500, crop: "limit" },
            { quality: "auto" },
            { format: "auto" },
          ],
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
      status: "success",
      message: "Avatar uploaded successfully",
      avatarUrl: result.secure_url,
    });
  } catch (err) {
    next(new AppError("Error uploading avatar: " + err.message, 500));
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
      status: "success",
      message: "Avatar removed successfully",
    });
  } catch (err) {
    next(new AppError("Error removing avatar: " + err.message, 500));
  }
};

// @desc    Change role
// @route   PATCH /api/auth/upgrade-to-organizer
// @access  Private
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
