const mongoose = require("mongoose");
const validator = require("validator");

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [5, "Title must be at least 5 characters long"],
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    subheading: {
      type: String,
      trim: true,
      maxlength: [200, "Subheading cannot exceed 200 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
      minlength: [50, "Content must be at least 50 characters long"],
    },
    excerpt: {
      type: String,
      maxlength: [300, "Excerpt cannot exceed 300 characters"],
      trim: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author is required"],
    },
    authorDisplayName: {
      type: String,
      trim: true,
      maxlength: [100, "Author display name cannot exceed 100 characters"],
    },
    reporterName: {
      type: String,
      trim: true,
      maxlength: [100, "Reporter name cannot exceed 100 characters"],
      comment: "Name of the reporter/news by - can be edited by admin",
    },
    featuredImage: {
      url: {
        type: String,
        validate: {
          validator: function (v) {
            // Only validate if URL is provided (not empty)
            return !v || validator.isURL(v);
          },
          message: "Please provide a valid image URL",
        },
      },
      alt: {
        type: String,
        maxlength: [100, "Alt text cannot exceed 100 characters"],
      },
      caption: {
        type: String,
        maxlength: [200, "Caption cannot exceed 200 characters"],
      },
    },
    featuredVideo: {
      url: {
        type: String,
        validate: {
          validator: function (v) {
            // Only validate if URL is provided (not empty)
            return !v || validator.isURL(v);
          },
          message: "Please provide a valid video URL",
        },
      },
      thumbnail: {
        type: String,
        validate: {
          validator: function (v) {
            return !v || validator.isURL(v);
          },
          message: "Please provide a valid thumbnail URL",
        },
      },
      duration: {
        type: Number, // Duration in seconds
      },
      caption: {
        type: String,
        maxlength: [200, "Caption cannot exceed 200 characters"],
      },
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: [30, "Tag cannot exceed 30 characters"],
      },
    ],
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      maxlength: [50, "Category cannot exceed 50 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["draft", "published", "archived", "scheduled"],
        message: "Status must be draft, published, archived, or scheduled",
      },
      default: "draft",
    },
    publishedAt: {
      type: Date,
    },
    scheduledFor: {
      type: Date,
    },
    isPromoted: {
      type: Boolean,
      default: false,
    },
    isTrending: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: [0, "View count cannot be negative"],
    },
    likeCount: {
      type: Number,
      default: 0,
      min: [0, "Like count cannot be negative"],
    },
    commentCount: {
      type: Number,
      default: 0,
      min: [0, "Comment count cannot be negative"],
    },
    shareCount: {
      type: Number,
      default: 0,
      min: [0, "Share count cannot be negative"],
    },
    readingTime: {
      type: Number, // in minutes
      min: [1, "Reading time must be at least 1 minute"],
    },
    language: {
      type: String,
      default: "en",
      enum: ["en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh"],
    },
    seo: {
      metaTitle: {
        type: String,
        maxlength: [60, "Meta title cannot exceed 60 characters"],
      },
      metaDescription: {
        type: String,
        maxlength: [160, "Meta description cannot exceed 160 characters"],
      },
      keywords: [
        {
          type: String,
          trim: true,
          lowercase: true,
        },
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
      comment:
        "Admin can toggle post visibility - false means hidden from public",
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

// Virtual for URL
postSchema.virtual("url").get(function () {
  return `/posts/${this.slug}`;
});

// Virtual populate for comments
postSchema.virtual("comments", {
  ref: "Comment",
  foreignField: "post",
  localField: "_id",
  options: { sort: { createdAt: -1 } },
});

// Virtual populate for likes
postSchema.virtual("likes", {
  ref: "Like",
  foreignField: "post",
  localField: "_id",
});

// Indexes for better query performance
postSchema.index({ title: "text", content: "text", excerpt: "text", subheading: "text" });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ category: 1, status: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ slug: 1 }, { unique: true });
postSchema.index({ isPromoted: 1, isTrending: 1, isFeatured: 1 });
postSchema.index({ viewCount: -1 });
postSchema.index({ likeCount: -1 });

