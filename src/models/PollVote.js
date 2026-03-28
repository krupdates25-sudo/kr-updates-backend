const mongoose = require("mongoose");

const pollVoteSchema = new mongoose.Schema(
  {
    poll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poll",
      required: true,
      index: true,
    },
    optionIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    voterKey: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

pollVoteSchema.index({ poll: 1, voterKey: 1 }, { unique: true });

module.exports = mongoose.model("PollVote", pollVoteSchema);
