const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["new_post", "breaking_news", "announcement", "trending"],
      default: "new_post",
    },
    recipientCount: {
      type: Number,
      required: true,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "sending", "sent", "partial", "failed"],
      default: "pending",
    },
    results: [
      {
        email: String,
        success: Boolean,
        error: String,
      },
    ],
    scheduledAt: {
      type: Date,
      default: Date.now,
    },
    sentAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Index for better query performance
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ postId: 1 });
notificationSchema.index({ sentBy: 1 });
notificationSchema.index({ status: 1 });

// Virtual for success rate
notificationSchema.virtual("successRate").get(function () {
  if (this.recipientCount === 0) return 0;
  return Math.round((this.successCount / this.recipientCount) * 100);
});

// Method to update status
notificationSchema.methods.updateStatus = function (status, results = null) {
  this.status = status;
  if (results) {
    this.results = results;
    this.successCount = results.filter((r) => r.success).length;
    this.failureCount = results.filter((r) => !r.success).length;
  }
  if (status === "sent" || status === "partial") {
    this.sentAt = new Date();
  }
  return this.save();
};

module.exports = mongoose.model("Notification", notificationSchema);

