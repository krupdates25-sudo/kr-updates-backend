const mongoose = require("mongoose");

const updateSubscriberSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30, index: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 200, index: true },
    source: { type: String, default: "want_updates", index: true },
    metadata: {
      userAgent: { type: String, default: "" },
      referrer: { type: String, default: "" },
      ipAddress: { type: String, default: "" },
      pageUrl: { type: String, default: "" },
    },
    submitCount: { type: Number, default: 1 },
    lastSubmittedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// De-dup strategy: unique email/phone when present (sparse allows multiple null/empty)
updateSubscriberSchema.index(
  { email: 1 },
  { unique: true, sparse: true, collation: { locale: "en", strength: 2 } }
);
updateSubscriberSchema.index({ phone: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("UpdateSubscriber", updateSubscriberSchema);












