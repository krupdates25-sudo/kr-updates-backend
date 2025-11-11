const express = require("express");
const {
  getUsers,
  sendNotification,
  sendTestEmail,
} = require("../controllers/notificationController");
const { protect, restrictTo } = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Admin only routes
router.use(restrictTo("admin"));

// Get users for notification selection
router.get("/users", getUsers);

// Send notification to users
router.post("/send", sendNotification);

// Send test email
router.post("/test", sendTestEmail);

module.exports = router;
