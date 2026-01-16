const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  getSubscribers,
  getSubscriber,
  createSubscriber,
  updateSubscriber,
  deleteSubscriber,
} = require("../controllers/updatesController");

const router = express.Router();

// Public route - for subscription form
router.post("/subscribe", createSubscriber);

// Admin only routes
router.use(protect); // All routes below require authentication

router.get("/subscribers", restrictTo("admin"), getSubscribers);
router.get("/subscribers/:id", restrictTo("admin"), getSubscriber);
router.patch("/subscribers/:id", restrictTo("admin"), updateSubscriber);
router.delete("/subscribers/:id", restrictTo("admin"), deleteSubscriber);

module.exports = router;
