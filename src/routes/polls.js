const express = require("express");
const { body, param, query } = require("express-validator");
const { protect, restrictTo } = require("../middleware/auth");
const {
  listActivePolls,
  getPollById,
  listAllPollsAdmin,
  createPoll,
  updatePoll,
  deletePoll,
  votePoll,
} = require("../controllers/pollController");

const router = express.Router();

const adminRoles = restrictTo("admin", "moderator");

router.get(
  "/admin/all",
  protect,
  adminRoles,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status").optional().isIn(["all", "active", "inactive"]),
  ],
  listAllPollsAdmin,
);

router.post(
  "/",
  protect,
  adminRoles,
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ max: 200 }),
    body("description").optional().trim().isLength({ max: 2000 }),
    body("options")
      .isArray({ min: 2, max: 12 })
      .withMessage("Provide between 2 and 12 options"),
    body("options.*").trim().notEmpty().isLength({ max: 200 }),
    body("isActive").optional().isBoolean(),
    body("expiresAt").optional().isISO8601(),
  ],
  createPoll,
);

router.get("/", listActivePolls);

router.get("/:id", getPollById);

router.post(
  "/:id/vote",
  [
    param("id").isMongoId().withMessage("Invalid poll id"),
    body("optionIndex").isInt({ min: 0 }).withMessage("optionIndex required"),
    body("clientId")
      .trim()
      .notEmpty()
      .withMessage("clientId is required for anonymous voting")
      .isString()
      .isLength({ min: 10, max: 128 }),
  ],
  votePoll,
);

router.put(
  "/:id",
  protect,
  adminRoles,
  [
    param("id").isMongoId(),
    body("title").optional().trim().notEmpty().isLength({ max: 200 }),
    body("description").optional().trim().isLength({ max: 2000 }),
    body("options")
      .optional()
      .isArray({ min: 2, max: 12 }),
    body("options.*").optional().trim().notEmpty().isLength({ max: 200 }),
    body("isActive").optional().isBoolean(),
    body("expiresAt").optional().isISO8601(),
  ],
  updatePoll,
);

router.delete(
  "/:id",
  protect,
  adminRoles,
  [param("id").isMongoId()],
  deletePoll,
);

module.exports = router;
