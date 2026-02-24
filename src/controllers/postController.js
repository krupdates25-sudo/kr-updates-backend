const Post = require("../models/Post");
const User = require("../models/User");
const Like = require("../models/Like");
const Comment = require("../models/Comment");
const Activity = require("../models/Activity");
const Bookmark = require("../models/Bookmark");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const ApiResponse = require("../utils/apiResponse");

// Helper functions for activity logging
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
  let browser = "Unknown",
    version = "",
    os = "Unknown",
    mobile = false;
  for (const [name, regex] of Object.entries(browserRegex)) {
    const match = userAgent.match(regex);
    if (match) {
      browser = name;
      version = match[1];
      break;
    }
  }
  for (const [name, regex] of Object.entries(osRegex)) {
    const match = userAgent.match(regex);
    if (match) {
      os = name;
      if (match[1]) os += ` ${match[1].replace(/_/g, ".")}`;
      break;
    }
  }
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

const logActivity = async (data, req = null) => {
  try {
    const activityData = { ...data, timestamp: new Date() };
    if (req) {
      activityData.browserInfo = extractBrowserInfo(req.headers["user-agent"]);
      activityData.networkInfo = getNetworkInfo(req);
      if (req.headers.referer) {
        activityData.sessionInfo = { referrer: req.headers.referer };
      }
    }
    await Activity.create(activityData);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

// Helper function to add like status to posts
const addLikeStatusToPosts = async (posts, userId) => {
  if (!userId || posts.length === 0) return posts;

  const postIds = posts.map((post) => post._id);

  // Get all likes for this user on these posts
  const userLikes = await Like.find({
    user: userId,
    post: { $in: postIds },
  }).select("post");

  const likedPostIds = new Set(userLikes.map((like) => like.post.toString()));

  // Add like status to each post
  return posts.map((post) => {
    const postObj = post.toObject ? post.toObject() : post;
    postObj.isLiked = likedPostIds.has((post._id || post.id).toString());
    return postObj;
  });
};

// Get distinct location options for filters / creation UI
// - Public users: only published & active posts
// - Staff (admin/mod/author): include drafts too (so new locations show up immediately after creation)
const getLocationOptions = catchAsync(async (req, res, next) => {
  const now = new Date();
  const isStaff = !!req.user && ["admin", "moderator", "author"].includes(req.user.role);

  const match = {
    isActive: true,
    isVisible: { $ne: false },
    location: { $exists: true, $type: "string" },
  };

  if (!isStaff) {
    match.status = "published";
    match.publishedAt = { $lte: now };
  }

  const rows = await Post.aggregate([
    { $match: match },
    {
      $project: {
        location: { $trim: { input: "$location" } },
      },
    },
    { $match: { location: { $ne: "" } } },
    { $group: { _id: "$location", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 100 },
  ]);

  const locations = rows.map((r) => r._id);

  ApiResponse.success(
    res,
    { locations: ["All", ...locations] },
    "Location options retrieved successfully",
  );
});

// Get all posts (public)
const getAllPosts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 8, location, noCount, locationMode } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const rawLimit = parseInt(limit, 10) || 8;
  const limitNum = Math.min(Math.max(1, rawLimit), 50);
  const skip = (pageNum - 1) * limitNum;
  const now = new Date();
  const shouldSkipCount = String(noCount).toLowerCase() === "true";

  const baseFilter = {
    status: "published",
    publishedAt: { $lte: now },
    isActive: true,
    // Treat missing isVisible as visible (backward compatible with old posts)
    isVisible: { $ne: false },
  };

  // Location filter
  // Default: exact match (fast, index-friendly) — Region chips pass exact strings.
  // Optional: "contains" mode for search-like behavior.
  if (location && location !== "All" && location !== "all") {
    const trimmed = String(location).trim();
    if (trimmed) {
      if (String(locationMode).toLowerCase() === "contains") {
        baseFilter.location = { $regex: trimmed, $options: "i" };
      } else {
        baseFilter.location = trimmed;
      }
    }
  }

  // Small in-memory cache for anonymous feed traffic (very common on first load).
  // Safe because it only applies when there is no authenticated personalization.
  const canCache = !req.user;
  const cacheKey = canCache
    ? `feed:${JSON.stringify({
        page: pageNum,
        limit: limitNum,
        location: baseFilter.location || "All",
        noCount: shouldSkipCount,
        locationMode: String(locationMode || ""),
      })}`
    : null;

  if (canCache && cacheKey) {
    const cached = global.__kr_feedCache?.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return ApiResponse.success(res, cached.value, cached.message || "OK");
    }
  }

  // Optimize: select only fields needed for feed cards and keep author lean.
  // Also run list + count in parallel to reduce overall latency.
  const baseQuery = Post.find(baseFilter)
    .select(
      "title excerpt featuredImage featuredVideo tags category location publishedAt likeCount commentCount shareCount slug readingTime isTrending isFeatured isPromoted",
    )
    .populate("author", "username firstName lastName profileImage role title")
    .sort({ publishedAt: -1 })
    .skip(skip);

  let posts = [];
  let totalCount = null;
  let totalPages = null;
  let hasMore = false;

  if (shouldSkipCount) {
    // Fast path: avoid countDocuments; fetch one extra record to compute hasMore.
    const list = await baseQuery.limit(limitNum + 1).lean();
    hasMore = list.length > limitNum;
    posts = hasMore ? list.slice(0, limitNum) : list;
  } else {
    const result = await Promise.all([
      baseQuery.limit(limitNum).lean(),
      Post.countDocuments(baseFilter),
    ]);
    posts = result[0];
    totalCount = result[1];
    totalPages = Math.ceil(totalCount / limitNum);
    hasMore = pageNum < totalPages;
  }

  // Add like status if user is authenticated
  const postsWithLikeStatus = await addLikeStatusToPosts(posts, req.user?._id);

  const responsePayload = {
    data: postsWithLikeStatus,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalCount,
      totalPages,
      hasMore,
    },
    totalCount, // For backward compatibility
    hasMore, // For backward compatibility
  };

  if (canCache && cacheKey) {
    if (!global.__kr_feedCache) global.__kr_feedCache = new Map();
    global.__kr_feedCache.set(cacheKey, {
      value: responsePayload,
      message: "Posts retrieved successfully",
      expiresAt: Date.now() + 15 * 1000,
    });
  }

  ApiResponse.success(
    res,
    responsePayload,
    "Posts retrieved successfully",
  );
});

