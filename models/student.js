const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const EventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    date: {
      type: Date,
      required: [true, "Event date is required"],
      validate: {
        validator: function (value) {
          return value > Date.now() - 60000; // 1 minute buffer
        },
        message: "Event date must be at least 1 minute in the future",
      },
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    maxParticipants: {
      type: Number,
      min: [1, "At least 1 participant required"],
      default: 50,
    },
    category: {
      type: String,
      enum: [
        "workshop",
        "seminar",
        "social",
        "hackathon",
        "cultural",
        "technology",
      ],
      lowercase: true,
      required: true,
    },
    eventURL: {
      type: String,
      trim: true,
    },
    enableRegistration: {
      type: Boolean,
      default: true,
    },
    digitalCertificates: {
      type: Boolean,
      default: false,
    },
    sendReminders: {
      type: Boolean,
      default: false,
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],
    status: {
      type: String,
      enum: ["upcoming", "ongoing", "completed", "cancelled"],
      default: "upcoming",
    },
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: String,
        width: Number,
        height: Number,
        format: String,
        bytes: Number,
        isFeatured: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    imageUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Password hashing middleware
StudentSchema.pre("save", async function (next) {
  try {
    // Only run if password was modified
    if (!this.isModified("password")) return next();

    // Hash the password with cost of 12
    this.password = await bcrypt.hash(this.password, 12);

    // Set passwordChangedAt for new users
    if (!this.isNew) {
      this.passwordChangedAt = Date.now() - 1000;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Instance method to compare passwords
StudentSchema.methods.correctPassword = async function (candidatePassword) {
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

// Query middleware to filter out inactive students
StudentSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

StudentSchema.methods.upgradeToOrganizer = function () {
  this.role = "organizer";
  return this.save();
};
module.exports =
  mongoose.models.Student || mongoose.model("Student", StudentSchema);
