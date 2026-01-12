const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");
const {
  getAllStories,
  getAdminStories,
  getActiveStories,
  getStoryById,
  getPublicStoryById,
  createStory,
  updateStory,
  deleteStory,
  toggleStoryStatus,
  extendStoryExpiry,
  bulkUpdateStories,
  bulkDeleteStories,
} = require("../controllers/breakingNewsController");

// Validation rules
const storyValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 200 })
    .withMessage("Title cannot exceed 200 characters"),
  body("excerpt")
    .trim()
    .notEmpty()
    .withMessage("Excerpt is required")
    .isLength({ max: 500 })
    .withMessage("Excerpt cannot exceed 500 characters"),
  body("content").trim().notEmpty().withMessage("Content is required"),
  body("image.url")
    .notEmpty()
    .withMessage("Image URL is required")
    .custom((value) => {
      // Check if it's a data URL
      if (value.startsWith("data:")) {
        return true;
      }
      // Check if it's a regular URL
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    })
    .withMessage("Image URL must be a valid URL or data URL"),
  body("category")
    .isIn([
      "Technology",
      "Business",
      "Science",
      "World",
      "Health",
      "Sports",
      "Politics",
      "Entertainment",
      "General",
    ])
    .withMessage("Invalid category"),
  body("priority")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("Priority must be between 1 and 10"),
  body("expiresAt")
    .optional()
    .isISO8601()
    .withMessage("Expiry date must be a valid ISO 8601 date")
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error("Expiry date must be in the future");
      }
      return true;
    }),
];

// Public routes
// NOTE: Frontend calls GET /breaking-news/ for viewing, so keep this public.
router.get("/", optionalAuth, (req, res) => {
  // If an admin/moderator is logged in, return full list for management UI.
  if (req.user && ["admin", "moderator"].includes(req.user.role)) {
    return getAllStories(req, res);
  }
  return getActiveStories(req, res);
});
router.get("/active", getActiveStories);

// Admin routes for breaking news management (protected)
router.get(
  "/admin/all",
  protect,
  restrictTo("admin", "moderator"),
  getAdminStories,
);
router.patch(
  "/admin/bulk/status",
  protect,
  restrictTo("admin", "moderator"),
  bulkUpdateStories,
);
router.delete(
  "/admin/bulk",
  protect,
  restrictTo("admin", "moderator"),
  bulkDeleteStories,
);

// Get all stories (with filters) - protected (includes inactive/expired unless filtered)
router.get("/all", protect, getAllStories);

// Create new story (admin and moderators only)
router.post(
  "/",
  protect,
  restrictTo("admin", "moderator"),
  storyValidation,
  createStory,
);

// Update story
router.put("/:id", protect, storyValidation, updateStory);

// Delete story
router.delete("/:id", protect, deleteStory);

// Toggle story status
router.patch("/:id/toggle", protect, toggleStoryStatus);

// Extend story expiry
router.patch("/:id/extend", protect, extendStoryExpiry);

// Public/optional-auth story detail route must come last so it doesn't shadow /admin/*, /all, etc.
router.get("/:id", optionalAuth, (req, res) => {
  if (req.user && ["admin", "moderator"].includes(req.user.role)) {
    return getStoryById(req, res);
  }
  return getPublicStoryById(req, res);
});

module.exports = router;