// Get trending posts
const getTrendingPosts = catchAsync(async (req, res, next) => {
  const {
    timeFilter = "week",
    sortBy = "trending",
    limit = 20,
    search,
  } = req.query;

  // Calculate date range based on time filter
  let dateFilter = {};
  const now = new Date();

  switch (timeFilter) {
    case "today":
      dateFilter = { createdAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) } };
      break;
    case "week":
      dateFilter = {
        createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      };
      break;
    case "month":
      dateFilter = {
        createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      };
      break;
    case "all":
    default:
      dateFilter = {};
      break;
  }

  // Build search filter
  let searchFilter = {};
  if (search) {
    searchFilter = {
      $or: [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ],
    };
  }

  // Combine filters
  const matchFilter = {
    status: "published",
    ...dateFilter,
    ...searchFilter,
  };

  try {
    let posts;

    if (sortBy === "trending") {
      // Calculate trending score using aggregation
      posts = await Post.aggregate([
        { $match: matchFilter },
        {
          $addFields: {
            likesCount: { $size: { $ifNull: ["$likes", []] } },
            commentsCount: { $size: { $ifNull: ["$comments", []] } },
            sharesCount: { $ifNull: ["$shares", 0] },
            viewsCount: { $ifNull: ["$views", 0] },
            // Time decay factor (newer posts get higher score)
            timeFactor: {
              $divide: [
                { $subtract: [new Date(), "$createdAt"] },
                1000 * 60 * 60 * 24, // Convert to days
              ],
            },
          },
        },
        {
          $addFields: {
            trendingScore: {
              $add: [
                "$likesCount",
                { $multiply: ["$commentsCount", 2] },
                { $multiply: ["$sharesCount", 3] },
                { $multiply: ["$viewsCount", 0.1] },
                // Boost recent posts
                { $divide: [100, { $add: ["$timeFactor", 1] }] },
              ],
            },
          },
        },
        { $sort: { trendingScore: -1 } },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "author",
          },
        },
        { $unwind: "$author" },
        {
          $project: {
            title: 1,
            excerpt: 1,
            featuredImage: 1,
            slug: 1,
            tags: 1,
            category: 1,
            status: 1,
            createdAt: 1,
            publishedAt: 1,
            updatedAt: 1,
            trendingScore: 1,
            "author._id": 1,
            "author.firstName": 1,
            "author.lastName": 1,
            "author.username": 1,
            "author.profileImage": 1,
          },
        },
      ]);
    } else {
      // Simple sorting for other options
      let sortOption = {};
      switch (sortBy) {
        case "likes":
          sortOption = { likes: -1 };
          break;
        case "comments":
          sortOption = { comments: -1 };
          break;
        case "shares":
          sortOption = { shares: -1 };
          break;
        case "views":
          sortOption = { views: -1 };
          break;
        default:
          sortOption = { createdAt: -1 };
      }

      posts = await Post.find(matchFilter)
        .select(
          "title excerpt featuredImage tags category status publishedAt createdAt updatedAt likeCount commentCount shareCount viewCount slug",
        )
        .populate("author", "username firstName lastName profileImage role title")
        .sort(sortOption)
        .limit(parseInt(limit))
        .lean();
    }

    ApiResponse.success(
      res,
      {
        data: posts,
        totalCount: posts.length,
        filters: {
          timeFilter,
          sortBy,
          search: search || null,
        },
      },
      "Trending posts retrieved successfully",
    );
  } catch (error) {
    console.error("Error fetching trending posts:", error);
    return next(new AppError("Error fetching trending posts", 500));
  }
});

// Get featured posts
const getFeaturedPosts = catchAsync(async (req, res, next) => {
  const posts = await Post.find({
    status: "published",
    isFeatured: true,
    isActive: true,
  })
    .select(
      "title excerpt featuredImage tags category status publishedAt createdAt updatedAt likeCount commentCount shareCount viewCount slug",
    )
    .sort({ publishedAt: -1 })
    .limit(5)
    .populate("author", "username firstName lastName profileImage role title")
    .lean();

  ApiResponse.success(res, posts, "Featured posts retrieved successfully");
});

