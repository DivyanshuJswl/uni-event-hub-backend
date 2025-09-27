// controllers/logController.js
const Log = require("../models/Log");
const AppError = require("../utils/appError");

// @desc    Get API logs with filtering
// @route   GET /api/admin/logs
// @access  Private (Admin only)
exports.getLogs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      sort = "-timestamp",
      method,
      statusCode,
      userEmail,
      url,
      startDate,
      endDate,
      minDuration,
    } = req.query;

    // Build filter object
    const filter = {};

    if (method) filter.method = method.toUpperCase();
    if (statusCode) filter.statusCode = parseInt(statusCode);
    if (userEmail) filter.userEmail = new RegExp(userEmail, "i");
    if (url) filter.url = new RegExp(url, "i");
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }
    if (minDuration) filter.responseTime = { $gte: parseInt(minDuration) };

    // Execute query
    const logs = await Log.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select("-__v");

    const total = await Log.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: logs.length,
      data: {
        logs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get statistics for dashboard
// @route   GET /api/admin/logs/stats
// @access  Private (Admin only)
exports.getLogStats = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const stats = await Log.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          averageResponseTime: { $avg: "$responseTime" },
          errorCount: {
            $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] },
          },
          uniqueUsers: { $addToSet: "$userId" },
          methods: { $push: "$method" },
        },
      },
      {
        $project: {
          totalRequests: 1,
          averageResponseTime: { $round: ["$averageResponseTime", 2] },
          errorRate: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$errorCount", "$totalRequests"] },
                  100,
                ],
              },
              2,
            ],
          },
          uniqueUserCount: { $size: "$uniqueUsers" },
          methodDistribution: {
            $arrayToObject: {
              $map: {
                input: { $setUnion: ["$methods"] },
                as: "method",
                in: {
                  k: "$$method",
                  v: {
                    $size: {
                      $filter: {
                        input: "$methods",
                        as: "m",
                        cond: { $eq: ["$$m", "$$method"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        stats: stats[0] || {},
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Clean up old logs
// @route   DELETE /api/admin/logs/cleanup
// @access  Private (Admin only)
exports.cleanupLogs = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;

    const result = await Log.cleanupOldLogs(parseInt(days));

    res.status(200).json({
      status: "success",
      message: `Cleaned up ${result.deletedCount} logs older than ${days} days`,
      data: {
        deletedCount: result.deletedCount,
      },
    });
  } catch (err) {
    next(err);
  }
};
