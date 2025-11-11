const express = require("express");
const {
  getActiveAnnouncements,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getAnnouncement,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementStatus,
  getAnnouncementStats,
} = require("../controllers/announcementController");
const { protect, restrictTo } = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(protect);

// User routes (accessible by all authenticated users)
router.get("/active", getActiveAnnouncements);
router.get("/unread-count", getUnreadCount);
router.get("/:id", getAnnouncement);
router.patch("/:id/read", markAsRead);
router.patch("/mark-all-read", markAllAsRead);

// Admin only routes
router.use(restrictTo("admin"));

router.route("/").get(getAllAnnouncements).post(createAnnouncement);

router.route("/:id").patch(updateAnnouncement).delete(deleteAnnouncement);

router.patch("/:id/toggle-status", toggleAnnouncementStatus);
router.get("/admin/stats", getAnnouncementStats);

module.exports = router;