// Get posts by category
const getPostsByCategory = catchAsync(async (req, res, next) => {
  const { category } = req.params;

  const posts = await Post.getPublished({ category })
    .sort({ publishedAt: -1 })
    .limit(20);

  // Add like status if user is authenticated
  const postsWithLikeStatus = await addLikeStatusToPosts(posts, req.user?._id);

  ApiResponse.success(
    res,
    postsWithLikeStatus,
    `Posts in ${category} category retrieved successfully`,
  );
});

// Search posts
const searchPosts = catchAsync(async (req, res, next) => {
  const { q, category, tags, limit = 20, page = 1 } = req.query;

  if (!q || q.trim().length === 0) {
    return next(new AppError("Search query is required", 400));
  }

  const searchQuery = {
    status: "published",
    isActive: true,
    $text: { $search: q.trim() },
  };

  // Add category filter if provided
  if (category) {
    searchQuery.category = category;
  }

  // Add tags filter if provided
  if (tags) {
    const tagArray = tags.split(",").map((tag) => tag.trim().toLowerCase());
    searchQuery.tags = { $in: tagArray };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const posts = await Post.find(searchQuery)
    .select(
      "title excerpt author category tags publishedAt viewCount likeCount",
    )
    .populate("author", "username firstName lastName")
    .sort({ score: { $meta: "textScore" }, publishedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Post.countDocuments(searchQuery);

  // Add like status if user is authenticated
  const postsWithLikeStatus = await addLikeStatusToPosts(posts, req.user?._id);

  ApiResponse.success(
    res,
    {
      posts: postsWithLikeStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
    `Found ${total} posts matching your search`,
  );
});

// Get post by slug
const getPostBySlug = catchAsync(async (req, res, next) => {
  const { slug } = req.params;

  // Check if slug is actually a MongoDB ObjectId (24 hex characters)
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(slug);

  // Build query - handle both slug and ID lookups
  const query = {
    isActive: true,
  };

  if (isObjectId) {
    // If it's an ObjectId, search by _id
    query._id = slug;
  } else {
    // Otherwise, search by slug
    query.slug = slug;
  }

  // Non-admin users can only see published posts
  // Admin users can see both published and draft posts
  if (req.user?.role !== "admin") {
    query.status = "published";
  }

  const post = await Post.findOne(query).populate(
    "author",
    "username firstName lastName profileImage"
  );

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Only increment view count for published posts
  if (post.status === "published") {
    await post.incrementViewCount();
  }

  ApiResponse.success(res, post, "Post retrieved successfully");
});

// Create new post (protected)
const createPost = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const { validationResult } = require("express-validator");
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => error.msg);
    return next(new AppError(errorMessages.join(". "), 400));
  }

  const {
    title,
    content,
    excerpt,
    description,
    subheading,
    reporterName,
    category,
    tags,
    location,
    featuredImage,
    featuredVideo,
  } = req.body;

  // Create post object
  const postData = {
    title: title.trim(),
    content: content.trim(),
    author: req.user._id,
    category,
    location: location || "Kishangarh Renwal",
    status: "draft", // Always start as draft
  };

  // Add subheading (accept both 'description' and 'subheading' from frontend)
  if (subheading && subheading.trim()) {
    postData.subheading = subheading.trim();
  } else if (description && description.trim()) {
    postData.subheading = description.trim();
  }

  // Add optional fields if provided
  if (excerpt && excerpt.trim()) {
    postData.excerpt = excerpt.trim();
  }

  // Add reporter name if provided
  if (reporterName && reporterName.trim()) {
    postData.reporterName = reporterName.trim();
  }

  if (tags && Array.isArray(tags) && tags.length > 0) {
    postData.tags = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag);
  }

  if (featuredImage && featuredImage.url) {
    postData.featuredImage = {
      url: featuredImage.url,
      alt: featuredImage.alt || title,
      caption: featuredImage.caption || "",
    };
  }

  if (featuredVideo && featuredVideo.url) {
    postData.featuredVideo = {
      url: featuredVideo.url,
      thumbnail: featuredVideo.thumbnail || null,
      duration: featuredVideo.duration || null,
      caption: featuredVideo.caption || "",
    };
  }

  // Role-based publishing workflow
  // Only Admin can publish directly
  // IMPORTANT: Force status based on user role - non-admins CANNOT publish
  // Even if they send status: "published", we override it to "draft"
  const requestedStatus = req.body.status;

  if (req.user.role === "admin") {
    // Only Admin can publish directly
    if (requestedStatus === "published") {
      postData.status = "published";
      postData.publishedAt = new Date();
    } else {
      postData.status = "draft";
    }
  } else {
    // Moderator, Sub-admin, and other roles: ALWAYS force to draft
    // They cannot publish directly - must be approved by Admin
    // Override any status they might have sent
    postData.status = "draft";
    postData.publishedAt = null; // Ensure no publish date
  }

  // Create the post
  const post = await Post.create(postData);

  // Populate author info for response
  await post.populate("author", "username firstName lastName profileImage");

  // If post is draft and created by non-admin, notify Admin for review
  if (postData.status === "draft" && req.user.role !== "admin") {
    try {
      // Find all admin users
      const User = require("../models/User");
      const Announcement = require("../models/Announcement");
      const admins = await User.find({ role: "admin", isActive: true });

      if (admins.length > 0) {
        // Create announcement notification for all admins
        const announcement = await Announcement.create({
          title: "Post Review Request",
          message: `${req.user.firstName || req.user.username} (${req.user.role}) submitted a post for review: "${post.title}"`,
          type: "info",
          priority: "high",
          targetAudience: "admin",
          createdBy: req.user._id,
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          icon: "alert",
          actionUrl: `/post/${post._id}`, // Use /post/ for frontend route
          actionText: "Review Post",
          isActive: true,
        });

        // Send real-time notification to admins via Socket.IO
        if (global.io) {
          const notificationData = {
            type: "post_review_request",
            message: `${req.user.firstName || req.user.username} submitted a post for review: "${post.title}"`,
            postId: post._id,
            postTitle: post.title,
            announcementId: announcement._id,
            author: {
              _id: req.user._id,
              firstName: req.user.firstName,
              lastName: req.user.lastName,
              username: req.user.username,
              role: req.user.role,
            },
            timestamp: new Date(),
          };

          // Emit to all admin users
          admins.forEach((admin) => {
            global.io.to(`user_${admin._id}`).emit("notification", notificationData);
          });
        }
      }
    } catch (notificationError) {
      // Log error but don't fail the post creation
      console.error("Error sending admin notification:", notificationError);
    }
  }

  const message =
    postData.status === "published"
      ? "Post created and published successfully"
      : "Post created as draft and submitted for review. Admin will review and publish it.";

  ApiResponse.success(res, post, message, 201);
});

