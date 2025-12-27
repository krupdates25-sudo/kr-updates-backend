const BreakingNews = require("../models/BreakingNews");
const { validationResult } = require("express-validator");

// Get all breaking news stories
const getAllStories = async (req, res) => {
  try {
    const { active, expired, category, page = 1, limit = 20, search, sortBy = "createdAt" } = req.query;
    let query = {};

    if (active === "true") {
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
    } else if (expired === "true") {
      query.$or = [{ isActive: false }, { expiresAt: { $lte: new Date() } }];
    }

    if (category) {
      query.category = category;
    }

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    // Sort options
    const sortOptions = {};
    switch (sortBy) {
      case "priority":
        sortOptions.priority = -1;
        break;
      case "expiresAt":
        sortOptions.expiresAt = 1;
        break;
      case "createdAt":
      default:
        sortOptions.createdAt = -1;
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const stories = await BreakingNews.find(query)
      .populate("createdBy", "username firstName lastName profileImage")
      .populate("updatedBy", "username firstName lastName profileImage")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const totalCount = await BreakingNews.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      success: true,
      data: stories,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        totalCount,
        totalPages,
        hasMore: parseInt(page) < totalPages,
      },
      count: stories.length,
    });
  } catch (error) {
    console.error("Error fetching breaking news stories:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching breaking news stories",
      error: error.message,
    });
  }
};

// Get admin view of all breaking news (with all statuses)
const getAdminStories = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, isActive, sortBy = "createdAt" } = req.query;
    let query = {};

    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    // Sort options
    const sortOptions = {};
    switch (sortBy) {
      case "priority":
        sortOptions.priority = -1;
        break;
      case "expiresAt":
        sortOptions.expiresAt = 1;
        break;
      case "createdAt":
      default:
        sortOptions.createdAt = -1;
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const stories = await BreakingNews.find(query)
      .populate("createdBy", "username firstName lastName profileImage")
      .populate("updatedBy", "username firstName lastName profileImage")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const totalCount = await BreakingNews.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      success: true,
      data: stories,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        totalCount,
        totalPages,
        hasMore: parseInt(page) < totalPages,
      },
      count: stories.length,
    });
  } catch (error) {
    console.error("Error fetching admin breaking news stories:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin breaking news stories",
      error: error.message,
    });
  }
};

// Bulk update breaking news status
const bulkUpdateStories = async (req, res) => {
  try {
    const { storyIds, isActive } = req.body;

    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "storyIds must be a non-empty array",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean",
      });
    }

    const result = await BreakingNews.updateMany(
      { _id: { $in: storyIds } },
      { isActive, updatedBy: req.user.id },
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} stories ${isActive ? "activated" : "deactivated"} successfully`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error bulk updating breaking news stories:", error);
    res.status(500).json({
      success: false,
      message: "Error bulk updating breaking news stories",
      error: error.message,
    });
  }
};

// Bulk delete breaking news stories
const bulkDeleteStories = async (req, res) => {
  try {
    const { storyIds } = req.body;

    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "storyIds must be a non-empty array",
      });
    }

    const result = await BreakingNews.deleteMany({ _id: { $in: storyIds } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} stories deleted successfully`,
      data: {
        deleted: result.deletedCount,
      },
    });
  } catch (error) {
    console.error("Error bulk deleting breaking news stories:", error);
    res.status(500).json({
      success: false,
      message: "Error bulk deleting breaking news stories",
      error: error.message,
    });
  }
};

// Get active stories for public display
const getActiveStories = async (req, res) => {
  try {
    const stories = await BreakingNews.getActiveStories().populate(
      "createdBy",
      "username firstName lastName profileImage",
    );

    res.status(200).json({
      success: true,
      data: stories,
      count: stories.length,
    });
  } catch (error) {
    console.error("Error fetching active breaking news stories:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching active breaking news stories",
      error: error.message,
    });
  }
};

