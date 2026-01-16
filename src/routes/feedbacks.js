const express = require("express");
const feedbackController = require("../controllers/feedbackController");
const { protect, restrictTo } = require("../middleware/auth");

const router = express.Router();

// Public route - anyone can submit feedback
router.post("/", feedbackController.submitFeedback);

// Protected admin routes
router.use(protect);
router.use(restrictTo("admin"));

// Admin routes
router.get("/", feedbackController.getAllFeedbacks);
router.get("/stats", feedbackController.getFeedbackStats);
router.get("/:id", feedbackController.getFeedback);
router.patch("/:id/status", feedbackController.updateFeedbackStatus);
router.delete("/:id", feedbackController.deleteFeedback);

module.exports = router;

