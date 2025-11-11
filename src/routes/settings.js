const express = require("express");
const settingsController = require("../controllers/settingsController");
const { protect, restrictTo } = require("../middleware/auth");

const router = express.Router();

// Public route - Get site settings
router.get("/", settingsController.getSettings);

// Admin only routes
router.use(protect, restrictTo("admin"));

// Update site settings
router.patch("/", settingsController.updateSettings);

module.exports = router;

