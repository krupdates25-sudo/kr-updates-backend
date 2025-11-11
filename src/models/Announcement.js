const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Announcement title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    message: {
      type: String,
      required: [true, "Announcement message is required"],
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
    },
    type: {
      type: String,
      enum: ["info", "warning", "success", "error", "update"],
      default: "info",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    targetAudience: {
      type: String,
      enum: ["all", "admin", "moderator", "user"],
      default: "all",
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: function () {
        // Default to 7 days from now
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    actionUrl: {
      type: String,
      trim: true,
    },
    actionText: {
      type: String,
      trim: true,
      maxlength: [50, "Action text cannot exceed 50 characters"],
    },
    icon: {
      type: String,
      enum: ["bell", "info", "warning", "check", "alert", "update", "star"],
      default: "bell",
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient queries
announcementSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
announcementSchema.index({ targetAudience: 1 });
announcementSchema.index({ priority: 1 });
announcementSchema.index({ createdBy: 1 });

// Virtual for checking if announcement is currently active
announcementSchema.virtual("isCurrentlyActive").get(function () {
  const now = new Date();
  return this.isActive && this.startDate <= now && this.endDate >= now;
});

// Method to mark announcement as read by a user
announcementSchema.methods.markAsRead = function (userId) {
  const existingRead = this.readBy.find(
    (read) => read.user.toString() === userId.toString(),
  );

  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date(),
    });
  }

  return this.save();
};

// Method to check if user has read the announcement
announcementSchema.methods.isReadBy = function (userId) {
  return this.readBy.some((read) => read.user.toString() === userId.toString());
};

// Static method to get active announcements for a user
announcementSchema.statics.getActiveForUser = function (userRole = "user") {
  const now = new Date();

  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [{ targetAudience: "all" }, { targetAudience: userRole }],
  })
    .populate("createdBy", "firstName lastName username")
    .sort({ priority: -1, createdAt: -1 });
};

// Static method to get unread announcements for a user
announcementSchema.statics.getUnreadForUser = function (
  userId,
  userRole = "user",
) {
  const now = new Date();

  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [{ targetAudience: "all" }, { targetAudience: userRole }],
    "readBy.user": { $ne: userId },
  })
    .populate("createdBy", "firstName lastName username")
    .sort({ priority: -1, createdAt: -1 });
};

// Pre-save middleware to validate dates
announcementSchema.pre("save", function (next) {
  if (this.endDate <= this.startDate) {
    next(new Error("End date must be after start date"));
  } else {
    next();
  }
});

const Announcement = mongoose.model("Announcement", announcementSchema);

module.exports = Announcement;
