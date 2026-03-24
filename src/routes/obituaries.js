const express = require("express");
const { body } = require("express-validator");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");
const {
  getActiveObituaries,
  getAllObituaries,
  createObituary,
  updateObituary,
  toggleObituaryStatus,
  deleteObituary,
} = require("../controllers/obituaryController");

const router = express.Router();

router.get("/", optionalAuth, getActiveObituaries);
router.get(
  "/admin/all",
  protect,
  restrictTo("admin", "moderator"),
  getAllObituaries,
);

router.post(
  "/",
  protect,
  restrictTo("admin", "moderator"),
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ max: 180 })
      .withMessage("Title cannot exceed 180 characters"),
    body("message")
      .trim()
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ max: 400 })
      .withMessage("Message cannot exceed 400 characters"),
    body("location")
      .optional()
      .trim()
      .isLength({ max: 120 })
      .withMessage("Location cannot exceed 120 characters"),
    body("eventDate")
      .optional()
      .isISO8601()
      .withMessage("eventDate must be a valid ISO date"),
    body("expiresAt")
      .optional()
      .isISO8601()
      .withMessage("expiresAt must be a valid ISO date"),
  ],
  createObituary,
);

router.put(
  "/:id",
  protect,
  restrictTo("admin", "moderator"),
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ max: 180 })
      .withMessage("Title cannot exceed 180 characters"),
    body("message")
      .trim()
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ max: 400 })
      .withMessage("Message cannot exceed 400 characters"),
    body("location")
      .optional()
      .trim()
      .isLength({ max: 120 })
      .withMessage("Location cannot exceed 120 characters"),
    body("eventDate")
      .optional()
      .isISO8601()
      .withMessage("eventDate must be a valid ISO date"),
    body("expiresAt")
      .optional()
      .isISO8601()
      .withMessage("expiresAt must be a valid ISO date"),
  ],
  updateObituary,
);

router.patch(
  "/:id/toggle",
  protect,
  restrictTo("admin", "moderator"),
  toggleObituaryStatus,
);

router.delete(
  "/:id",
  protect,
  restrictTo("admin", "moderator"),
  deleteObituary,
);

module.exports = router;