// Get my posts (protected)
const getMyPosts = catchAsync(async (req, res, next) => {
  const posts = await Post.find({ author: req.user._id })
    .sort({ createdAt: -1 })
    .limit(20);

  ApiResponse.success(res, posts, "Your posts retrieved successfully");
});

// Update post (protected)
const updatePost = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const { validationResult } = require("express-validator");
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => error.msg);
    return next(new AppError(errorMessages.join(". "), 400));
  }

  const { id } = req.params;
  const {
    title,
    content,
    excerpt,
    description,
    subheading,
    reporterName,
    category,
    tags,
    location,
    featuredImage,
    status,
    authorDisplayName,
    isTrending,
    isFeatured,
  } = req.body;

  // Find the post
  const post = await Post.findById(id);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Check ownership (authors can only edit their own posts, unless user is admin/moderator)
  if (
    req.user.role === "author" &&
    post.author.toString() !== req.user._id.toString()
  ) {
    return next(new AppError("You can only edit your own posts", 403));
  }

  // Update fields if provided
  const updateData = {};
  if (title) updateData.title = title.trim();
  if (content) updateData.content = content.trim();

  // Handle subheading (accept both 'description' and 'subheading' from frontend)
  if (subheading !== undefined) {
    updateData.subheading = subheading ? subheading.trim() : "";
  } else if (description !== undefined) {
    updateData.subheading = description ? description.trim() : "";
  }

  if (excerpt !== undefined) updateData.excerpt = excerpt ? excerpt.trim() : "";
  if (category) updateData.category = category;
  if (location) updateData.location = location;

  if (tags !== undefined) {
    updateData.tags = Array.isArray(tags)
      ? tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag)
      : [];
  }

  if (featuredImage !== undefined) {
    updateData.featuredImage =
      featuredImage && featuredImage.url
        ? {
          url: featuredImage.url,
          alt: featuredImage.alt || title || post.title,
          caption: featuredImage.caption || "",
        }
        : undefined;
  }

  // Feed flags (Trending / Featured)
  // We allow these only for Admin via the editor payload.
  // (There are also dedicated toggle endpoints for staff.)
  if (isTrending !== undefined) {
    if (req.user.role !== "admin") {
      return next(new AppError("Only Admin can set trending flag", 403));
    }
    if (typeof isTrending !== "boolean") {
      return next(new AppError("isTrending must be a boolean", 400));
    }
    updateData.isTrending = isTrending;
  }

  if (isFeatured !== undefined) {
    if (req.user.role !== "admin") {
      return next(new AppError("Only Admin can set featured flag", 403));
    }
    if (typeof isFeatured !== "boolean") {
      return next(new AppError("isFeatured must be a boolean", 400));
    }
    updateData.isFeatured = isFeatured;
  }

  // Allow admin to set custom author display name
  if (authorDisplayName !== undefined && req.user.role === "admin") {
    const trimmedName = authorDisplayName ? authorDisplayName.trim() : "";
    // Allow empty string to clear the custom display name (will fallback to author's real name)
    updateData.authorDisplayName = trimmedName || null;
  }

  // Allow admin to set reporter name (News by)
  if (reporterName !== undefined && req.user.role === "admin") {
    const trimmedName = reporterName ? reporterName.trim() : "";
    // Allow empty string to clear the reporter name
    updateData.reporterName = trimmedName || null;
  }

  // IMPORTANT: Handle status updates - Only Admin can publish posts
  // Non-admin users (moderator, sub-admin) cannot change status to published
  if (status !== undefined) {
    if (status === "published") {
      // Only Admin can publish posts
      if (req.user.role !== "admin") {
        return next(new AppError("Only Admin can publish posts. Your post will remain as draft until approved.", 403));
      }
      updateData.status = "published";
      updateData.publishedAt = new Date();
    } else if (status === "draft") {
      // Anyone can set to draft
      updateData.status = "draft";
      updateData.publishedAt = null;
    } else {
      return next(new AppError("Invalid status. Must be 'draft' or 'published'", 400));
    }
  }

  // Check if there's anything to update
  if (Object.keys(updateData).length === 0) {
    return next(new AppError("No fields to update", 400));
  }

  // Update the post
  const updatedPost = await Post.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).populate("author", "username firstName lastName profileImage");

  if (!updatedPost) {
    return next(new AppError("Post not found after update", 404));
  }

  const message = updateData.status === "published"
    ? "Post published successfully"
    : "Post updated successfully";

  ApiResponse.success(res, updatedPost, message);
});

