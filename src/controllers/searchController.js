const Post = require("../models/Post");
const User = require("../models/User");
const Announcement = require("../models/Announcement");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const ApiResponse = require("../utils/apiResponse");

// Global search across all content types
const globalSearch = catchAsync(async (req, res, next) => {
  const { q: query, limit = 10 } = req.query;

  if (!query || query.trim().length < 2) {
    return ApiResponse.success(
      res,
      {
        posts: [],
        users: [],
        announcements: [],
        categories: [],
        total: 0,
      },
      "Search query too short",
    );
  }

  const searchQuery = query.trim();
  const limitNum = parseInt(limit);

  try {
    // Search posts
    const posts = await Post.find({
      $or: [
        { title: { $regex: searchQuery, $options: "i" } },
        { content: { $regex: searchQuery, $options: "i" } },
        { excerpt: { $regex: searchQuery, $options: "i" } },
        { tags: { $in: [new RegExp(searchQuery, "i")] } },
        { category: { $regex: searchQuery, $options: "i" } },
      ],
      status: "published",
      isActive: true,
      isVisible: true,
    })
      .populate("author", "username firstName lastName profileImage")
      .select(
        "title excerpt category tags author viewCount likeCount commentCount publishedAt slug featuredImage image",
      )
      .limit(limitNum)
      .sort({ publishedAt: -1 });

    // Search users
    const users = await User.find({
      $or: [
        { username: { $regex: searchQuery, $options: "i" } },
        { firstName: { $regex: searchQuery, $options: "i" } },
        { lastName: { $regex: searchQuery, $options: "i" } },
        { email: { $regex: searchQuery, $options: "i" } },
      ],
      isActive: true,
    })
      .select("username firstName lastName profileImage role bio")
      .limit(limitNum)
      .sort({ createdAt: -1 });

    // Search announcements
    const announcements = await Announcement.find({
      $or: [
        { title: { $regex: searchQuery, $options: "i" } },
        { message: { $regex: searchQuery, $options: "i" } },
      ],
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    })
      .populate("createdBy", "username firstName lastName")
      .select("title message type priority icon actionUrl actionText createdAt")
      .limit(limitNum)
      .sort({ priority: -1, createdAt: -1 });

    // Get unique categories
    const categories = await Post.distinct("category", {
      category: { $regex: searchQuery, $options: "i" },
      status: "published",
      isActive: true,
      isVisible: true,
    });

    const results = {
      posts: posts.map((post) => ({
        id: post._id,
        title: post.title,
        excerpt: post.excerpt,
        category: post.category,
        tags: post.tags,
        author: post.author,
        viewCount: post.viewCount,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        publishedAt: post.publishedAt,
        slug: post.slug,
        featuredImage: post.featuredImage,
        image: post.image,
        type: "post",
      })),
      users: users.map((user) => ({
        id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
        role: user.role,
        bio: user.bio,
        type: "user",
      })),
      announcements: announcements.map((announcement) => ({
        id: announcement._id,
        title: announcement.title,
        message: announcement.message,
        type: announcement.type,
        priority: announcement.priority,
        icon: announcement.icon,
        actionUrl: announcement.actionUrl,
        actionText: announcement.actionText,
        createdAt: announcement.createdAt,
        createdBy: announcement.createdBy,
        type: "announcement",
      })),
      categories: categories.map((category) => ({
        name: category,
        type: "category",
      })),
      total:
        posts.length + users.length + announcements.length + categories.length,
    };

    ApiResponse.success(res, results, "Search results retrieved successfully");
  } catch (error) {
    console.error("Search error:", error);
    return next(new AppError("Search failed", 500));
  }
});

// Search posts only
const searchPosts = catchAsync(async (req, res, next) => {
  const { q: query, limit = 5 } = req.query;

  if (!query || query.trim().length < 2) {
    return ApiResponse.success(res, [], "Search query too short");
  }

  const searchQuery = query.trim();
  const limitNum = parseInt(limit);

  const posts = await Post.find({
    $or: [
      { title: { $regex: searchQuery, $options: "i" } },
      { content: { $regex: searchQuery, $options: "i" } },
      { excerpt: { $regex: searchQuery, $options: "i" } },
      { tags: { $in: [new RegExp(searchQuery, "i")] } },
      { category: { $regex: searchQuery, $options: "i" } },
    ],
    status: "published",
    isActive: true,
    isVisible: true,
  })
    .populate("author", "username firstName lastName profileImage")
    .select(
      "title excerpt category tags author viewCount likeCount commentCount publishedAt slug",
    )
    .limit(limitNum)
    .sort({ publishedAt: -1 });

  ApiResponse.success(
    res,
    posts,
    "Posts search results retrieved successfully",
  );
});

