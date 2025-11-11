const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { authLimiter, passwordResetLimiter } = require("../middleware/security");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Simplified validation rules for easier registration
const registerValidation = [
  body("username")
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("firstName")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("First name is required"),
  body("lastName")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Last name is required"),
];

const loginValidation = [
  body("username").notEmpty().withMessage("Username or email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

const forgotPasswordValidation = [
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email")
    .normalizeEmail(),
];

// Simplified password reset validation
const resetPasswordValidation = [
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
];

// Authentication routes
router.post("/register", registerValidation, authController.register);
router.post("/login", loginValidation, authController.login);
router.post("/logout", authController.logout);
router.post("/refresh-token", authController.refreshToken);

// Email verification
router.get("/verify-email/:token", authController.verifyEmail);
router.post(
  "/resend-verification",
  authLimiter,
  authController.resendVerification,
);

// Password reset
router.post(
  "/forgot-password",
  passwordResetLimiter,
  forgotPasswordValidation,
  authController.forgotPassword,
);
router.patch(
  "/reset-password/:token",
  passwordResetLimiter,
  resetPasswordValidation,
  authController.resetPassword,
);

// Protected routes
router.patch("/update-password", protect, authController.updatePassword);
router.get("/me", protect, authController.getMe);
router.patch("/update-me", protect, authController.updateMe);
router.delete("/delete-me", protect, authController.deleteMe);

module.exports = router;