// Delete post (protected)
const deletePost = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Find the post
  const post = await Post.findById(id);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Check ownership (authors can only delete their own posts, admins can delete any post)
  if (
    req.user.role === "author" &&
    post.author.toString() !== req.user._id.toString()
  ) {
    return next(new AppError("You can only delete your own posts", 403));
  }

  // Log delete activity
  await logActivity(
    {
      user: req.user._id,
      type: "delete_post",
      description: "Post deleted",
      details: `Deleted post "${post.title}" (${req.user.role === "admin" ? "Admin action" : "Author action"})`,
      targetPost: id,
    },
    req,
  );

  // Soft delete by setting isActive to false (preserves data)
  await Post.findByIdAndUpdate(id, { isActive: false });

  ApiResponse.success(res, null, "Post deleted successfully");
});

// Admin/Moderator functions
const publishPost = catchAsync(async (req, res, next) => {
  const post = await Post.findByIdAndUpdate(
    req.params.id,
    { status: "published", publishedAt: new Date() },
    { new: true, runValidators: true },
  );

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  ApiResponse.success(res, post, "Post published successfully");
});

const unpublishPost = catchAsync(async (req, res, next) => {
  const post = await Post.findByIdAndUpdate(
    req.params.id,
    { status: "draft" },
    { new: true, runValidators: true },
  );

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  ApiResponse.success(res, post, "Post unpublished successfully");
});

const featurePost = catchAsync(async (req, res, next) => {
  const post = await Post.findByIdAndUpdate(
    req.params.id,
    { isFeatured: !post.isFeatured },
    { new: true, runValidators: true },
  );

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  ApiResponse.success(
    res,
    post,
    `Post ${post.isFeatured ? "featured" : "unfeatured"} successfully`,
  );
});

const promotePost = catchAsync(async (req, res, next) => {
  // TODO: Implement post promotion logic
  return next(new AppError("Not implemented yet", 501));
});

const setTrending = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { isTrending } = req.body; // Allow explicit true/false, or toggle if not provided

  // Find the post first
  const post = await Post.findById(id);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Determine new trending status
  const newTrendingStatus = isTrending !== undefined ? isTrending : !post.isTrending;

  // Update the post
  const updatedPost = await Post.findByIdAndUpdate(
    id,
    { isTrending: newTrendingStatus },
    { new: true, runValidators: true },
  ).populate("author", "username firstName lastName profileImage");

  ApiResponse.success(
    res,
    updatedPost,
    `Post ${updatedPost.isTrending ? "set as trending" : "removed from trending"} successfully`,
  );
});

// Get all trending posts (admin view with filters)
const getAdminTrendingPosts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, status, search, sortBy = "createdAt" } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);

  // Build query
  let query = { isTrending: true };

  // Filter by status if provided
  if (status) {
    query.status = status;
  } else {
    // Default: show all statuses for admin
    query.status = { $in: ["published", "draft"] };
  }

  // Search filter
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { content: { $regex: search, $options: "i" } },
      { excerpt: { $regex: search, $options: "i" } },
    ];
  }

  // Sort options
  const sortOptions = {};
  switch (sortBy) {
    case "views":
      sortOptions.viewCount = -1;
      break;
    case "likes":
      sortOptions.likeCount = -1;
      break;
    case "shares":
      sortOptions.shareCount = -1;
      break;
    case "createdAt":
    default:
      sortOptions.createdAt = -1;
      break;
  }

  const posts = await Post.find(query)
    .populate("author", "username firstName lastName profileImage")
    .sort(sortOptions)
    .skip(skip)
    .limit(limitNum);

  const totalCount = await Post.countDocuments(query);

  const totalPages = Math.ceil(totalCount / limitNum);

  ApiResponse.success(
    res,
    {
      data: posts,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        totalCount,
        totalPages,
        hasMore: parseInt(page) < totalPages,
      },
    },
    "Trending posts retrieved successfully",
  );
});

// Bulk set trending status
const bulkSetTrending = catchAsync(async (req, res, next) => {
  const { postIds, isTrending } = req.body;

  if (!Array.isArray(postIds) || postIds.length === 0) {
    return next(new AppError("postIds must be a non-empty array", 400));
  }

  if (typeof isTrending !== "boolean") {
    return next(new AppError("isTrending must be a boolean", 400));
  }

  const result = await Post.updateMany(
    { _id: { $in: postIds } },
    { isTrending },
  );

  ApiResponse.success(
    res,
    {
      matched: result.matchedCount,
      modified: result.modifiedCount,
    },
    `${result.modifiedCount} posts ${isTrending ? "set as" : "removed from"} trending successfully`,
  );
});

