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

// Get all posts (public)
const getAllPosts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 8 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);

  // Get posts with pagination and populate author with privacy settings
  const posts = await Post.find({
    status: "published",
    publishedAt: { $lte: new Date() },
    isActive: true,
    isVisible: true, // Only show visible posts to public
  })
    .populate(
      "author",
      "username firstName lastName profileImage email privacy notifications theme",
    )
    .sort({ publishedAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination info
  const totalCount = await Post.countDocuments({
    status: "published",
    isActive: true,
    isVisible: true, // Only count visible posts
  });

  // Add like status if user is authenticated
  const postsWithLikeStatus = await addLikeStatusToPosts(posts, req.user?._id);

  // Calculate pagination info
  const totalPages = Math.ceil(totalCount / limitNum);
  const hasMore = parseInt(page) < totalPages;

  ApiResponse.success(
    res,
    {
      data: postsWithLikeStatus,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        totalCount,
        totalPages,
        hasMore,
      },
      totalCount, // For backward compatibility
      hasMore, // For backward compatibility
    },
    `Posts retrieved successfully (Page ${page} of ${totalPages})`,
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
            content: 1,
            excerpt: 1,
            featuredImage: 1,
            tags: 1,
            category: 1,
            status: 1,
            likes: 1,
            comments: 1,
            shares: 1,
            views: 1,
            createdAt: 1,
            updatedAt: 1,
            trendingScore: 1,
            "author._id": 1,
            "author.firstName": 1,
            "author.lastName": 1,
            "author.username": 1,
            "author.profileImage": 1,
            "author.email": 1,
            "author.privacy": 1,
            "author.notifications": 1,
            "author.theme": 1,
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
        .populate(
          "author",
          "username firstName lastName profileImage email privacy notifications theme",
        )
        .sort(sortOption)
        .limit(parseInt(limit));
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
    .sort({ publishedAt: -1 })
    .limit(5)
    .populate(
      "author",
      "username firstName lastName profileImage email privacy notifications theme",
    );

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
  const post = await Post.findOne({
    slug: req.params.slug,
    status: "published",
    isActive: true,
  }).populate("author", "username firstName lastName profileImage");

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Increment view count
  await post.incrementViewCount();

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
    category,
    tags,
    featuredImage,
    featuredVideo,
  } = req.body;

  // Create post object
  const postData = {
    title: title.trim(),
    content: content.trim(),
    author: req.user._id,
    category,
    status: "draft", // Always start as draft
  };

  // Add optional fields if provided
  if (excerpt && excerpt.trim()) {
    postData.excerpt = excerpt.trim();
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

  // Check if user can publish posts
  if (req.user.role === "admin") {
    // Admin can always publish
    postData.status = "published";
    postData.publishedAt = new Date();
  } else if (req.user.canPublish) {
    // User with publishing permission (including moderators)
    postData.status = "published";
    postData.publishedAt = new Date();
  } else {
    // User cannot publish, force to draft
    postData.status = "draft";
  }

  // Create the post
  const post = await Post.create(postData);

  // Populate author info for response
  await post.populate("author", "username firstName lastName profileImage");

  const message =
    postData.status === "published"
      ? "Post created and published successfully"
      : "Post created as draft successfully";

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
  const { title, content, excerpt, category, tags, featuredImage } = req.body;

  // Find the post
  const post = await Post.findById(id);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Check ownership (authors can only edit their own posts)
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
  if (excerpt !== undefined) updateData.excerpt = excerpt ? excerpt.trim() : "";
  if (category) updateData.category = category;

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

  // Update the post
  const updatedPost = await Post.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).populate("author", "username firstName lastName profileImage");

  ApiResponse.success(res, updatedPost, "Post updated successfully");
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
  const post = await Post.findByIdAndUpdate(
    req.params.id,
    { isTrending: !post.isTrending },
    { new: true, runValidators: true },
  );

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  ApiResponse.success(
    res,
    post,
    `Post ${post.isTrending ? "set as trending" : "removed from trending"} successfully`,
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

// Get post details by ID (for modal)
const getPostById = catchAsync(async (req, res, next) => {
  const post = await Post.findOne({
    _id: req.params.id,
    status: "published",
    isActive: true,
  }).populate("author", "username firstName lastName profileImage");

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Increment view count
  await post.incrementViewCount();

  // Add like status if user is authenticated
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
  const { platform = "unknown" } = req.body; // Track which platform was used

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Increment share count
  await Post.findByIdAndUpdate(postId, { $inc: { shareCount: 1 } });

  const newShareCount = (post.shareCount || 0) + 1;

  // Log share activity
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
