const User = require("../models/User");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const ApiResponse = require("../utils/apiResponse");
const bcrypt = require("bcryptjs");
const Activity = require("../models/Activity");
const Announcement = require("../models/Announcement");

// Get all users (public - limited info)
const getAllUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({ isActive: true })
    .select("username firstName lastName profileImage bio")
    .limit(50);

  ApiResponse.success(res, users, "Users retrieved successfully");
});

// Get single user (public - limited info)
const getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id).select(
    "username firstName lastName profileImage bio location website socialLinks role createdAt",
  );

  if (!user || !user.isActive) {
    return next(new AppError("User not found", 404));
  }

  ApiResponse.success(res, user, "User retrieved successfully");
});

// Get my profile (protected)
const getMyProfile = catchAsync(async (req, res, next) => {
  ApiResponse.success(res, req.user, "Profile retrieved successfully");
});

// Update my profile (protected)
const updateMyProfile = catchAsync(async (req, res, next) => {
  const {
    firstName,
    lastName,
    username,
    email,
    bio,
    location,
    website,
    socialLinks,
    profileImage,
    theme,
    notifications,
    privacy,
  } = req.body;

  // Check if username is taken by another user
  if (username && username !== req.user.username) {
    const existingUser = await User.findOne({
      username: username.toLowerCase(),
      _id: { $ne: req.user._id },
    });
    if (existingUser) {
      return next(new AppError("Username is already taken", 400));
    }
  }

  // Check if email is taken by another user
  if (email && email !== req.user.email) {
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.user._id },
    });
    if (existingUser) {
      return next(new AppError("Email is already taken", 400));
    }
  }

  // Prepare update data
  const updateData = {};
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (username !== undefined) updateData.username = username.toLowerCase();
  if (email !== undefined) updateData.email = email.toLowerCase();
  if (bio !== undefined) updateData.bio = bio;
  if (location !== undefined) updateData.location = location;
  if (website !== undefined) updateData.website = website;
  if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
  if (profileImage !== undefined) updateData.profileImage = profileImage;
  if (theme !== undefined) updateData.theme = theme;
  if (notifications !== undefined) updateData.notifications = notifications;
  if (privacy !== undefined) updateData.privacy = privacy;

  const updatedUser = await User.findByIdAndUpdate(req.user._id, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!updatedUser) {
    return next(new AppError("User not found", 404));
  }

  // Log profile update activity
  await Activity.create({
    user: req.user._id,
    type: "profile_update",
    description: "User updated their profile",
    details: `Updated fields: ${Object.keys(updateData).join(", ")}`,
    browserInfo: extractBrowserInfo(req.headers["user-agent"]),
    networkInfo: getNetworkInfo(req),
  });

  ApiResponse.success(res, updatedUser, "Profile updated successfully");
});

// Change password (protected)
const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  // Validate required fields
  if (!currentPassword || !newPassword || !confirmPassword) {
    return next(
      new AppError(
        "Please provide current password, new password, and confirm password",
        400,
      ),
    );
  }

  // Check if new password matches confirm password
  if (newPassword !== confirmPassword) {
    return next(
      new AppError("New password and confirm password do not match", 400),
    );
  }

  // Get user with password field
  const user = await User.findById(req.user._id).select("+password");

  // Check if current password is correct
  if (!(await user.correctPassword(currentPassword, user.password))) {
    return next(new AppError("Current password is incorrect", 400));
  }

  // Check if new password is different from current password
  if (await user.correctPassword(newPassword, user.password)) {
    return next(
      new AppError("New password must be different from current password", 400),
    );
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Log password change activity
  await Activity.create({
    user: req.user._id,
    type: "password_change",
    description: "User changed their password",
    browserInfo: extractBrowserInfo(req.headers["user-agent"]),
    networkInfo: getNetworkInfo(req),
  });

  ApiResponse.success(res, null, "Password changed successfully");
});

// Get user statistics (protected)
const getUserStats = catchAsync(async (req, res, next) => {
  const Post = require("../models/Post");
  const Like = require("../models/Like");
  const Comment = require("../models/Comment");

  const userId = req.user._id;

  // Get user's posts count
  const postsCount = await Post.countDocuments({
    author: userId,
    status: "published",
  });

  // Get total likes received on user's posts
  const userPosts = await Post.find({ author: userId }).select("_id");
  const postIds = userPosts.map((post) => post._id);

  const likesReceived = await Like.countDocuments({ post: { $in: postIds } });

  // Get total comments received on user's posts
  const commentsReceived = await Comment.countDocuments({
    post: { $in: postIds },
  });

  // Get total views on user's posts
  const viewsResult = await Post.aggregate([
    { $match: { author: userId } },
    { $group: { _id: null, totalViews: { $sum: "$viewCount" } } },
  ]);
  const totalViews = viewsResult.length > 0 ? viewsResult[0].totalViews : 0;

  // Get likes given by user
  const likesGiven = await Like.countDocuments({ user: userId });

  // Get comments made by user
  const commentsMade = await Comment.countDocuments({ author: userId });

  const stats = {
    postsCount,
    likesReceived,
    commentsReceived,
    totalViews,
    likesGiven,
    commentsMade,
    joinedDate: req.user.createdAt,
  };

  ApiResponse.success(res, stats, "User statistics retrieved successfully");
});

