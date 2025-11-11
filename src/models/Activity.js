const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "login",
        "logout",
        "register",
        "profile_update",
        "password_change",
        "post_create",
        "post_update",
        "post_delete",
        "post_view",
        "post_like",
        "post_unlike",
        "post_share",
        "post_bookmark",
        "post_unbookmark",
        "comment_create",
        "comment_update",
        "comment_delete",
        "comment_like",
        "comment_unlike",
        "user_follow",
        "user_unfollow",
        "user_delete",
        "account_delete",
        "search",
        "page_visit",
        "file_upload",
        "error_occurred",
        "post_visibility_toggle",
        "user_publishing_toggle",
        "settings_updated",
      ],
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    details: {
      type: String,
      default: "",
    },
    metadata: {
      // For posts, comments, etc.
      postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
      commentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
      },
      targetUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      // Search terms, error messages, etc.
      searchQuery: String,
      errorMessage: String,
      fileName: String,
      fileSize: Number,
      // Additional context
      previousValue: String,
      newValue: String,
      category: String,
      tags: [String],
    },
    // Browser and device information
    browserInfo: {
      userAgent: String,
      browser: String,
      version: String,
      os: String,
      platform: String,
      mobile: {
        type: Boolean,
        default: false,
      },
      language: String,
      timezone: String,
      screenResolution: String,
      cookieEnabled: Boolean,
    },
    // Network information
    networkInfo: {
      ipAddress: String,
      country: String,
      region: String,
      city: String,
      isp: String,
    },
    // Session information
    sessionInfo: {
      sessionId: String,
      duration: Number, // in seconds
      pagesVisited: Number,
      referrer: String,
      entryPage: String,
    },
    // Performance metrics
    performance: {
      loadTime: Number, // in milliseconds
      renderTime: Number,
      networkLatency: Number,
      errorCount: Number,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // For grouping related activities
    sessionGroup: String,
    batchId: String,
  },
  {
    timestamps: true,
    // Automatically expire old activities after 1 year
    expireAfterSeconds: 365 * 24 * 60 * 60,
  },
);

// Indexes for better query performance
activitySchema.index({ user: 1, timestamp: -1 });
activitySchema.index({ type: 1, timestamp: -1 });
activitySchema.index({ "metadata.postId": 1 });
activitySchema.index({ timestamp: -1 });
activitySchema.index({ user: 1, type: 1, timestamp: -1 });

// Virtual for getting activity age
activitySchema.virtual("age").get(function () {
  return Date.now() - this.timestamp;
});

// Static method to get user activity summary
activitySchema.statics.getUserSummary = async function (
  userId,
  timeframe = "30d",
) {
  const timeframeMs = {
    "1d": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };

  const since = new Date(
    Date.now() - (timeframeMs[timeframe] || timeframeMs["30d"]),
  );

  return await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        timestamp: { $gte: since },
      },
    },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        lastActivity: { $max: "$timestamp" },
        firstActivity: { $min: "$timestamp" },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);
};

// Static method to get activity trends
activitySchema.statics.getActivityTrends = async function (userId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        timestamp: { $gte: since },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          type: "$type",
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.date",
        activities: {
          $push: {
            type: "$_id.type",
            count: "$count",
          },
        },
        totalCount: { $sum: "$count" },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
};

// Instance method to format activity for display
activitySchema.methods.toDisplayFormat = function () {
  const typeMap = {
    login: "Logged in",
    logout: "Logged out",
    register: "Registered account",
    profile_update: "Updated profile",
    password_change: "Changed password",
    post_create: "Created a post",
    post_update: "Updated a post",
    post_delete: "Deleted a post",
    post_view: "Viewed a post",
    post_like: "Liked a post",
    post_unlike: "Unliked a post",
    post_share: "Shared a post",
    post_bookmark: "Bookmarked a post",
    post_unbookmark: "Unbookmarked a post",
    comment_create: "Added a comment",
    comment_update: "Updated a comment",
    comment_delete: "Deleted a comment",
    comment_like: "Liked a comment",
    comment_unlike: "Unliked a comment",
    user_follow: "Followed a user",
    user_unfollow: "Unfollowed a user",
    user_delete: "Deleted a user",
    account_delete: "Deleted an account",
    search: "Performed a search",
    page_visit: "Visited a page",
    file_upload: "Uploaded a file",
    error_occurred: "Encountered an error",
    post_visibility_toggle: "Toggled post visibility",
    user_publishing_toggle: "Toggled user publishing permission",
    settings_updated: "Updated site settings",
  };

  return {
    id: this._id,
    type: this.type,
    title: typeMap[this.type] || this.type,
    description: this.description,
    details: this.details,
    timestamp: this.timestamp,
    browser: this.browserInfo?.browser,
    os: this.browserInfo?.os,
    location:
      this.networkInfo?.city && this.networkInfo?.country
        ? `${this.networkInfo.city}, ${this.networkInfo.country}`
        : null,
    metadata: this.metadata,
  };
};

module.exports = mongoose.model("Activity", activitySchema);
