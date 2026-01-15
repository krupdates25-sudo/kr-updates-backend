const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middleware/auth");

const updatesController = require("../controllers/updatesController");

// Public: collect leads for "Want updates?"
router.post("/subscribe", updatesController.subscribe);

// Admin routes: Get all subscribers and manage them
router.get(
  "/subscribers",
  protect,
  restrictTo("admin"),
  updatesController.getAllSubscribers
);

router.patch(
  "/subscribers/:id",
  protect,
  restrictTo("admin"),
  updatesController.updateSubscriber
);

router.delete(
  "/subscribers/:id",
  protect,
  restrictTo("admin"),
  updatesController.deleteSubscriber
);

module.exports = router;










