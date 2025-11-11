const Announcement = require("../models/Announcement");
const APIResponse = require("../utils/apiResponse");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

// Get all active announcements for the current user
const getActiveAnnouncements = catchAsync(async (req, res) => {
  const userRole = req.user.role || "user";
  const announcements = await Announcement.getActiveForUser(userRole);

  // Add read status for each announcement
  const announcementsWithReadStatus = announcements.map((announcement) => ({
    ...announcement.toObject(),
    isRead: announcement.isReadBy(req.user._id),
    isCurrentlyActive: announcement.isCurrentlyActive,
  }));

  APIResponse.success(
    res,
    announcementsWithReadStatus,
    "Active announcements retrieved successfully",
  );
});

// Get unread announcements count for the current user
const getUnreadCount = catchAsync(async (req, res) => {
  const userRole = req.user.role || "user";
  const unreadAnnouncements = await Announcement.getUnreadForUser(
    req.user._id,
    userRole,
  );

  APIResponse.success(
    res,
    { count: unreadAnnouncements.length },
    "Unread announcements count retrieved successfully",
  );
});

// Mark announcement as read
const markAsRead = catchAsync(async (req, res) => {
  const { id } = req.params;

  const announcement = await Announcement.findById(id);
  if (!announcement) {
    throw new AppError("Announcement not found", 404);
  }

  // Check if user has permission to read this announcement
  const userRole = req.user.role || "user";
  if (
    announcement.targetAudience !== "all" &&
    announcement.targetAudience !== userRole
  ) {
    throw new AppError(
      "You do not have permission to access this announcement",
      403,
    );
  }

  await announcement.markAsRead(req.user._id);

  APIResponse.success(res, null, "Announcement marked as read");
});

// Mark all announcements as read for the current user
const markAllAsRead = catchAsync(async (req, res) => {
  const userRole = req.user.role || "user";
  const unreadAnnouncements = await Announcement.getUnreadForUser(
    req.user._id,
    userRole,
  );

  // Mark each announcement as read
  const markReadPromises = unreadAnnouncements.map((announcement) =>
    announcement.markAsRead(req.user._id),
  );

  await Promise.all(markReadPromises);

  APIResponse.success(res, null, "All announcements marked as read");
});

// Get single announcement by ID
const getAnnouncement = catchAsync(async (req, res) => {
  const { id } = req.params;

  const announcement = await Announcement.findById(id).populate(
    "createdBy",
    "firstName lastName username",
  );

  if (!announcement) {
    throw new AppError("Announcement not found", 404);
  }

  // Check if user has permission to read this announcement
  const userRole = req.user.role || "user";
  if (
    announcement.targetAudience !== "all" &&
    announcement.targetAudience !== userRole
  ) {
    throw new AppError(
      "You do not have permission to access this announcement",
      403,
    );
  }

  const announcementWithReadStatus = {
    ...announcement.toObject(),
    isRead: announcement.isReadBy(req.user._id),
    isCurrentlyActive: announcement.isCurrentlyActive,
  };

  APIResponse.success(
    res,
    announcementWithReadStatus,
    "Announcement retrieved successfully",
  );
});

// ADMIN ONLY FUNCTIONS

// Get all announcements (admin only)
const getAllAnnouncements = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status, type, targetAudience } = req.query;

  const filter = {};
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (type) filter.type = type;
  if (targetAudience) filter.targetAudience = targetAudience;

  const skip = (page - 1) * limit;

  const announcements = await Announcement.find(filter)
    .populate("createdBy", "firstName lastName username")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalCount = await Announcement.countDocuments(filter);
  const hasMore = skip + announcements.length < totalCount;

  const announcementsWithStats = announcements.map((announcement) => ({
    ...announcement.toObject(),
    readCount: announcement.readBy.length,
    isCurrentlyActive: announcement.isCurrentlyActive,
  }));

  APIResponse.success(
    res,
    {
      data: announcementsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        hasMore,
      },
    },
    "Announcements retrieved successfully",
  );
});

// Create new announcement (admin only)
const createAnnouncement = catchAsync(async (req, res) => {
  const {
    title,
    message,
    type,
    priority,
    targetAudience,
    startDate,
    endDate,
    actionUrl,
    actionText,
    icon,
  } = req.body;

  const announcement = await Announcement.create({
    title,
    message,
    type,
    priority,
    targetAudience,
    startDate,
    endDate,
    actionUrl,
    actionText,
    icon,
    createdBy: req.user._id,
  });

  await announcement.populate("createdBy", "firstName lastName username");

  APIResponse.created(res, announcement, "Announcement created successfully");
});

// Update announcement (admin only)
const updateAnnouncement = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const announcement = await Announcement.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).populate("createdBy", "firstName lastName username");

  if (!announcement) {
    throw new AppError("Announcement not found", 404);
  }

  APIResponse.updated(res, announcement, "Announcement updated successfully");
});

// Delete announcement (admin only)
const deleteAnnouncement = catchAsync(async (req, res) => {
  const { id } = req.params;

  const announcement = await Announcement.findByIdAndDelete(id);

  if (!announcement) {
    throw new AppError("Announcement not found", 404);
  }

  APIResponse.deleted(res, "Announcement deleted successfully");
});

// Toggle announcement status (admin only)
const toggleAnnouncementStatus = catchAsync(async (req, res) => {
  const { id } = req.params;

  const announcement = await Announcement.findById(id);

  if (!announcement) {
    throw new AppError("Announcement not found", 404);
  }

  announcement.isActive = !announcement.isActive;
  await announcement.save();

  APIResponse.success(
    res,
    announcement,
    `Announcement ${announcement.isActive ? "activated" : "deactivated"} successfully`,
  );
});

// Get announcement statistics (admin only)
const getAnnouncementStats = catchAsync(async (req, res) => {
  const totalAnnouncements = await Announcement.countDocuments();
  const activeAnnouncements = await Announcement.countDocuments({
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  });
  const inactiveAnnouncements = await Announcement.countDocuments({
    isActive: false,
  });
  const expiredAnnouncements = await Announcement.countDocuments({
    endDate: { $lt: new Date() },
  });

  // Get announcements by type
  const announcementsByType = await Announcement.aggregate([
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
      },
    },
  ]);

  // Get announcements by priority
  const announcementsByPriority = await Announcement.aggregate([
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = {
    totalAnnouncements,
    activeAnnouncements,
    inactiveAnnouncements,
    expiredAnnouncements,
    announcementsByType,
    announcementsByPriority,
  };

  APIResponse.success(
    res,
    stats,
    "Announcement statistics retrieved successfully",
  );
});

module.exports = {
  getActiveAnnouncements,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getAnnouncement,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementStatus,
  getAnnouncementStats,
};
