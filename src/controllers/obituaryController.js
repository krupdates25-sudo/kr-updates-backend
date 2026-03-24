const { validationResult } = require("express-validator");
const ObituaryUpdate = require("../models/ObituaryUpdate");
const ApiResponse = require("../utils/apiResponse");

const getActiveObituaries = async (req, res) => {
  try {
    const now = new Date();
    const updates = await ObituaryUpdate.find({
      isActive: true,
      expiresAt: { $gt: now },
    })
      .sort({ eventDate: -1, createdAt: -1 })
      .limit(20)
      .lean();

    return ApiResponse.success(
      res,
      updates,
      "Obituary updates retrieved successfully",
    );
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to fetch obituary updates",
      500,
    );
  }
};

const createObituary = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.error(res, "Validation failed", 400, errors.array());
    }

    const payload = {
      title: req.body.title,
      message: req.body.message,
      location: req.body.location || "",
      imageUrl: req.body.imageUrl || "",
      eventDate: req.body.eventDate || new Date(),
      expiresAt:
        req.body.expiresAt ||
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: req.body.isActive !== false,
      createdBy: req.user._id,
    };

    const created = await ObituaryUpdate.create(payload);
    return ApiResponse.created(res, created, "Obituary update created successfully");
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to create obituary update",
      500,
    );
  }
};

module.exports = {
  getActiveObituaries,
  createObituary,
};
