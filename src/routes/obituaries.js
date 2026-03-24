const express = require("express");
const { body } = require("express-validator");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");
const {
  getActiveObituaries,
  createObituary,
} = require("../controllers/obituaryController");

const router = express.Router();

router.get("/", optionalAuth, getActiveObituaries);

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

module.exports = router;
