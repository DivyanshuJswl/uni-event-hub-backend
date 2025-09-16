const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const Student = require("../models/student");
const Event = require("../models/event");

class AuthError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  // Protect routes
  protect: async (req, res, next) => {
    try {
      let token;

      // Check for token in headers
      if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
      ) {
        token = req.headers.authorization.split(" ")[1];
      }

      // Check if token exists
      if (!token) {
        return next(new AppError("Not authorized to access this route", 401));
      }

      try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get student from token
        const student = await Student.findById(decoded.id);

        if (!student) {
          return next(new AppError("No student found with this ID", 404));
        }

        // Check if student changed password after token was issued
        if (student.changedPasswordAfter(decoded.iat)) {
          return next(
            new AppError("Password recently changed. Please log in again.", 401)
          );
        }

        // 5) Check if token exists in student's tokens array
        const tokenExists = student.tokens.some(
          (tokenObj) => tokenObj.token === token
        );
        if (!tokenExists) {
          throw new AuthError("Invalid token. Please log in again.", 401);
        }

        // Add student to request object
        req.user = student;
        req.token = token;
        next();
      } catch (error) {
        return next(new AppError("Not authorized to access this route", 401));
      }
    } catch (error) {
      next(error);
    }
  },

  // Restrict to specific roles
  restrictTo: (...roles) => {
    return (req, res, next) => {
      try {
        if (!roles.includes(req.student.role)) {
          throw new AuthError(
            "You do not have permission to perform this action",
            403
          );
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  },

  // Admin-only access
  restrictToAdmin: (req, res, next) => {
    try {
      if (req.student.role !== "admin") {
        throw new AuthError("Admin access required for this action", 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  },

  // Check event ownership
  isEventOrganizer: async (req, res, next) => {
    try {
      const event = await Event.findById(req.params.eventId);

      if (!event) {
        throw new AuthError("No event found with that ID", 404);
      }

      if (!event.organizer.equals(req.student._id)) {
        throw new AuthError("You are not the organizer of this event", 403);
      }

      req.event = event;
      next();
    } catch (err) {
      next(err);
    }
  },

  // Check wallet ownership (for MetaMask updates)
  isWalletOwner: async (req, res, next) => {
    try {
      const student = await Student.findById(req.params.id);

      if (!student) {
        throw new AuthError("No student found with that ID", 404);
      }

      if (
        !student._id.equals(req.student._id) &&
        req.student.role !== "admin"
      ) {
        throw new AuthError(
          "You are not authorized to modify this wallet",
          403
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  // Error handling middleware
  handleErrors: (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      ...(process.env.NODE_ENV === "development" && {
        stack: err.stack,
        error: err,
      }),
    });
  },
};
