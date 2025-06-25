const mongoose = require("mongoose");

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
          // Get current time in UTC milliseconds
          const nowUTC = Date.now();

          // Convert input date to UTC milliseconds
          const eventUTCTime = new Date(value).getTime();
          // Add 1 minute buffer for processing time
          return eventUTCTime > nowUTC - 60000;
        },
        message:
          "Event date must be at least 1 minute in the future (UTC time)",
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
    featuredImage: {
      url: String,
      publicId: String,
      width: Number,
      height: Number,
      format: String,
      bytes: Number,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for checking if event is full
EventSchema.virtual("isFull").get(function () {
  return this.participants.length >= this.maxParticipants;
});

// Indexes for better query performance
EventSchema.index({ date: 1 });
EventSchema.index({ organizer: 1 });
EventSchema.index({ category: 1 });
EventSchema.index({ status: 1 });

// Middleware to validate organizer role
EventSchema.pre("save", async function (next) {
  if (this.isNew) {
    // Only check for new events
    const organizer = await mongoose.model("Student").findById(this.organizer);
    if (!organizer || organizer.role !== "organizer") {
      throw new Error("Only organizers can create events");
    }
  }
  next();
});

module.exports = mongoose.model("Event", EventSchema);