// Get a single story by ID
const getStoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const story = await BreakingNews.findById(id)
      .populate("createdBy", "username firstName lastName profileImage")
      .populate("updatedBy", "username firstName lastName profileImage");

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Breaking news story not found",
      });
    }

    res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error("Error fetching breaking news story:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching breaking news story",
      error: error.message,
    });
  }
};

// Create a new breaking news story
const createStory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const storyData = {
      ...req.body,
      createdBy: req.user.id,
    };

    const story = new BreakingNews(storyData);
    await story.save();

    await story.populate(
      "createdBy",
      "username firstName lastName profileImage",
    );

    res.status(201).json({
      success: true,
      message: "Breaking news story created successfully",
      data: story,
    });
  } catch (error) {
    console.error("Error creating breaking news story:", error);
    res.status(500).json({
      success: false,
      message: "Error creating breaking news story",
      error: error.message,
    });
  }
};

// Update a breaking news story
const updateStory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const story = await BreakingNews.findById(id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Breaking news story not found",
      });
    }

    // Check if user has permission to update (admin or creator)
    if (
      req.user.role !== "admin" &&
      story.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this story",
      });
    }

    const updateData = {
      ...req.body,
      updatedBy: req.user.id,
    };

    const updatedStory = await BreakingNews.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("createdBy", "username firstName lastName profileImage")
      .populate("updatedBy", "username firstName lastName profileImage");

    res.status(200).json({
      success: true,
      message: "Breaking news story updated successfully",
      data: updatedStory,
    });
  } catch (error) {
    console.error("Error updating breaking news story:", error);
    res.status(500).json({
      success: false,
      message: "Error updating breaking news story",
      error: error.message,
    });
  }
};

// Delete a breaking news story
const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;
    const story = await BreakingNews.findById(id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Breaking news story not found",
      });
    }

    // Check if user has permission to delete (admin or creator)
    if (
      req.user.role !== "admin" &&
      story.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this story",
      });
    }

    await BreakingNews.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Breaking news story deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting breaking news story:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting breaking news story",
      error: error.message,
    });
  }
};

// Toggle story active status
const toggleStoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const story = await BreakingNews.findById(id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Breaking news story not found",
      });
    }

    // Check if user has permission to toggle (admin or creator)
    if (
      req.user.role !== "admin" &&
      story.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to toggle this story",
      });
    }

    story.isActive = !story.isActive;
    story.updatedBy = req.user.id;
    await story.save();

    await story.populate(
      "createdBy",
      "username firstName lastName profileImage",
    );
    await story.populate(
      "updatedBy",
      "username firstName lastName profileImage",
    );

    res.status(200).json({
      success: true,
      message: `Story ${story.isActive ? "activated" : "deactivated"} successfully`,
      data: story,
    });
  } catch (error) {
    console.error("Error toggling breaking news story status:", error);
    res.status(500).json({
      success: false,
      message: "Error toggling breaking news story status",
      error: error.message,
    });
  }
};

// Extend story expiry
const extendStoryExpiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { hours = 24 } = req.body;
    const story = await BreakingNews.findById(id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Breaking news story not found",
      });
    }

    // Check if user has permission to extend (admin or creator)
    if (
      req.user.role !== "admin" &&
      story.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to extend this story",
      });
    }

    await story.extendExpiry(hours);
    story.updatedBy = req.user.id;
    await story.save();

    await story.populate(
      "createdBy",
      "username firstName lastName profileImage",
    );
    await story.populate(
      "updatedBy",
      "username firstName lastName profileImage",
    );

    res.status(200).json({
      success: true,
      message: `Story expiry extended by ${hours} hours`,
      data: story,
    });
  } catch (error) {
    console.error("Error extending breaking news story expiry:", error);
    res.status(500).json({
      success: false,
      message: "Error extending breaking news story expiry",
      error: error.message,
    });
  }
};

module.exports = {
  getAllStories,
  getAdminStories,
  getActiveStories,
  getStoryById,
  createStory,
  updateStory,
  deleteStory,
  toggleStoryStatus,
  extendStoryExpiry,
  bulkUpdateStories,
  bulkDeleteStories,
};
