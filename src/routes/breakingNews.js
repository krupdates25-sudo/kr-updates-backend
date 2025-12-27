const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { protect, restrictTo } = require("../middleware/auth");
const {
  getAllStories,
  getAdminStories,
  getActiveStories,
  getStoryById,
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
router.get("/active", getActiveStories);

// Protected routes
router.use(protect);

// Get all stories (with filters)
router.get("/", getAllStories);

// Admin routes for breaking news management
router.get(
  "/admin/all",
  restrictTo("admin", "moderator"),
  getAdminStories,
);
router.patch(
  "/admin/bulk/status",
  restrictTo("admin", "moderator"),
  bulkUpdateStories,
);
router.delete(
  "/admin/bulk",
  restrictTo("admin", "moderator"),
  bulkDeleteStories,
);

// Get story by ID
router.get("/:id", getStoryById);

// Create new story (admin and moderators only)
router.post(
  "/",
  restrictTo("admin", "moderator"),
  storyValidation,
  createStory,
);

// Update story
router.put("/:id", storyValidation, updateStory);

// Delete story
router.delete("/:id", deleteStory);

// Toggle story status
router.patch("/:id/toggle", toggleStoryStatus);

// Extend story expiry
router.patch("/:id/extend", extendStoryExpiry);

module.exports = router;
