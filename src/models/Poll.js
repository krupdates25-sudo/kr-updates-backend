const mongoose = require("mongoose");

const pollOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
    votes: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const pollSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    options: {
      type: [pollOptionSchema],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length >= 2 && arr.length <= 12;
        },
        message: "Poll must have between 2 and 12 options",
      },
    },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

pollSchema.index({ isActive: 1, createdAt: -1 });
pollSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("Poll", pollSchema);
