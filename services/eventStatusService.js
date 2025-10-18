// services/eventStatusService.js - Updated version
const Event = require("../models/event");
const cron = require("node-cron");

class EventStatusService {
  constructor() {
    this.isRunning = false;
    this.updateInterval = process.env.EVENT_STATUS_UPDATE_INTERVAL || "5"; // minutes
    this.enabled = process.env.ENABLE_AUTO_STATUS_UPDATES !== "false";
    this.init();
  }

  init() {
    if (!this.enabled) {
      console.log("⏸️  Auto event status updates are disabled");
      return;
    }

    // Schedule status updates based on config
    const cronExpression = `*/${this.updateInterval} * * * *`;

    cron.schedule(cronExpression, () => {
      this.updateAllEventStatuses();
    });

    // Run once on server start after a delay
    setTimeout(() => {
      this.updateAllEventStatuses();
    }, 10000);

    console.log(
      `🔄 Event Status Service initialized - Auto-update every ${this.updateInterval} minutes`
    );
  }

  async updateAllEventStatuses() {
    if (this.isRunning) {
      console.log("⏳ Event status update already in progress...");
      return;
    }

    this.isRunning = true;
    const now = new Date();

    try {
      console.log(
        `🔄 Starting automated event status update at ${now.toISOString()}`
      );

      let updatedCount = 0;

      // Update ongoing events (events that started in last 30 minutes and are still active)
      const ongoingThreshold = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
      const ongoingResult = await Event.updateMany(
        {
          status: { $in: ["upcoming", "ongoing"] },
          date: {
            $lte: now,
            $gte: ongoingThreshold,
          },
        },
        {
          status: "ongoing",
          $set: { lastStatusUpdate: now },
        }
      );
      updatedCount += ongoingResult.modifiedCount;
      console.log(`🟡 Marked ${ongoingResult.modifiedCount} events as ongoing`);

      // Update completed events (events that ended more than 30 minutes ago)
      const completedThreshold = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes past end
      const completedResult = await Event.updateMany(
        {
          status: { $in: ["upcoming", "ongoing"] },
          date: { $lt: completedThreshold },
        },
        {
          status: "completed",
          completedAt: now,
          $set: { lastStatusUpdate: now },
        }
      );
      updatedCount += completedResult.modifiedCount;
      console.log(
        `🟢 Marked ${completedResult.modifiedCount} events as completed`
      );

      // Update upcoming events (ensure they're marked correctly)
      const upcomingResult = await Event.updateMany(
        {
          status: { $in: ["ongoing", "completed"] }, // Fix incorrect statuses
          date: { $gt: now },
        },
        {
          status: "upcoming",
          $unset: { completedAt: 1 },
          $set: { lastStatusUpdate: now },
        }
      );
      updatedCount += upcomingResult.modifiedCount;
      console.log(
        `🔵 Marked ${upcomingResult.modifiedCount} events as upcoming`
      );

      console.log(
        `✅ Event status update completed: ${updatedCount} events updated`
      );

      // Log summary
      const statusCounts = await Event.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      console.log("📊 Current Event Status Summary:");
      statusCounts.forEach((stat) => {
        console.log(`   ${stat._id}: ${stat.count} events`);
      });
    } catch (error) {
      console.error("❌ Error in automated event status update:", error);
    } finally {
      this.isRunning = false;
    }
  }

  // Manual trigger for immediate update
  async manualUpdate() {
    console.log("👤 Manual event status update triggered");
    return await this.updateAllEventStatuses();
  }

  // Get service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.enabled,
      updateInterval: `${this.updateInterval} minutes`,
      lastRun: new Date(),
      nextRun: new Date(Date.now() + parseInt(this.updateInterval) * 60 * 1000),
    };
  }
}

module.exports = new EventStatusService();
