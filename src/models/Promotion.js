const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Promotion title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    imageUrl: {
      type: String,
      required: [true, "Image URL is required"],
    },
    targetLink: {
      type: String,
      required: [true, "Target link is required"],
      validate: {
        validator: function (v) {
          return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(
            v,
          );
        },
        message: (props) => `${props.value} is not a valid URL!`,
      },
    },
    position: {
      type: String,
      enum: ["header", "sidebar", "content", "footer"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "paused", "completed", "scheduled"],
      default: "scheduled",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    targetAudience: {
      categories: [
        {
          type: String,
          enum: [
            "news",
            "technology",
            "sports",
            "entertainment",
            "business",
            "other",
          ],
        },
      ],
      languages: [
        {
          type: String,
          default: ["en"],
        },
      ],
    },
    displayCount: {
      type: Number,
      default: 0,
    },
    clickCount: {
      type: Number,
      default: 0,
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
promotionSchema.index({ status: 1, startDate: 1, endDate: 1 });
promotionSchema.index({ position: 1, isActive: 1 });
promotionSchema.index({ "targetAudience.categories": 1 });

// Method to check if promotion is currently active
promotionSchema.methods.isCurrentlyActive = function () {
  const now = new Date();
  return (
    this.isActive &&
    this.status === "active" &&
    now >= this.startDate &&
    now <= this.endDate
  );
};

const Promotion = mongoose.model("Promotion", promotionSchema);

module.exports = Promotion;
