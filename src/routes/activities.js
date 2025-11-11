const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  getUserActivities,
  getActivityStats,
  getUserActivitySummary,
  deleteUserActivity,
  getAllActivities,
} = require("../controllers/activityController");

const router = express.Router();

// Protected routes - authentication required
router.use(protect);

// User routes
router.get("/my-activities", getUserActivities);
router.get("/my-stats", getActivityStats);
router.delete("/my-activities/:activityId", deleteUserActivity);

// Admin routes
router.get(
  "/users/:userId/summary",
  restrictTo("admin", "moderator"),
  getUserActivitySummary,
);
router.get("/all", restrictTo("admin"), getAllActivities);

module.exports = router;