// Toggle post visibility (admin only)
const togglePostVisibility = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Find the post
  const post = await Post.findById(id);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Toggle visibility
  const updatedPost = await Post.findByIdAndUpdate(
    id,
    { isVisible: !post.isVisible },
    { new: true, runValidators: true },
  ).populate("author", "username firstName lastName profileImage");

  // Log the action
  await logActivity(
    {
      user: req.user._id,
      type: "post_visibility_toggle",
      description: "Admin toggled post visibility",
      details: `Post "${post.title}" is now ${updatedPost.isVisible ? "visible" : "hidden"}`,
      targetPost: id,
    },
    req,
  );

  ApiResponse.success(
    res,
    updatedPost,
    `Post ${updatedPost.isVisible ? "made visible" : "hidden"} successfully`,
  );
});

// Like/Unlike post
const toggleLike = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;
  const userId = req.user._id;

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Check if user has already liked this post
  const existingLike = await Like.findOne({ user: userId, post: postId });

  if (existingLike) {
    // Unlike the post
    await Like.findByIdAndDelete(existingLike._id);
    await Post.findByIdAndUpdate(postId, { $inc: { likeCount: -1 } });

    const newLikeCount = Math.max(0, post.likeCount - 1);

    // Log unlike activity
    await logActivity(
      {
        user: userId,
        type: "post_unlike",
        description: "User unliked a post",
        details: `Removed like from "${post.title}"`,
        metadata: {
          postId: postId,
        },
      },
      req,
    );

    // Emit real-time update
    if (global.io) {
      global.io.to(`post_${postId}`).emit("likeUpdate", {
        postId,
        liked: false,
        likeCount: newLikeCount,
      });
    }

    ApiResponse.success(
      res,
      {
        liked: false,
        likeCount: newLikeCount,
        user: {
          _id: req.user._id,
          username: req.user.username,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          role: req.user.role,
          profileImage: req.user.profileImage,
        },
        post: {
          _id: post._id,
          title: post.title,
          slug: post.slug,
        },
      },
      "Post unliked successfully",
    );
  } else {
    // Like the post
    const newLike = await Like.create({
      user: userId,
      post: postId,
      // Store additional user data for future features
      userData: {
        username: req.user.username,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        role: req.user.role,
        profileImage: req.user.profileImage,
      },
    });
    await Post.findByIdAndUpdate(postId, { $inc: { likeCount: 1 } });

    const newLikeCount = post.likeCount + 1;

    // Send notification to post author if they have notifications enabled
    const postWithAuthor = await Post.findById(postId).populate(
      "author",
      "notifications email firstName lastName",
    );
    if (
      postWithAuthor.author &&
      postWithAuthor.author._id.toString() !== userId.toString() &&
      postWithAuthor.author.notifications?.likes
    ) {
      // Emit real-time notification
      if (global.io) {
        global.io.to(`user_${postWithAuthor.author._id}`).emit("notification", {
          type: "like",
          message: `${req.user.firstName || req.user.username} liked your post "${post.title}"`,
          postId: postId,
          postTitle: post.title,
          from: {
            _id: req.user._id,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            username: req.user.username,
            profileImage: req.user.profileImage,
          },
          timestamp: new Date(),
        });
      }
    }

    // Log like activity
    await logActivity(
      {
        user: userId,
        type: "post_like",
        description: "User liked a post",
        details: `Liked post "${post.title}"`,
        metadata: {
          postId: postId,
        },
      },
      req,
    );

    // Emit real-time update
    if (global.io) {
      global.io.to(`post_${postId}`).emit("likeUpdate", {
        postId,
        liked: true,
        likeCount: newLikeCount,
      });
    }

    ApiResponse.success(
      res,
      {
        liked: true,
        likeCount: newLikeCount,
        likeId: newLike._id,
        user: {
          _id: req.user._id,
          username: req.user.username,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          role: req.user.role,
          profileImage: req.user.profileImage,
        },
        post: {
          _id: post._id,
          title: post.title,
          slug: post.slug,
        },
      },
      "Post liked successfully",
    );
  }
});

// Check like status
const checkLikeStatus = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;
  const userId = req.user._id;

  const existingLike = await Like.findOne({ user: userId, post: postId });
  const post = await Post.findById(postId).select("likeCount");

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  ApiResponse.success(
    res,
    {
      liked: !!existingLike,
      likeCount: post.likeCount || 0,
    },
    "Like status retrieved successfully",
  );
});

// Get post likes
const getPostLikes = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const likes = await Like.find({ post: postId })
    .populate("user", "username firstName lastName profileImage")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Like.countDocuments({ post: postId });

  ApiResponse.success(
    res,
    {
      likes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
    "Post likes retrieved successfully",
  );
});

// Get post details by ID (optimized for speed)
const getPostById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId format
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
  if (!isObjectId) {
    return next(new AppError("Invalid post ID format", 400));
  }

  // Build query - admin can view draft posts, others can only view published
  const query = {
    _id: id,
    isActive: true,
  };

  // Non-admin users can only see published posts
  // Admin users can see both published and draft posts
  if (req.user?.role !== "admin") {
    query.status = "published";
  }

  // Use lean() for faster queries - no Mongoose document overhead
  const post = await Post.findOne(query)
    .populate("author", "username firstName lastName profileImage")
    .lean();

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Increment view count asynchronously (non-blocking) for published posts
  if (post.status === "published") {
    // Fire and forget - don't wait for view count update
    Post.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }).catch(() => {
      // Silently fail view count increment
    });
  }

  // Add like status if user is authenticated (optimized batch query)
  const postWithLikeStatus = await addLikeStatusToPosts([post], req.user?._id);

  ApiResponse.success(
    res,
    postWithLikeStatus[0],
    "Post retrieved successfully",
  );
});