// Pre-save middleware to generate slug
postSchema.pre("save", function (next) {
  // Generate slug if title is modified and slug doesn't exist
  if (this.isModified("title") && !this.slug) {
    // Try to create slug from title (keep ASCII alphanumeric and spaces only)
    let slug = this.title
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 ]/g, "") // Remove non-ASCII characters
      .replace(/\s+/g, "-") // Replace spaces with dashes
      .replace(/-+/g, "-") // Replace multiple dashes with single dash
      .replace(/^-+|-+$/g, ""); // Remove leading/trailing dashes

    // If slug is empty or invalid (title had no ASCII characters), use _id
    // MongoDB _id is available in pre-save hook
    if (!slug || slug.length === 0) {
      // Use the MongoDB _id as slug (it's a 24-character hex string, URL-safe)
      this.slug = this._id ? this._id.toString() : `post-${Date.now()}`;
    } else {
      // Add timestamp to ensure uniqueness
      this.slug = `${slug}-${Date.now()}`;
    }
  }
  
  // Ensure slug always exists (fallback for edge cases)
  if (!this.slug) {
    this.slug = this._id ? this._id.toString() : `post-${Date.now()}`;
  }
  
  next();
});

// Post-save middleware to fix malformed slugs (starting with -- or empty)
postSchema.post("save", function (doc, next) {
  // Fix malformed slugs that start with -- or are invalid
  if (doc.slug && (doc.slug.startsWith("--") || /^-+$/.test(doc.slug) || doc.slug.length === 0)) {
    // Use _id as slug for malformed slugs
    doc.slug = doc._id.toString();
    // Save without validation to avoid infinite loop
    doc.constructor.updateOne(
      { _id: doc._id },
      { $set: { slug: doc.slug } },
      { runValidators: false }
    ).catch((err) => {
      console.error(`Error fixing malformed slug for post ${doc._id}:`, err);
    });
  }
  next();
});

// Pre-save middleware to calculate reading time
postSchema.pre("save", function (next) {
  if (this.isModified("content")) {
    const wordsPerMinute = 200;
    const wordCount = this.content.split(/\s+/).length;
    this.readingTime = Math.ceil(wordCount / wordsPerMinute);
  }
  next();
});

// Pre-save middleware to generate excerpt
postSchema.pre("save", function (next) {
  if (this.isModified("content") && !this.excerpt) {
    // Remove HTML tags and get first 150 characters
    const plainText = this.content.replace(/<[^>]*>/g, "");
    this.excerpt =
      plainText.substring(0, 150) + (plainText.length > 150 ? "..." : "");
  }
  next();
});

// Pre-save middleware to set publishedAt
postSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status === "published" &&
    !this.publishedAt
  ) {
    this.publishedAt = new Date();
  }
  next();
});

// Static method to get published posts
postSchema.statics.getPublished = function (filter = {}) {
  return this.find({
    ...filter,
    status: "published",
    publishedAt: { $lte: new Date() },
    isActive: true,
  }).populate("author", "username firstName lastName profileImage");
};

// Static method to get trending posts
postSchema.statics.getTrending = function (limit = 10) {
  return this.find({
    status: "published",
    isTrending: true,
    isActive: true,
  })
    .sort({ viewCount: -1, likeCount: -1 })
    .limit(limit)
    .populate("author", "username firstName lastName profileImage");
};

// Instance method to increment view count
postSchema.methods.incrementViewCount = function () {
  return this.updateOne({ $inc: { viewCount: 1 } });
};

// Instance method to check if user can edit
postSchema.methods.canEdit = function (user) {
  return (
    user.role === "admin" ||
    user.role === "moderator" ||
    this.author.toString() === user._id.toString()
  );
};

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
