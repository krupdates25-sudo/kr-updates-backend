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

const getAllObituaries = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "all", search = "" } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;
    if (String(search || "").trim()) {
      const term = String(search).trim();
      query.$or = [
        { title: { $regex: term, $options: "i" } },
        { message: { $regex: term, $options: "i" } },
        { location: { $regex: term, $options: "i" } },
      ];
    }

    const [rows, totalCount] = await Promise.all([
      ObituaryUpdate.find(query)
        .sort({ eventDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ObituaryUpdate.countDocuments(query),
    ]);

    return ApiResponse.success(
      res,
      {
        data: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          hasMore: skip + rows.length < totalCount,
        },
      },
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

const updateObituary = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.error(res, "Validation failed", 400, errors.array());
    }

    const { id } = req.params;
    const row = await ObituaryUpdate.findById(id);
    if (!row) return ApiResponse.error(res, "Obituary update not found", 404);

    const payload = {
      title: req.body.title,
      message: req.body.message,
      location: req.body.location || "",
      imageUrl: req.body.imageUrl || "",
      eventDate: req.body.eventDate || row.eventDate,
      expiresAt: req.body.expiresAt || row.expiresAt,
      isActive:
        req.body.isActive === undefined ? row.isActive : !!req.body.isActive,
    };

    const updated = await ObituaryUpdate.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });

    return ApiResponse.updated(res, updated, "Obituary update updated successfully");
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to update obituary update",
      500,
    );
  }
};

const toggleObituaryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await ObituaryUpdate.findById(id);
    if (!row) return ApiResponse.error(res, "Obituary update not found", 404);
    row.isActive = !row.isActive;
    await row.save();
    return ApiResponse.success(
      res,
      row,
      `Obituary update ${row.isActive ? "activated" : "deactivated"} successfully`,
    );
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to toggle obituary update",
      500,
    );
  }
};

const deleteObituary = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ObituaryUpdate.findByIdAndDelete(id);
    if (!deleted) return ApiResponse.error(res, "Obituary update not found", 404);
    return ApiResponse.deleted(res, "Obituary update deleted successfully");
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to delete obituary update",
      500,
    );
  }
};

module.exports = {
  getActiveObituaries,
  getAllObituaries,
  createObituary,
  updateObituary,
  toggleObituaryStatus,
  deleteObituary,
};