// Search users only
const searchUsers = catchAsync(async (req, res, next) => {
  const { q: query, limit = 5 } = req.query;

  if (!query || query.trim().length < 2) {
    return ApiResponse.success(res, [], "Search query too short");
  }

  const searchQuery = query.trim();
  const limitNum = parseInt(limit);

  const users = await User.find({
    $or: [
      { username: { $regex: searchQuery, $options: "i" } },
      { firstName: { $regex: searchQuery, $options: "i" } },
      { lastName: { $regex: searchQuery, $options: "i" } },
      { email: { $regex: searchQuery, $options: "i" } },
    ],
    isActive: true,
  })
    .select("username firstName lastName profileImage role bio")
    .limit(limitNum)
    .sort({ createdAt: -1 });

  ApiResponse.success(
    res,
    users,
    "Users search results retrieved successfully",
  );
});

// Search announcements only
const searchAnnouncements = catchAsync(async (req, res, next) => {
  const { q: query, limit = 5 } = req.query;

  if (!query || query.trim().length < 2) {
    return ApiResponse.success(res, [], "Search query too short");
  }

  const searchQuery = query.trim();
  const limitNum = parseInt(limit);

  const announcements = await Announcement.find({
    $or: [
      { title: { $regex: searchQuery, $options: "i" } },
      { message: { $regex: searchQuery, $options: "i" } },
    ],
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  })
    .populate("createdBy", "username firstName lastName")
    .select("title message type priority icon actionUrl actionText createdAt")
    .limit(limitNum)
    .sort({ priority: -1, createdAt: -1 });

  ApiResponse.success(
    res,
    announcements,
    "Announcements search results retrieved successfully",
  );
});

// Search categories only
const searchCategories = catchAsync(async (req, res, next) => {
  const { q: query, limit = 5 } = req.query;

  if (!query || query.trim().length < 2) {
    return ApiResponse.success(res, [], "Search query too short");
  }

  const searchQuery = query.trim();
  const limitNum = parseInt(limit);

  const categories = await Post.distinct("category", {
    category: { $regex: searchQuery, $options: "i" },
    status: "published",
    isActive: true,
    isVisible: true,
  });

  const categoryResults = categories.slice(0, limitNum).map((category) => ({
    name: category,
    count: 0, // You can add count logic here if needed
  }));

  ApiResponse.success(
    res,
    categoryResults,
    "Categories search results retrieved successfully",
  );
});

// Get search suggestions
const getSuggestions = catchAsync(async (req, res, next) => {
  const { q: query, limit = 8 } = req.query;

  if (!query || query.trim().length < 2) {
    return ApiResponse.success(res, [], "Search query too short");
  }

  const searchQuery = query.trim();
  const limitNum = parseInt(limit);

  try {
    // Get suggestions from posts titles
    const postSuggestions = await Post.find({
      title: { $regex: searchQuery, $options: "i" },
      status: "published",
      isActive: true,
      isVisible: true,
    })
      .select("title")
      .limit(Math.ceil(limitNum / 2))
      .sort({ viewCount: -1 });

    // Get suggestions from categories
    const categorySuggestions = await Post.distinct("category", {
      category: { $regex: searchQuery, $options: "i" },
      status: "published",
      isActive: true,
      isVisible: true,
    });

    // Get suggestions from tags
    const tagSuggestions = await Post.distinct("tags", {
      tags: { $in: [new RegExp(searchQuery, "i")] },
      status: "published",
      isActive: true,
      isVisible: true,
    });

    const suggestions = [
      ...postSuggestions.map((post) => ({
        text: post.title,
        type: "post",
        category: "Posts",
      })),
      ...categorySuggestions
        .slice(0, Math.ceil(limitNum / 4))
        .map((category) => ({
          text: category,
          type: "category",
          category: "Categories",
        })),
      ...tagSuggestions.slice(0, Math.ceil(limitNum / 4)).map((tag) => ({
        text: tag,
        type: "tag",
        category: "Tags",
      })),
    ].slice(0, limitNum);

    ApiResponse.success(
      res,
      suggestions,
      "Search suggestions retrieved successfully",
    );
  } catch (error) {
    console.error("Suggestions error:", error);
    return next(new AppError("Failed to get suggestions", 500));
  }
});

// Get trending searches
const getTrendingSearches = catchAsync(async (req, res, next) => {
  const { limit = 5 } = req.query;
  const limitNum = parseInt(limit);

  try {
    // Get trending categories
    const trendingCategories = await Post.aggregate([
      { $match: { status: "published", isActive: true, isVisible: true } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limitNum },
      { $project: { name: "$_id", count: 1, _id: 0 } },
    ]);

    ApiResponse.success(
      res,
      trendingCategories,
      "Trending searches retrieved successfully",
    );
  } catch (error) {
    console.error("Trending searches error:", error);
    return next(new AppError("Failed to get trending searches", 500));
  }
});

module.exports = {
  globalSearch,
  searchPosts,
  searchUsers,
  searchAnnouncements,
  searchCategories,
  getSuggestions,
  getTrendingSearches,
};
