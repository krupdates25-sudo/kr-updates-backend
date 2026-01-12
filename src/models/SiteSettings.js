const mongoose = require("mongoose");

const SOCIAL_PLATFORMS = ["facebook", "twitter", "instagram", "linkedin", "youtube"];
const SOCIAL_PLACEMENTS = ["dashboard_follow", "footer", "header"];

const socialProfileSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: SOCIAL_PLATFORMS,
    },
    url: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Please provide a valid social URL",
      },
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    placements: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          if (!Array.isArray(arr)) return false;
          return arr.every((p) => SOCIAL_PLACEMENTS.includes(p));
        },
        message: "Invalid social placement",
      },
    },
  },
  { _id: false }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      required: [true, "Site name is required"],
      trim: true,
      maxlength: [100, "Site name cannot exceed 100 characters"],
      default: "News Blog",
    },
    siteDescription: {
      type: String,
      trim: true,
      maxlength: [500, "Site description cannot exceed 500 characters"],
      default: "Your trusted source for the latest news and updates",
    },
    siteLogo: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Please provide a valid logo URL",
      },
    },
    siteFavicon: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Please provide a valid favicon URL",
      },
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: "Please provide a valid email address",
      },
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, "Address cannot exceed 200 characters"],
    },
    socialLinks: {
      facebook: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^https?:\/\/.+/.test(v);
          },
          message: "Please provide a valid Facebook URL",
        },
      },
      twitter: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^https?:\/\/.+/.test(v);
          },
          message: "Please provide a valid Twitter URL",
        },
      },
      instagram: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^https?:\/\/.+/.test(v);
          },
          message: "Please provide a valid Instagram URL",
        },
      },
      linkedin: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^https?:\/\/.+/.test(v);
          },
          message: "Please provide a valid LinkedIn URL",
        },
      },
      youtube: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^https?:\/\/.+/.test(v);
          },
          message: "Please provide a valid YouTube URL",
        },
      },
    },
    // Rich social configuration used for visibility + placements on the frontend
    socialProfiles: {
      type: [socialProfileSchema],
      default: [],
    },
    seo: {
      metaTitle: {
        type: String,
        trim: true,
        maxlength: [60, "Meta title cannot exceed 60 characters"],
      },
      metaDescription: {
        type: String,
        trim: true,
        maxlength: [160, "Meta description cannot exceed 160 characters"],
      },
      metaKeywords: {
        type: [String],
        default: [],
      },
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    maintenanceMessage: {
      type: String,
      trim: true,
      maxlength: [500, "Maintenance message cannot exceed 500 characters"],
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Ensure only one settings document exists
siteSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Index for efficient queries
siteSettingsSchema.index({ createdAt: 1 });

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);

module.exports = SiteSettings;

