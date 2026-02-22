const mongoose = require("mongoose");

const breakingNewsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    excerpt: {
      type: String,
      required: [true, "Excerpt is required"],
      trim: true,
      maxlength: [500, "Excerpt cannot exceed 500 characters"],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
    },
    image: {
      url: {
        type: String,
        required: [true, "Image URL is required"],
      },
      alt: {
        type: String,
        default: "",
      },
      caption: {
        type: String,
        default: "",
      },
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
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
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "Technology",
        "Business",
        "Science",
        "World",
        "Health",
        "Sports",
        "Politics",
        "Entertainment",
        "General",
      ],
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, "Location cannot exceed 100 characters"],
      default: "Kishangarh Renwal",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for better query performance
breakingNewsSchema.index({ isActive: 1, priority: -1, createdAt: -1 });
breakingNewsSchema.index({ expiresAt: 1 });
breakingNewsSchema.index({ category: 1 });

// Virtual for formatted creation date
breakingNewsSchema.virtual("formattedCreatedAt").get(function () {
  return this.createdAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

// Virtual for time until expiry
breakingNewsSchema.virtual("timeUntilExpiry").get(function () {
  const now = new Date();
  const expiry = new Date(this.expiresAt);
  const diffMs = expiry - now;

  if (diffMs <= 0) return "Expired";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  } else {
    return `${minutes}m remaining`;
  }
});

// Method to check if story is expired
breakingNewsSchema.methods.isExpired = function () {
  return new Date() > new Date(this.expiresAt);
};

// Method to extend expiry
breakingNewsSchema.methods.extendExpiry = function (hours = 24) {
  this.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  return this.save();
};

// Static method to get active stories
breakingNewsSchema.statics.getActiveStories = function () {
  return this.find({
    isActive: true,
    expiresAt: { $gt: new Date() },
  }).sort({ priority: -1, createdAt: -1 });
};

// Static method to get expired stories
breakingNewsSchema.statics.getExpiredStories = function () {
  return this.find({
    $or: [{ isActive: false }, { expiresAt: { $lte: new Date() } }],
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model("BreakingNews", breakingNewsSchema);
