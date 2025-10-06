const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const StudentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a name"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
      validate: {
        validator: function (name) {
          return name.trim().length > 0;
        },
        message: "Name cannot be empty",
      },
    },
    year: {
      type: Number,
      required: [true, "Please specify your academic year"],
      min: [1, "Year must be at least 1"],
      max: [5, "Year cannot exceed 5"],
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    avatar: {
      type: String,
      validate: {
        validator: function (url) {
          if (!url) return true; // Optional field
          return /^https?:\/\/.+\..+/.test(url);
        },
        message: "Please provide a valid avatar URL",
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    tokens: [
      {
        token: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
          // expires: 86400, // Auto-expire tokens after 24 hours
        },
      },
    ],
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (email) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email);
        },
        message: "Please provide a valid email",
      },
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
      validate: {
        validator: function (password) {
          if (!this.googleId && (!password || password.length < 8)) {
            return false;
          }
          return true;
        },
        message:
          "Password is required and must be at least 8 characters for non-Google accounts",
      },
    },
    branch: {
      type: String,
      required: [true, "Please specify your branch"],
      enum: {
        values: ["CSE", "ECE", "EEE", "ME", "CE", "IT"],
        message: "Branch must be one of: CSE, ECE, EEE, ME, CE, IT",
      },
      uppercase: true,
    },
    metaMaskAddress: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^0x[a-fA-F0-9]{40}$/.test(v);
        },
        message: "Invalid Ethereum address format",
      },
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: {
        values: ["participant", "organizer", "admin"],
        message: "Role must be participant, organizer, or admin",
      },
      default: "participant",
    },
    enrolledEvents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
      },
    ],
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    lastLoginAt: Date,
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      select: false,
    },
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.tokens;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.tokens;
        return ret;
      },
    },
  }
);

// Virtual for account lock status
StudentSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Password hashing middleware - IMPROVED
StudentSchema.pre("save", async function (next) {
  try {
    // Only run if password was modified
    if (!this.isModified("password")) return next();
    // Hash the password with cost of 12
    this.password = await bcrypt.hash(this.password, 12);

    // Set passwordChangedAt
    this.passwordChangedAt = Date.now() - 1000; // Subtract 1s to ensure token works

    next();
  } catch (err) {
    next(err);
  }
});

// Instance method to compare passwords - IMPROVED
StudentSchema.methods.correctPassword = async function (candidatePassword) {

  if (!candidatePassword || !this.password) {
    return false;
  }

  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if password changed after token was issued
StudentSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to create password reset token
StudentSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Increment login attempts
StudentSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return await this.updateOne(updates);
};

// Reset login attempts on successful login
StudentSchema.methods.resetLoginAttempts = async function () {
  return await this.updateOne({
    $set: { lastLoginAt: new Date() },
    $unset: {
      loginAttempts: 1,
      lockUntil: 1,
    },
  });
};

// Query middleware to filter out inactive students
StudentSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

StudentSchema.methods.upgradeToOrganizer = function () {
  this.role = "organizer";
  return this.save();
};
module.exports =mongoose.models.Student || mongoose.model("Student", StudentSchema);
