const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const Student = require('../models/student');
const Event = require('../models/event');

class AuthError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  // Verify JWT and protect routes
  protect: async (req, res, next) => {
    try {
      // 1) Get token from header or cookie
      let token;
      if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
      ) {
        token = req.headers.authorization.split(' ')[1];
      } else if (req.cookies?.jwt) {
        token = req.cookies.jwt;
      }

      if (!token) {
        throw new AuthError('You are not logged in! Please log in to get access.', 401);
      }

      // 2) Verify token
      const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

      // 3) Check if student exists and is active
      const currentStudent = await Student.findOne({
        _id: decoded.id,
        active: { $ne: false }
      });
      
      if (!currentStudent) {
        throw new AuthError('The student belonging to this token no longer exists.', 401);
      }

      // 4) Check if password was changed after token was issued
      if (currentStudent.changedPasswordAfter(decoded.iat)) {
        throw new AuthError('Student recently changed password! Please log in again.', 401);
      }

      // 5) Check if token exists in student's tokens array
      const tokenExists = currentStudent.tokens.some(
        tokenObj => tokenObj.token === token
      );
      if (!tokenExists) {
        throw new AuthError('Invalid token. Please log in again.', 401);
      }

      // 6) Grant access
      req.student = currentStudent;
      req.token = token;
      next();
    } catch (err) {
      next(err);
    }
  },

  // Restrict to specific roles
  restrictTo: (...roles) => {
    return (req, res, next) => {
      try {
        if (!roles.includes(req.student.role)) {
          throw new AuthError('You do not have permission to perform this action', 403);
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
      if (req.student.role !== 'admin') {
        throw new AuthError('Admin access required for this action', 403);
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
        throw new AuthError('No event found with that ID', 404);
      }

      if (!event.organizer.equals(req.student._id)) {
        throw new AuthError('You are not the organizer of this event', 403);
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
        throw new AuthError('No student found with that ID', 404);
      }

      if (!student._id.equals(req.student._id) && req.student.role !== 'admin') {
        throw new AuthError('You are not authorized to modify this wallet', 403);
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  // Error handling middleware
  handleErrors: (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        error: err 
      })
    });
  }
};