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
      sparse: true
    },
    avatar: String,
    isVerified: {
      type: Boolean,
      default: false
    },
    tokens: {
      type: [
        {
          token: {
            type: String,
            required: true,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [], // Add this to initialize as empty array
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: function () {
        // Only require password if not using Google login
        return !this.googleId;
      },
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    branch: {
      type: String,
      required: [true, "Please specify your branch"],
      enum: ["CSE", "ECE", "EEE", "ME", "CE", "IT"],
      uppercase: true,
    },
    // Add this to your schema definition
    metaMaskAddress: {
      type: String,
      validate: {
        validator: function (v) {
          return v ? /^0x[a-fA-F0-9]{40}$/.test(v) : true;
        },
        message: (props) => `${props.value} is not a valid Ethereum address!`,
      },
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ["participant", "organizer", "admin"],
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
    active: {
      type: Boolean,
      default: true,
      select: false,
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
module.exports =mongoose.models.Student || mongoose.model("Student", StudentSchema);