// Admin only - Create sub-admin
const createSubAdmin = catchAsync(async (req, res, next) => {
  const {
    firstName,
    lastName,
    email,
    username: providedUsername,
    password,
    role = "moderator",
    bio,
    location,
    website,
    socialLinks,
  } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError("User with this email already exists", 400));
  }

  // Generate or use provided username
  let username;
  if (providedUsername && providedUsername.trim()) {
    // Use provided username but check if it exists
    const existingUsername = await User.findOne({
      username: providedUsername.trim().toLowerCase(),
    });
    if (existingUsername) {
      return next(new AppError("Username already exists", 400));
    }
    username = providedUsername.trim().toLowerCase();
  } else {
    // Generate username from email (take part before @)
    let baseUsername = email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    username = baseUsername;

    // Check if username exists and append number if needed
    let counter = 1;
    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }
  }

  // Create user - let the User model handle password hashing in pre-save middleware
  const newUser = await User.create({
    username,
    firstName,
    lastName,
    email,
    password, // Don't hash here, let the model do it
    role,
    bio,
    location,
    website,
    socialLinks,
    isActive: true,
    isEmailVerified: true, // Auto-verify admin-created users
  });

  // Remove password from response
  newUser.password = undefined;

  ApiResponse.success(res, newUser, "Sub-admin created successfully", 201);
});

// Admin only - Get all users with full details (exclude admin users)
const getAllUsersAdmin = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { search, role, status } = req.query;

  // Build filter - exclude admin users from the table
  let filter = { role: { $ne: "admin" } };

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (role && role !== "all") {
    filter.role = role;
  }

  if (status && status !== "all") {
    filter.isActive = status === "active";
  }

  const totalCount = await User.countDocuments(filter);
  const users = await User.find(filter)
    .select("-password")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const hasMore = skip + users.length < totalCount;

  ApiResponse.success(
    res,
    {
      data: users,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
      totalCount,
      hasMore,
    },
    "Users retrieved successfully",
  );
});

// Admin only - Update user
const updateUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  // Don't allow password update through this endpoint
  delete updateData.password;

  const user = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  ApiResponse.success(res, user, "User updated successfully");
});

// Admin only - Delete user (cannot delete admin users)
const deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Prevent deleting admin users
  if (user.role === "admin") {
    return next(new AppError("Cannot delete admin users", 403));
  }

  // Log delete activity
  await Activity.create({
    user: req.user._id,
    type: "user_delete",
    description: "Admin deleted a user",
    details: `Admin deleted user: ${user.firstName} ${user.lastName} (${user.username}) - Role: ${user.role}`,
    browserInfo: extractBrowserInfo(req.headers["user-agent"]),
    networkInfo: getNetworkInfo(req),
  });

  await User.findByIdAndDelete(req.params.id);

  ApiResponse.success(res, null, "User deleted successfully");
});

// Admin only - Activate user
const activateUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true, runValidators: true },
  );

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  ApiResponse.success(res, user, "User activated successfully");
});

// Admin only - Deactivate user
const deactivateUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true, runValidators: true },
  );

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  ApiResponse.success(res, user, "User deactivated successfully");
});

