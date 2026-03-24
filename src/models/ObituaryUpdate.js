const mongoose = require("mongoose");

const obituaryUpdateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [180, "Title cannot exceed 180 characters"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [400, "Message cannot exceed 400 characters"],
    },
    location: {
      type: String,
      trim: true,
      maxlength: [120, "Location cannot exceed 120 characters"],
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    eventDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

obituaryUpdateSchema.index({ isActive: 1, eventDate: -1, createdAt: -1 });
obituaryUpdateSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("ObituaryUpdate", obituaryUpdateSchema);
