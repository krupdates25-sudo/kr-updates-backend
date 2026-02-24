const express = require("express");
const { body } = require("express-validator");
const postController = require("../controllers/postController");
const ogController = require("../controllers/ogController");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/security");

const router = express.Router();

// Apply API rate limiting to all routes
// router.use(apiLimiter); // Removed rate limiting

// Validation rules
const createPostValidation = [
  body("title")
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Title must be between 5 and 200 characters"),
  body("content")
    .trim()
    .isLength({ min: 50 })
    .withMessage("Content must be at least 50 characters long"),
  body("category")
    .isIn([
      "Education",
      "Technology",
      "Programming",
      "Web Development",
      "Mobile Development",
      "Data Science",
      "AI & Machine Learning",
      "Cybersecurity",
      "DevOps",
      "Design",
      "Business",
      "Startup",
      "Career",
      "Tutorial",
      "News",
      "Review",
      "Opinion",
      "general",
      "technology",
      "business",
      "sports",
      "entertainment",
      "health",
      "science",
      "politics",
      "lifestyle",
      "other",
    ])
    .withMessage("Please select a valid category"),
  body("tags").optional().isArray().withMessage("Tags must be an array"),
  body("tags.*")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("Each tag cannot exceed 30 characters"),
];

const updatePostValidation = [
  body("title")
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Title must be between 5 and 200 characters"),
  body("content")
    .optional()
    .trim()
    .isLength({ min: 50 })
    .withMessage("Content must be at least 50 characters long"),
  body("category")
    .optional()
    .isIn([
      "Education",
      "Technology",
      "Programming",
      "Web Development",
      "Mobile Development",
      "Data Science",
      "AI & Machine Learning",
      "Cybersecurity",
      "DevOps",
      "Design",
      "Business",
      "Startup",
      "Career",
      "Tutorial",
      "News",
      "Review",
      "Opinion",
      "general",
      "technology",
      "business",
      "sports",
      "entertainment",
      "health",
      "science",
      "politics",
      "lifestyle",
      "other",
    ])
    .withMessage("Please select a valid category"),
  body("tags").optional().isArray().withMessage("Tags must be an array"),
  body("tags.*")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("Each tag cannot exceed 30 characters"),
];

// Public routes (with optional authentication for personalization)
router.get("/", optionalAuth, postController.getAllPosts);
router.get("/trending", optionalAuth, postController.getTrendingPosts);
router.get("/featured", optionalAuth, postController.getFeaturedPosts);
router.get(
  "/category/:category",
  optionalAuth,
  postController.getPostsByCategory,
);
router.get("/search", optionalAuth, postController.searchPosts);
router.get("/details/:id", optionalAuth, postController.getPostById);
// Locations options for UI filters / creation suggestions (must be before /:slug)
router.get("/locations", optionalAuth, postController.getLocationOptions);
// Open Graph route for bots (must be before /:slug route)
router.get("/og/:slug", ogController.getPostOG);
router.get("/:slug", optionalAuth, postController.getPostBySlug);

// Comments can be viewed without authentication
router.get("/:id/comments", optionalAuth, postController.getComments);

// Share tracking should work without login (optional authentication for attribution)
router.post("/:id/share", optionalAuth, postController.sharePost);

// Protected routes - authentication required
router.use(protect);

// Like functionality (all authenticated users)
router.post("/:id/like", postController.toggleLike);
router.get("/:id/like-status", postController.checkLikeStatus);
router.get("/:id/likes", postController.getPostLikes);

// Bookmark functionality (all authenticated users)
router.post("/:id/bookmark", postController.toggleBookmark);
router.get("/:id/bookmark-status", postController.checkBookmarkStatus);
router.get("/my/bookmarks", postController.getUserBookmarks);

// Comment functionality (authenticated users only for write operations)
router.post("/:id/comments", postController.addComment);
router.post("/:id/comments/:commentId/replies", postController.replyToComment);
router.post("/:id/comments/:commentId/like", postController.likeComment);
router.put("/:id/comments/:commentId", postController.updateComment);
router.delete("/:id/comments/:commentId", postController.deleteComment);

// Author and above can create posts
router.post(
  "/",
  restrictTo("admin", "moderator", "author"),
  createPostValidation,
  postController.createPost,
);

// Author can manage their own posts, admin/moderator can manage all
router.get("/my/posts", postController.getMyPosts);
router.patch("/:id", updatePostValidation, postController.updatePost);
router.delete("/:id", postController.deletePost);

// Admin/Moderator only routes
router.patch(
  "/:id/publish",
  restrictTo("admin", "moderator"),
  postController.publishPost,
);
router.patch(
  "/:id/unpublish",
  restrictTo("admin", "moderator"),
  postController.unpublishPost,
);
router.patch(
  "/:id/feature",
  restrictTo("admin", "moderator"),
  postController.featurePost,
);
router.patch(
  "/:id/promote",
  restrictTo("admin", "moderator"),
  postController.promotePost,
);
router.patch(
  "/:id/trending",
  restrictTo("admin", "moderator"),
  postController.setTrending,
);
// Admin trending posts management
router.get(
  "/admin/trending",
  restrictTo("admin", "moderator"),
  postController.getAdminTrendingPosts,
);
router.patch(
  "/admin/trending/bulk",
  restrictTo("admin", "moderator"),
  postController.bulkSetTrending,
);
router.patch(
  "/:id/visibility",
  restrictTo("admin"),
  postController.togglePostVisibility,
);

module.exports = router;

// touch 1768044678157

