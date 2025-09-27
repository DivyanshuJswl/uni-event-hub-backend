const mongoose = require("mongoose");

const LogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    method: {
      type: String,
      required: true,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      index: true,
    },
    url: {
      type: String,
      required: true,
      index: true,
    },
    path: {
      type: String,
      index: true,
    },
    ip: {
      type: String,
      required: true,
    },
    userAgent: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      index: true,
      sparse: true,
    },
    userEmail: {
      type: String,
      index: true,
      sparse: true,
    },
    userRole: {
      type: String,
      enum: ["admin", "organizer", "participant", "anonymous"],
      default: "anonymous",
      index: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    statusMessage: String,
    responseTime: {
      type: Number, // milliseconds
      required: true,
    },
    responseSize: Number, // bytes
    requestHeaders: mongoose.Schema.Types.Mixed,
    requestBody: mongoose.Schema.Types.Mixed,
    responseBody: mongoose.Schema.Types.Mixed,
    queryParams: mongoose.Schema.Types.Mixed,
    routeParams: mongoose.Schema.Types.Mixed,
    error: {
      message: String,
      code: Number,
      stack: String,
    },
    isError: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Set isError based on status code
LogSchema.pre("save", function (next) {
  this.isError = this.statusCode >= 400;
  next();
});

// Compound indexes
LogSchema.index({ timestamp: -1 });
LogSchema.index({ userId: 1, timestamp: -1 });
LogSchema.index({ method: 1, statusCode: 1 });
LogSchema.index({ isError: 1, timestamp: -1 });
LogSchema.index({ path: 1, timestamp: -1 });

// Virtuals
LogSchema.virtual("durationSeconds").get(function () {
  return (this.responseTime / 1000).toFixed(2);
});

LogSchema.virtual("responseSizeKB").get(function () {
  return this.responseSize ? (this.responseSize / 1024).toFixed(2) : 0;
});

// Static methods
LogSchema.statics.cleanupOldLogs = async function (days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return await this.deleteMany({
    timestamp: { $lt: cutoffDate },
  });
};

// Get dashboard statistics
LogSchema.statics.getDashboardStats = async function (days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate },
        statusCode: { $ne: 304 }, // Exclude 304 responses
      },
    },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        errorCount: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
        avgResponseTime: { $avg: "$responseTime" },
        uniqueUsers: { $addToSet: "$userId" },
        totalBandwidth: { $sum: "$responseSize" },
      },
    },
    {
      $project: {
        totalRequests: 1,
        errorCount: 1,
        errorRate: {
          $round: [
            {
              $multiply: [{ $divide: ["$errorCount", "$totalRequests"] }, 100],
            },
            2,
          ],
        },
        avgResponseTime: { $round: ["$avgResponseTime", 2] },
        uniqueUsers: { $size: "$uniqueUsers" },
        totalBandwidthMB: {
          $round: [{ $divide: ["$totalBandwidth", 1024 * 1024] }, 2],
        },
      },
    },
  ]);
};

module.exports = mongoose.model("Log", LogSchema);
