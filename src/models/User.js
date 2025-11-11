const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const validator = require("validator");
const config = require("../config");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, "Please provide a valid email address"],
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || validator.isMobilePhone(v, "any", { strictMode: false });
        },
        message: "Please provide a valid phone number",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false,
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    role: {
      type: String,
      enum: {
        values: ["admin", "moderator", "author", "viewer"],
        message: "Role must be either admin, moderator, author, or viewer",
      },
      default: "viewer",
    },
    profileImage: {
      type: String,
      default: "default-profile.jpg",
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
      trim: true,
    },
    location: {
      type: String,
      maxlength: [100, "Location cannot exceed 100 characters"],
      trim: true,
    },
    website: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || validator.isURL(v);
        },
        message: "Please provide a valid website URL",
      },
    },
    socialLinks: {
      twitter: {
        type: String,
        trim: true,
        maxlength: [50, "Twitter username cannot exceed 50 characters"],
      },
      facebook: {
        type: String,
        trim: true,
        maxlength: [100, "Facebook URL cannot exceed 100 characters"],
      },
      linkedin: {
        type: String,
        trim: true,
        maxlength: [100, "LinkedIn username cannot exceed 100 characters"],
      },
      instagram: {
        type: String,
        trim: true,
        maxlength: [50, "Instagram username cannot exceed 50 characters"],
      },
      github: {
        type: String,
        trim: true,
        maxlength: [50, "GitHub username cannot exceed 50 characters"],
      },
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    passwordChangedAt: Date,
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    notifications: {
      email: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
      marketing: {
        type: Boolean,
        default: false,
      },
      comments: {
        type: Boolean,
        default: true,
      },
      likes: {
        type: Boolean,
        default: true,
      },
    },
    privacy: {
      profileVisible: {
        type: Boolean,
        default: true,
      },
      emailVisible: {
        type: Boolean,
        default: false,
      },
      showOnlineStatus: {
        type: Boolean,
        default: true,
      },
    },
    canPublish: {
      type: Boolean,
      default: true,
      comment:
        "Admin can control if user can publish posts - false means user can only create drafts",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account lock status
userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  // Only run if password is modified
  if (!this.isModified("password")) return next();

  // Hash password with cost of 12
  this.password = await bcrypt.hash(this.password, config.BCRYPT_SALT_ROUNDS);

  // Set passwordChangedAt
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000;
  }

  next();
});

// Instance method to check password
userSchema.methods.matchPassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Alias for matchPassword (used by auth controller)
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Instance method to generate JWT token
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    {
      id: this._id,
      role: this.role,
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN },
  );
};

// Instance method to generate email verification token
userSchema.methods.getEmailVerificationToken = function () {
  const verificationToken = crypto.randomBytes(20).toString("hex");

  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");

  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return verificationToken;
};

// Instance method to generate password reset token
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Instance method to check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Static method to handle failed login attempts
userSchema.statics.getAuthenticated = async function (username, password) {
  const user = await this.findOne({
    $or: [{ email: username }, { username: username }],
  }).select("+password");

  if (!user) {
    return { user: null, error: "Invalid credentials" };
  }

  // Check if account is locked
  if (user.isLocked) {
    // Check if lock has expired
    if (user.lockUntil <= Date.now()) {
      await user.updateOne({
        $unset: { lockUntil: 1, loginAttempts: 1 },
      });
    } else {
      return { user: null, error: "Account is temporarily locked" };
    }
  }

  const isMatch = await user.matchPassword(password);

  if (isMatch) {
    // Reset login attempts and update last login
    await user.updateOne({
      $unset: { loginAttempts: 1, lockUntil: 1 },
      $set: { lastLogin: new Date() },
    });
    return { user, error: null };
  }

  // Password didn't match, increment login attempts
  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (user.loginAttempts + 1 >= 5 && !user.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  await user.updateOne(updates);
  return { user: null, error: "Invalid credentials" };
};

const User = mongoose.model("User", userSchema);

module.exports = User;
