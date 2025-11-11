const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: [true, "Post is required"],
    },
    type: {
      type: String,
      enum: ["like", "love", "thumbsup"],
      default: "like",
    },
    // Store user data for future features (analytics, notifications, etc.)
    userData: {
      username: String,
      firstName: String,
      lastName: String,
      email: String,
      role: String,
      profileImage: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// Compound index to ensure a user can only like a post once
likeSchema.index({ user: 1, post: 1 }, { unique: true });

// Index for efficient queries
likeSchema.index({ post: 1, createdAt: -1 });
likeSchema.index({ user: 1, createdAt: -1 });

const Like = mongoose.model("Like", likeSchema);

module.exports = Like;
