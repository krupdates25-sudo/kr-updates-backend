const Activity = require("../models/Activity");
const catchAsync = require("../utils/catchAsync");
const ApiResponse = require("../utils/apiResponse");
const { AppError } = require("../utils/appError");

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

// Helper function to get IP info (simplified)
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

// Log activity with enhanced tracking
const logActivity = async (data, req = null) => {
  try {
    const activityData = {
      ...data,
      timestamp: new Date(),
    };

    // Add browser and network info if request is available
    if (req) {
      activityData.browserInfo = extractBrowserInfo(req.headers["user-agent"]);
      activityData.networkInfo = getNetworkInfo(req);

      if (req.headers.referer) {
        activityData.sessionInfo = {
          referrer: req.headers.referer,
        };
      }
    }

    await Activity.create(activityData);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

// Get user activities with enhanced filtering
const getUserActivities = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const { type, search, dateFrom, dateTo, browser, os } = req.query;

  // Build filter
  let filter = { user: userId };

  if (type && type !== "all") {
    filter.type = type;
  }

  if (search) {
    filter.$or = [
      { description: { $regex: search, $options: "i" } },
      { details: { $regex: search, $options: "i" } },
    ];
  }

  if (dateFrom || dateTo) {
    filter.timestamp = {};
    if (dateFrom) {
      filter.timestamp.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      filter.timestamp.$lte = new Date(dateTo);
    }
  }

  if (browser) {
    filter["browserInfo.browser"] = browser;
  }

  if (os) {
    filter["browserInfo.os"] = { $regex: os, $options: "i" };
  }

  const totalCount = await Activity.countDocuments(filter);
  const activities = await Activity.find(filter)
    .populate("metadata.postId", "title slug")
    .populate("metadata.commentId", "content")
    .populate("metadata.targetUserId", "firstName lastName username")
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit);

  const hasMore = skip + activities.length < totalCount;

  ApiResponse.success(
    res,
    {
      data: activities,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
      totalCount,
      hasMore,
    },
    "Activities retrieved successfully",
  );
});

// Get comprehensive activity statistics
const getActivityStats = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { period = "30" } = req.query;

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - parseInt(period));

  // Activity type breakdown
  const typeStats = await Activity.aggregate([
    {
      $match: {
        user: userId,
        timestamp: { $gte: dateFrom },
      },
    },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        lastActivity: { $max: "$timestamp" },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  // Browser breakdown
  const browserStats = await Activity.aggregate([
    {
      $match: {
        user: userId,
        timestamp: { $gte: dateFrom },
        "browserInfo.browser": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$browserInfo.browser",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  // OS breakdown
  const osStats = await Activity.aggregate([
    {
      $match: {
        user: userId,
        timestamp: { $gte: dateFrom },
        "browserInfo.os": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$browserInfo.os",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  // Daily activity trend
  const dailyStats = await Activity.aggregate([
    {
      $match: {
        user: userId,
        timestamp: { $gte: dateFrom },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const totalActivities = await Activity.countDocuments({
    user: userId,
    timestamp: { $gte: dateFrom },
  });

  // Calculate specific activity counts
  const likeCount = await Activity.countDocuments({
    user: userId,
    type: "post_like",
    timestamp: { $gte: dateFrom },
  });

  const commentCount = await Activity.countDocuments({
    user: userId,
    type: "comment_create",
    timestamp: { $gte: dateFrom },
  });

  const postCount = await Activity.countDocuments({
    user: userId,
    type: "post_create",
    timestamp: { $gte: dateFrom },
  });

  const loginCount = await Activity.countDocuments({
    user: userId,
    type: "login",
    timestamp: { $gte: dateFrom },
  });

  ApiResponse.success(
    res,
    {
      summary: {
        total: totalActivities,
        likes: likeCount,
        comments: commentCount,
        posts: postCount,
        logins: loginCount,
      },
      breakdown: {
        byType: typeStats,
        byBrowser: browserStats,
        byOS: osStats,
        daily: dailyStats,
      },
      period: `${period} days`,
    },
    "Activity statistics retrieved successfully",
  );
});

// Get user activity summary for admin
const getUserActivitySummary = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { period = "30" } = req.query;

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - parseInt(period));

  const summary = await Activity.getUserSummary(userId, `${period}d`);

  const totalActivities = await Activity.countDocuments({
    user: userId,
    timestamp: { $gte: dateFrom },
  });

  // Get recent login info
  const recentLogins = await Activity.find({
    user: userId,
    type: "login",
    timestamp: { $gte: dateFrom },
  })
    .sort({ timestamp: -1 })
    .limit(5)
    .select("timestamp browserInfo networkInfo");

  ApiResponse.success(
    res,
    {
      userId,
      period: `${period} days`,
      totalActivities,
      activityBreakdown: summary,
      recentLogins,
    },
    "User activity summary retrieved successfully",
  );
});

// Delete user's own activity (for privacy)
const deleteUserActivity = catchAsync(async (req, res, next) => {
  const { activityId } = req.params;
  const userId = req.user._id;

  const activity = await Activity.findOne({
    _id: activityId,
    user: userId,
  });

  if (!activity) {
    return next(new AppError("Activity not found", 404));
  }

  await Activity.findByIdAndDelete(activityId);

  // Log the deletion
  await logActivity(
    {
      user: userId,
      type: "activity_delete",
      description: "Deleted an activity record",
      details: `Deleted ${activity.type} activity from ${activity.timestamp}`,
      metadata: {
        deletedActivityType: activity.type,
        deletedActivityTimestamp: activity.timestamp,
      },
    },
    req,
  );

  ApiResponse.success(res, null, "Activity deleted successfully");
});

// Admin - Get all activities with enhanced filtering
const getAllActivities = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const { type, userId, search, dateFrom, dateTo, browser, os } = req.query;

  // Build filter
  let filter = {};

  if (type && type !== "all") {
    filter.type = type;
  }

  if (userId) {
    filter.user = userId;
  }

  if (search) {
    filter.$or = [
      { description: { $regex: search, $options: "i" } },
      { details: { $regex: search, $options: "i" } },
    ];
  }

  if (dateFrom || dateTo) {
    filter.timestamp = {};
    if (dateFrom) {
      filter.timestamp.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      filter.timestamp.$lte = new Date(dateTo);
    }
  }

  if (browser) {
    filter["browserInfo.browser"] = browser;
  }

  if (os) {
    filter["browserInfo.os"] = { $regex: os, $options: "i" };
  }

  const totalCount = await Activity.countDocuments(filter);
  const activities = await Activity.find(filter)
    .populate("user", "firstName lastName email username")
    .populate("metadata.postId", "title slug")
    .populate("metadata.commentId", "content")
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit);

  const hasMore = skip + activities.length < totalCount;

  ApiResponse.success(
    res,
    {
      data: activities,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
      totalCount,
      hasMore,
    },
    "All activities retrieved successfully",
  );
});

module.exports = {
  getUserActivities,
  getActivityStats,
  getUserActivitySummary,
  deleteUserActivity,
  getAllActivities,
  logActivity,
};
