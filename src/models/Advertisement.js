const mongoose = require("mongoose");

const advertisementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: function () {
        return !this.isDraft;
      },
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: function () {
        return !this.isDraft;
      },
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    imageUrl: {
      type: String,
      required: function () {
        return !this.isDraft;
      },
    },
    clickUrl: {
      type: String,
      required: function () {
        return !this.isDraft;
      },
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Please provide a valid URL starting with http:// or https://",
      },
    },
    clientName: {
      type: String,
      required: function () {
        return !this.isDraft;
      },
      trim: true,
      maxlength: [100, "Client name cannot exceed 100 characters"],
    },
    clientEmail: {
      type: String,
      required: function () {
        return !this.isDraft;
      },
      lowercase: true,
      validate: {
        validator: function (v) {
          return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: "Please provide a valid email address",
      },
    },
    clientPhone: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"],
    },
    adType: {
      type: String,
      enum: ["banner", "card", "sidebar", "popup"],
      default: "banner",
      required: true,
    },
    position: {
      type: String,
      enum: ["top", "middle", "bottom", "random"],
      default: "random",
      required: true,
    },
    priority: {
      type: Number,
      default: 1,
      min: [1, "Priority must be at least 1"],
      max: [10, "Priority cannot exceed 10"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
      default: Date.now,
    },
    endDate: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || v > this.startDate;
        },
        message: "End date must be after start date",
      },
    },
    duration: {
      type: Number, // Duration in days
      required: [true, "Duration is required"],
      min: [1, "Duration must be at least 1 day"],
      max: [365, "Duration cannot exceed 365 days"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDraft: {
      type: Boolean,
      default: false,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    budget: {
      type: Number,
      required: [true, "Budget is required"],
      min: [0, "Budget cannot be negative"],
    },
    costPerClick: {
      type: Number,
      default: 0,
      min: [0, "Cost per click cannot be negative"],
    },
    targetAudience: {
      ageRange: {
        min: { type: Number, default: 18 },
        max: { type: Number, default: 65 },
      },
      interests: [String],
      location: String,
    },
    analytics: {
      dailyImpressions: [
        {
          date: { type: Date, default: Date.now },
          count: { type: Number, default: 0 },
        },
      ],
      dailyClicks: [
        {
          date: { type: Date, default: Date.now },
          count: { type: Number, default: 0 },
        },
      ],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for checking if ad is expired
advertisementSchema.virtual("isExpired").get(function () {
  return new Date() > this.endDate;
});

// Virtual for days remaining
advertisementSchema.virtual("daysRemaining").get(function () {
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for click-through rate
advertisementSchema.virtual("ctr").get(function () {
  return this.impressions > 0
    ? ((this.clicks / this.impressions) * 100).toFixed(2)
    : 0;
});

// Index for better query performance
advertisementSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
advertisementSchema.index({ position: 1, priority: -1 });
advertisementSchema.index({ createdBy: 1 });

// Pre-save middleware to calculate end date based on duration
advertisementSchema.pre("save", function (next) {
  if (
    this.isNew ||
    this.isModified("startDate") ||
    this.isModified("duration")
  ) {
    const startDate = new Date(this.startDate);
    this.endDate = new Date(
      startDate.getTime() + this.duration * 24 * 60 * 60 * 1000,
    );
  }
  next();
});

// Method to increment impressions
advertisementSchema.methods.incrementImpressions = function () {
  this.impressions += 1;

  // Update daily analytics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayAnalytics = this.analytics.dailyImpressions.find(
    (item) => item.date.getTime() === today.getTime(),
  );

  if (todayAnalytics) {
    todayAnalytics.count += 1;
  } else {
    this.analytics.dailyImpressions.push({ date: today, count: 1 });
  }

  return this.save();
};

// Method to increment clicks
advertisementSchema.methods.incrementClicks = function () {
  this.clicks += 1;

  // Update daily analytics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayAnalytics = this.analytics.dailyClicks.find(
    (item) => item.date.getTime() === today.getTime(),
  );

  if (todayAnalytics) {
    todayAnalytics.count += 1;
  } else {
    this.analytics.dailyClicks.push({ date: today, count: 1 });
  }

  return this.save();
};

// Static method to get active ads for a specific position
advertisementSchema.statics.getActiveAds = function (
  position = "random",
  limit = 5,
) {
  const now = new Date();
  const query = {
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  };

  if (position !== "random") {
    query.$or = [{ position: position }, { position: "random" }];
  }

  return this.find(query)
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit)
    .populate("createdBy", "firstName lastName email");
};

module.exports = mongoose.model("Advertisement", advertisementSchema);