// Recursive function to populate all nested replies
const populateRepliesRecursively = async (comment) => {
  // Populate author
  await comment.populate("author", "username firstName lastName profileImage");

  // Get all direct replies to this comment
  const replies = await Comment.find({
    parentComment: comment._id,
    isDeleted: false,
    moderationStatus: "approved",
  })
    .populate("author", "username firstName lastName profileImage")
    .sort({ createdAt: 1 });

  // Recursively populate replies for each reply
  if (replies.length > 0) {
    comment.replies = await Promise.all(
      replies.map((reply) => populateRepliesRecursively(reply)),
    );
  } else {
    comment.replies = [];
  }

  return comment;
};

// Get comments for a post
const getComments = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Get all top-level comments for this post
  const topLevelComments = await Comment.find({
    post: postId,
    parentComment: null,
    isDeleted: false,
    moderationStatus: "approved",
  })
    .populate("author", "username firstName lastName profileImage")
    .sort({ createdAt: -1 });

  // Recursively populate all nested replies
  const comments = await Promise.all(
    topLevelComments.map((comment) => populateRepliesRecursively(comment)),
  );

  ApiResponse.success(res, comments, "Comments retrieved successfully");
});

// Add a comment to a post
const addComment = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!content || content.trim().length === 0) {
    return next(new AppError("Comment content is required", 400));
  }

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Create the comment
  const comment = await Comment.create({
    content: content.trim(),
    post: postId,
    author: userId,
    moderationStatus: "approved", // Auto-approve for now
  });

  // Populate the author data
  await comment.populate("author", "username firstName lastName profileImage");

  // Send notification to post author if they have notifications enabled
  const postWithAuthor = await Post.findById(postId).populate(
    "author",
    "notifications email firstName lastName",
  );
  if (
    postWithAuthor.author &&
    postWithAuthor.author._id.toString() !== userId.toString() &&
    postWithAuthor.author.notifications?.comments
  ) {
    // Emit real-time notification
    if (global.io) {
      global.io.to(`user_${postWithAuthor.author._id}`).emit("notification", {
        type: "comment",
        message: `${req.user.firstName || req.user.username} commented on your post "${post.title}"`,
        postId: postId,
        postTitle: post.title,
        commentId: comment._id,
        commentContent:
          content.substring(0, 100) + (content.length > 100 ? "..." : ""),
        from: {
          _id: req.user._id,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          username: req.user.username,
          profileImage: req.user.profileImage,
        },
        timestamp: new Date(),
      });
    }
  }

  // Log comment activity
  await logActivity(
    {
      user: userId,
      type: "comment_create",
      description: "User commented on a post",
      details: `Commented on post "${post.title}": "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`,
      metadata: {
        postId: postId,
        commentId: comment._id,
      },
    },
    req,
  );

  // Emit real-time update for new comment
  if (global.io) {
    global.io.to(`post_${postId}`).emit("commentAdded", {
      postId,
      comment: comment,
      commentCount: await Comment.countDocuments({
        post: postId,
        isDeleted: false,
      }),
    });
  }

  ApiResponse.success(res, comment, "Comment added successfully");
});

// Reply to a comment
const replyToComment = catchAsync(async (req, res, next) => {
  const { id: postId, commentId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!content || content.trim().length === 0) {
    return next(new AppError("Reply content is required", 400));
  }

  // Check if post and parent comment exist
  const post = await Post.findById(postId);
  const parentComment = await Comment.findById(commentId);

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  if (!parentComment) {
    return next(new AppError("Parent comment not found", 404));
  }

  // Create the reply
  const reply = await Comment.create({
    content: content.trim(),
    post: postId,
    author: userId,
    parentComment: commentId,
    moderationStatus: "approved", // Auto-approve for now
  });

  // Populate the author data
  await reply.populate("author", "username firstName lastName profileImage");

  ApiResponse.success(res, reply, "Reply added successfully");
});

// Like/Unlike a comment
const likeComment = catchAsync(async (req, res, next) => {
  const { id: postId, commentId } = req.params;
  const userId = req.user._id;

  // Check if comment exists
  const comment = await Comment.findById(commentId);
  if (!comment) {
    return next(new AppError("Comment not found", 404));
  }

  // For now, just increment/decrement like count
  // TODO: Implement proper comment like tracking with a separate model
  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { $inc: { likeCount: 1 } },
    { new: true },
  ).populate("author", "username firstName lastName profileImage");

  ApiResponse.success(res, updatedComment, "Comment liked successfully");
});

// Update a comment
const updateComment = catchAsync(async (req, res, next) => {
  const { id: postId, commentId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!content || content.trim().length === 0) {
    return next(new AppError("Comment content is required", 400));
  }

  // Find the comment and check ownership
  const comment = await Comment.findOne({
    _id: commentId,
    author: userId,
    isDeleted: false,
  });

  if (!comment) {
    return next(
      new AppError(
        "Comment not found or you don't have permission to edit it",
        404,
      ),
    );
  }

  // Update the comment
  comment.content = content.trim();
  await comment.save();

  await comment.populate("author", "username firstName lastName profileImage");

  ApiResponse.success(res, comment, "Comment updated successfully");
});

