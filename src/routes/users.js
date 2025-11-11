const express = require("express");
const userController = require("../controllers/userController");
const { protect, restrictTo } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/security");

const router = express.Router();

// Apply API rate limiting to all routes
// router.use(apiLimiter); // Removed rate limiting

// Public routes
router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUser);

// Protected routes - authentication required
router.use(protect);

router.get("/profile/me", userController.getMyProfile);
router.patch("/profile/me", userController.updateMyProfile);
router.post("/change-password", userController.changePassword);
router.get("/stats/me", userController.getUserStats);
router.delete("/delete-self", userController.deleteSelf);

// Admin only routes
router.use(restrictTo("admin"));

// Admin user management
router.post("/create-subadmin", userController.createSubAdmin);
router.get("/admin/all", userController.getAllUsersAdmin);
router.patch("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);
router.patch("/:id/activate", userController.activateUser);
router.patch("/:id/deactivate", userController.deactivateUser);
router.patch(
  "/:id/publishing-permission",
  userController.toggleUserPublishingPermission,
);

module.exports = router;
