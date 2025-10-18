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
          const nowUTC = Date.now();
          const eventUTCTime = new Date(value).getTime();
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
    eventURL: String,
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
      default: true,
    },
    completedAt: {
      type: Date,
    },
    lastStatusUpdate: {
      type: Date,
      default: Date.now,
    },
    statusUpdateCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Virtual for checking if event is full - FIXED
EventSchema.virtual("isFull").get(function () {
  const participants = this.participants || [];
  return participants.length >= this.maxParticipants;
});

// Virtual for participant count - FIXED
EventSchema.virtual("participantCount").get(function () {
  const participants = this.participants || [];
  return participants.length;
});

// Virtual for days until event
EventSchema.virtual("daysUntil").get(function () {
  const now = new Date();
  const eventDate = new Date(this.date);
  const diffTime = eventDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Indexes for better query performance
EventSchema.index({ date: 1 });
EventSchema.index({ organizer: 1 });
EventSchema.index({ category: 1 });
EventSchema.index({ status: 1 });
EventSchema.index({ lastStatusUpdate: 1 });

// Middleware to validate organizer role
EventSchema.pre("save", async function (next) {
  if (this.isNew) {
    const organizer = await mongoose.model("Student").findById(this.organizer);
    if (!organizer) {
      throw new Error("Organizer not found");
    }
    if (organizer.role !== "organizer" && organizer.role !== "admin") {
      throw new Error("Only organizers or admins can create events");
    }
  }
  next();
});

// Add a method to check if a student is registered
EventSchema.methods.isStudentRegistered = function (studentId) {
  return this.participants.some((participant) =>
    participant._id
      ? participant._id.toString() === studentId.toString()
      : false
  );
};

// Add instance method to update individual event status
EventSchema.methods.updateStatus = function () {
  const now = new Date();
  const eventTime = new Date(this.date);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  let newStatus = this.status;

  if (this.status === "cancelled") {
    return; // Don't update cancelled events
  }

  if (eventTime <= thirtyMinutesAgo) {
    newStatus = "completed";
  } else if (eventTime <= now) {
    newStatus = "ongoing";
  } else {
    newStatus = "upcoming";
  }

  // Only update if status changed
  if (newStatus !== this.status) {
    this.status = newStatus;
    this.lastStatusUpdate = now;
    this.statusUpdateCount += 1;

    if (newStatus === "completed") {
      this.completedAt = now;
    } else {
      this.completedAt = undefined;
    }
  }
};

// Static method for bulk status update
EventSchema.statics.updateEventsStatus = async function () {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const result = {
    updated: 0,
    completed: 0,
    ongoing: 0,
    upcoming: 0,
  };

  try {
    // Get all events that might need status update
    const events = await this.find({
      status: { $ne: "cancelled" },
      $or: [
        { lastStatusUpdate: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } }, // Not updated in last 5 min
        { lastStatusUpdate: { $exists: false } },
      ],
    });

    for (const event of events) {
      const previousStatus = event.status;
      event.updateStatus();

      if (event.isModified("status")) {
        await event.save();
        result.updated++;

        switch (event.status) {
          case "completed":
            result.completed++;
            break;
          case "ongoing":
            result.ongoing++;
            break;
          case "upcoming":
            result.upcoming++;
            break;
        }

        console.log(
          `Event ${event.title} status changed: ${previousStatus} → ${event.status}`
        );
      }
    }

    return result;
  } catch (error) {
    console.error("Error in bulk status update:", error);
    throw error;
  }
};

module.exports = mongoose.model("Event", EventSchema);
