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
    }
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

// Virtual for checking if event is full
EventSchema.virtual("isFull").get(function () {
  return this.participants.length >= this.maxParticipants;
});

// Virtual for participant count
EventSchema.virtual("participantCount").get(function () {
  return this.participants.length;
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

module.exports = mongoose.model("Event", EventSchema);
