const Activity = require("../models/Activity");

// Middleware to log user activities
const logActivity = (type, description, getDetails) => {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send function to log activity after successful response
    res.send = function (data) {
      // Call original send first
      originalSend.call(this, data);

      // Log activity asynchronously (don't block response)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        setImmediate(async () => {
          try {
            const activityData = {
              userId: req.user._id,
              type,
              description,
              details:
                typeof getDetails === "function"
                  ? getDetails(req, res)
                  : getDetails || "",
              metadata: {
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
              },
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.get("User-Agent"),
            };

            // Add target information if available
            if (req.params.id) {
              activityData.targetId = req.params.id;
            }

            await Activity.logActivity(activityData);
          } catch (error) {
            console.error("Error logging activity:", error);
          }
        });
      }
    };

    next();
  };
};

// Specific activity loggers
const logLogin = logActivity("login", "You logged in", (req) => {
  const userAgent = req.get("User-Agent");
  const browser = userAgent ? userAgent.split(" ")[0] : "Unknown browser";
  const os =
    userAgent && userAgent.includes("Windows")
      ? "Windows"
      : userAgent && userAgent.includes("Mac")
        ? "Mac"
        : userAgent && userAgent.includes("Linux")
          ? "Linux"
          : "Unknown OS";
  return `From ${browser} on ${os}`;
});

const logPostCreate = logActivity(
  "post_created",
  "You created a new post",
  (req) => {
    return req.body.title || "Untitled post";
  },
);

const logPostEdit = logActivity("post_edited", "You edited a post", (req) => {
  return req.body.title || "Post updated";
});

const logPostDelete = logActivity("post_deleted", "You deleted a post", () => {
  return "Post permanently deleted";
});

const logLike = logActivity("like", "You liked a post", (req) => {
  return "Post liked";
});

const logComment = logActivity("comment", "You commented on a post", (req) => {
  return req.body.content
    ? req.body.content.substring(0, 100) + "..."
    : "Comment added";
});

const logShare = logActivity("share", "You shared a post", (req) => {
  return `Shared via ${req.body.platform || "unknown platform"}`;
});

const logBookmark = logActivity("bookmark", "You bookmarked a post", () => {
  return "Post saved to bookmarks";
});

const logProfileView = logActivity(
  "profile_view",
  "Someone viewed your profile",
  (req) => {
    return req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Anonymous user";
  },
);

const logVisit = logActivity("visit", "You visited a page", (req) => {
  const pageMap = {
    "/dashboard": "Dashboard",
    "/new-post": "New Post",
    "/profile": "Profile",
    "/history": "Activity History",
    "/admin": "Admin Panel",
  };

  const page = Object.keys(pageMap).find((key) =>
    req.originalUrl.includes(key),
  );
  return pageMap[page] || req.originalUrl;
});

module.exports = {
  logActivity,
  logLogin,
  logPostCreate,
  logPostEdit,
  logPostDelete,
  logLike,
  logComment,
  logShare,
  logBookmark,
  logProfileView,
  logVisit,
};