// Delete a comment
const deleteComment = catchAsync(async (req, res, next) => {
  const { id: postId, commentId } = req.params;
  const userId = req.user._id;

  // Find the comment and check ownership
  const comment = await Comment.findOne({
    _id: commentId,
    author: userId,
    isDeleted: false,
  });

  if (!comment) {
    return next(
      new AppError(
        "Comment not found or you don't have permission to delete it",
        404,
      ),
    );
  }

  // Soft delete the comment
  comment.isDeleted = true;
  await comment.save();

  ApiResponse.success(res, null, "Comment deleted successfully");
});

// Track post share
const sharePost = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;
  // Track which platform was used (accepts object or string body)
  const platform =
    typeof req.body === "string"
      ? req.body
      : req.body?.platform || "unknown";

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Increment share count (atomic) and get updated value back
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { $inc: { shareCount: 1 } },
    { new: true },
  );

  const newShareCount = updatedPost?.shareCount ?? (post.shareCount || 0) + 1;

  // Log share activity only when authenticated (Activity.user is required)
  if (req.user?._id) {
    await logActivity(
      {
        user: req.user._id,
        type: "post_share",
        description: "User shared a post",
        details: `Shared post "${post.title}" on ${platform}`,
        metadata: {
          postId: postId,
          platform: platform,
        },
      },
      req,
    );
  }

  // Emit real-time update for share
  if (global.io) {
    global.io.to(`post_${postId}`).emit("shareUpdate", {
      postId,
      shareCount: newShareCount,
      platform,
    });
  }

  // You could also track individual shares in a separate collection if needed
  // For now, we'll just increment the count

  ApiResponse.success(
    res,
    {
      shareCount: newShareCount,
      platform,
      postId,
    },
    "Share tracked successfully",
  );
});

// Toggle bookmark for a post
const toggleBookmark = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;
  const userId = req.user._id;

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Check if user has already bookmarked this post
  const existingBookmark = await Bookmark.findOne({
    user: userId,
    post: postId,
  });

  if (existingBookmark) {
    // Remove bookmark
    await Bookmark.findByIdAndDelete(existingBookmark._id);

    // Log unbookmark activity
    await logActivity(
      {
        user: userId,
        type: "post_unbookmark",
        description: "User removed bookmark from a post",
        details: `Removed bookmark from "${post.title}"`,
        metadata: {
          postId: postId,
        },
      },
      req,
    );

    ApiResponse.success(
      res,
      {
        bookmarked: false,
        post: {
          _id: post._id,
          title: post.title,
          slug: post.slug,
        },
      },
      "Bookmark removed successfully",
    );
  } else {
    // Add bookmark
    const newBookmark = await Bookmark.create({
      user: userId,
      post: postId,
    });

    // Log bookmark activity
    await logActivity(
      {
        user: userId,
        type: "post_bookmark",
        description: "User bookmarked a post",
        details: `Bookmarked post "${post.title}"`,
        metadata: {
          postId: postId,
        },
      },
      req,
    );

    ApiResponse.success(
      res,
      {
        bookmarked: true,
        bookmarkId: newBookmark._id,
        post: {
          _id: post._id,
          title: post.title,
          slug: post.slug,
        },
      },
      "Post bookmarked successfully",
    );
  }
});

// Get user's bookmarked posts
const getUserBookmarks = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const userId = req.user._id;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const bookmarks = await Bookmark.find({ user: userId })
    .populate({
      path: "post",
      match: { status: "published", isActive: true },
      populate: {
        path: "author",
        select: "username firstName lastName profileImage",
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // Filter out bookmarks where post is null (deleted posts)
  const validBookmarks = bookmarks.filter((bookmark) => bookmark.post);
  const posts = validBookmarks.map((bookmark) => bookmark.post);

  // Add like status to bookmarked posts
  const postsWithLikeStatus = await addLikeStatusToPosts(posts, userId);

  const total = await Bookmark.countDocuments({ user: userId });

  ApiResponse.success(
    res,
    {
      bookmarks: postsWithLikeStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
    "Bookmarks retrieved successfully",
  );
});

// Check if post is bookmarked by user
const checkBookmarkStatus = catchAsync(async (req, res, next) => {
  const { id: postId } = req.params;
  const userId = req.user._id;

  const existingBookmark = await Bookmark.findOne({
    user: userId,
    post: postId,
  });

  ApiResponse.success(
    res,
    {
      bookmarked: !!existingBookmark,
    },
    "Bookmark status retrieved successfully",
  );
});

module.exports = {
  getLocationOptions,
  getAllPosts,
  getTrendingPosts,
  getFeaturedPosts,
  getPostsByCategory,
  searchPosts,
  getPostBySlug,
  getPostById,
  createPost,
  getMyPosts,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
  featurePost,
  promotePost,
  setTrending,
  getAdminTrendingPosts,
  bulkSetTrending,
  togglePostVisibility,
  toggleLike,
  checkLikeStatus,
  getPostLikes,
  getComments,
  addComment,
  replyToComment,
  likeComment,
  updateComment,
  deleteComment,
  sharePost,
  toggleBookmark,
  getUserBookmarks,
  checkBookmarkStatus,
};
