const express = require("express");
const advertisementController = require("../controllers/advertisementController");
const { protect, restrictTo } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.get("/active", advertisementController.getActiveAdvertisements);
router.post("/:id/click", advertisementController.trackClick);

// Protected routes - require authentication
router.use(protect);

// Advertisement CRUD operations
router
  .route("/")
  .get(advertisementController.getAllAdvertisements)
  .post(advertisementController.createAdvertisement);

router
  .route("/:id")
  .get(advertisementController.getAdvertisement)
  .patch(advertisementController.updateAdvertisement)
  .delete(advertisementController.deleteAdvertisement);

// Advertisement specific operations
router.patch(
  "/:id/position",
  advertisementController.updateAdvertisementPosition,
);
router.patch(
  "/:id/toggle-status",
  advertisementController.toggleAdvertisementStatus,
);
router.get("/:id/analytics", advertisementController.getAdvertisementAnalytics);

// Bulk operations
router.patch("/bulk/update", advertisementController.bulkUpdateAdvertisements);

// Admin only routes
router.get(
  "/admin/dashboard-stats",
  restrictTo("admin"),
  advertisementController.getDashboardStats,
);

module.exports = router;