// Admin only - Toggle user publishing permission
const toggleUserPublishingPermission = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Find the user
  const user = await User.findById(id);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Prevent toggling admin users' publishing permission
  if (user.role === "admin") {
    return next(
      new AppError("Cannot modify admin user publishing permissions", 403),
    );
  }

  // Toggle publishing permission
  const updatedUser = await User.findByIdAndUpdate(
    id,
    { canPublish: !user.canPublish },
    { new: true, runValidators: true },
  ).select("-password");

  // Log the action
  await Activity.create({
    user: req.user._id,
    type: "user_publishing_toggle",
    description: "Admin toggled user publishing permission",
    details: `User "${user.firstName} ${user.lastName}" can now ${updatedUser.canPublish ? "publish" : "not publish"} posts`,
    browserInfo: extractBrowserInfo(req.headers["user-agent"]),
    networkInfo: getNetworkInfo(req),
  });

  // Create announcement if permission is granted
  if (updatedUser.canPublish && !user.canPublish) {
    // Map user role to valid targetAudience enum value
    const roleToAudienceMap = {
      admin: "admin",
      moderator: "moderator",
      author: "user",
      viewer: "user",
      user: "user",
    };
    const targetAudience = roleToAudienceMap[user.role] || "user";

    const announcement = await Announcement.create({
      title: "Publishing Permission Granted",
      message: `Hello ${user.firstName}! You have been granted permission to create and publish posts. You can now access the "New Post" button in your sidebar and dashboard.`,
      type: "success",
      priority: "high",
      targetAudience: targetAudience,
      createdBy: req.user._id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      icon: "check",
      actionUrl: "/new-post",
      actionText: "Create Your First Post",
    });

    // Send real-time notification to the user
    if (global.io) {
      global.io.to(`user_${user._id}`).emit("notification", {
        type: "permission_granted",
        title: "Publishing Permission Granted",
        message: `Hello ${user.firstName}! You have been granted permission to create and publish posts.`,
        actionUrl: "/new-post",
        actionText: "Create Your First Post",
        timestamp: new Date(),
        priority: "high",
        icon: "check",
      });
    }
  }

  ApiResponse.success(
    res,
    updatedUser,
    `User ${updatedUser.canPublish ? "can now publish" : "cannot publish"} posts`,
  );
});

// Delete own account
const deleteSelf = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  // Don't allow the last admin to delete themselves
  if (req.user.role === "admin") {
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      return next(new AppError("Cannot delete the last admin account", 400));
    }
  }

  // Soft delete the user
  await User.findByIdAndUpdate(userId, {
    isActive: false,
    email: `deleted_${Date.now()}_${req.user.email}`,
    username: `deleted_${Date.now()}_${req.user.username}`,
    deletedAt: new Date(),
  });

  // Log the self-deletion activity
  await Activity.create({
    user: userId,
    type: "account_delete",
    description: "Deleted own account",
    details: `Account self-deleted by ${req.user.firstName} ${req.user.lastName}`,
    browserInfo: extractBrowserInfo(req.headers["user-agent"]),
    networkInfo: getNetworkInfo(req),
  });

  ApiResponse.success(res, null, "Account deleted successfully");
});

// Helper function to extract browser info from user agent
const extractBrowserInfo = (userAgent) => {
  if (!userAgent) return {};

  const browserRegex = {
    Chrome: /Chrome\/([0-9.]+)/,
    Firefox: /Firefox\/([0-9.]+)/,
    Safari: /Safari\/([0-9.]+)/,
    Edge: /Edge\/([0-9.]+)/,
    Opera: /Opera\/([0-9.]+)/,
    IE: /MSIE ([0-9.]+)/,
  };

  const osRegex = {
    Windows: /Windows NT ([0-9.]+)/,
    macOS: /Mac OS X ([0-9._]+)/,
    Linux: /Linux/,
    Android: /Android ([0-9.]+)/,
    iOS: /iPhone OS ([0-9._]+)/,
  };

  let browser = "Unknown";
  let version = "";
  let os = "Unknown";
  let mobile = false;

  // Detect browser
  for (const [name, regex] of Object.entries(browserRegex)) {
    const match = userAgent.match(regex);
    if (match) {
      browser = name;
      version = match[1];
      break;
    }
  }

  // Detect OS
  for (const [name, regex] of Object.entries(osRegex)) {
    const match = userAgent.match(regex);
    if (match) {
      os = name;
      if (match[1]) {
        os += ` ${match[1].replace(/_/g, ".")}`;
      }
      break;
    }
  }

  // Detect mobile
  mobile =
    /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent,
    );

  return {
    userAgent,
    browser,
    version,
    os,
    platform: mobile ? "Mobile" : "Desktop",
    mobile,
  };
};

// Helper function to get IP info
const getNetworkInfo = (req) => {
  const ipAddress =
    req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"];

  return {
    ipAddress: ipAddress?.replace("::ffff:", "") || "Unknown",
    country: req.headers["cf-ipcountry"] || "Unknown",
    region: "Unknown",
    city: "Unknown",
    isp: "Unknown",
  };
};

module.exports = {
  getAllUsers,
  getUser,
  getMyProfile,
  updateMyProfile,
  changePassword,
  getUserStats,
  createSubAdmin,
  getAllUsersAdmin,
  updateUser,
  deleteUser,
  activateUser,
  deactivateUser,
  toggleUserPublishingPermission,
  deleteSelf,
};
