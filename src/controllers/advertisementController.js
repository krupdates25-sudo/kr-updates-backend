const Advertisement = require("../models/Advertisement");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const APIResponse = require("../utils/apiResponse");

// Create a new advertisement
exports.createAdvertisement = catchAsync(async (req, res, next) => {
  const {
    title,
    description,
    imageUrl,
    clickUrl,
    clientName,
    clientEmail,
    clientPhone,
    adType,
    position,
    priority,
    duration,
    budget,
    costPerClick,
    targetAudience,
    startDate,
  } = req.body;

  // Validate required fields
  if (
    !title ||
    !description ||
    !imageUrl ||
    !clickUrl ||
    !clientName ||
    !clientEmail ||
    !duration ||
    !budget
  ) {
    return next(new AppError("Please provide all required fields", 400));
  }

  const advertisement = await Advertisement.create({
    title,
    description,
    imageUrl,
    clickUrl,
    clientName,
    clientEmail,
    clientPhone,
    adType: adType || "banner",
    position: position || "random",
    priority: priority || 1,
    duration,
    budget,
    costPerClick: costPerClick || 0,
    targetAudience: targetAudience || {},
    startDate: startDate || new Date(),
    createdBy: req.user.id,
  });

  res
    .status(201)
    .json(
      new APIResponse(201, advertisement, "Advertisement created successfully"),
    );
});

// Get all advertisements with filtering and pagination
exports.getAllAdvertisements = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    position,
    adType,
    isActive,
    clientName,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build query
  const query = {};

  if (position) query.position = position;
  if (adType) query.adType = adType;
  if (isActive !== undefined) query.isActive = isActive === "true";
  if (clientName) query.clientName = { $regex: clientName, $options: "i" };

  // Only show user's own ads unless admin
  if (req.user.role !== "admin") {
    query.createdBy = req.user.id;
  }

  const skip = (page - 1) * limit;
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  const [advertisements, total] = await Promise.all([
    Advertisement.find(query)
      .populate("createdBy", "firstName lastName email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit)),
    Advertisement.countDocuments(query),
  ]);

  res.status(200).json(
    new APIResponse(
      200,
      {
        advertisements,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
      "Advertisements retrieved successfully",
    ),
  );
});

// Get active advertisements for display
exports.getActiveAdvertisements = catchAsync(async (req, res, next) => {
  const { position = "random", limit = 5 } = req.query;

  const advertisements = await Advertisement.getActiveAds(
    position,
    parseInt(limit),
  );

  // Increment impressions for each ad
  const updatePromises = advertisements.map((ad) => ad.incrementImpressions());
  await Promise.all(updatePromises);

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        advertisements,
        "Active advertisements retrieved successfully",
      ),
    );
});

// Get single advertisement by ID
exports.getAdvertisement = catchAsync(async (req, res, next) => {
  const advertisement = await Advertisement.findById(req.params.id).populate(
    "createdBy",
    "firstName lastName email",
  );

  if (!advertisement) {
    return next(new AppError("Advertisement not found", 404));
  }

  // Check if user owns this ad or is admin
  if (
    req.user.role !== "admin" &&
    advertisement.createdBy._id.toString() !== req.user.id
  ) {
    return next(
      new AppError(
        "You do not have permission to view this advertisement",
        403,
      ),
    );
  }

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        advertisement,
        "Advertisement retrieved successfully",
      ),
    );
});

// Update advertisement
exports.updateAdvertisement = catchAsync(async (req, res, next) => {
  const advertisement = await Advertisement.findById(req.params.id);

  if (!advertisement) {
    return next(new AppError("Advertisement not found", 404));
  }

  // Check if user owns this ad or is admin
  if (
    req.user.role !== "admin" &&
    advertisement.createdBy.toString() !== req.user.id
  ) {
    return next(
      new AppError(
        "You do not have permission to update this advertisement",
        403,
      ),
    );
  }

  // Update fields
  const allowedFields = [
    "title",
    "description",
    "imageUrl",
    "clickUrl",
    "clientName",
    "clientEmail",
    "clientPhone",
    "adType",
    "position",
    "priority",
    "duration",
    "budget",
    "costPerClick",
    "targetAudience",
    "isActive",
    "startDate",
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      advertisement[field] = req.body[field];
    }
  });

  advertisement.updatedBy = req.user.id;
  await advertisement.save();

  res
    .status(200)
    .json(
      new APIResponse(200, advertisement, "Advertisement updated successfully"),
    );
});

// Update advertisement position (for drag and drop)
exports.updateAdvertisementPosition = catchAsync(async (req, res, next) => {
  const { position, priority } = req.body;
  const advertisement = await Advertisement.findById(req.params.id);

  if (!advertisement) {
    return next(new AppError("Advertisement not found", 404));
  }

  // Check if user owns this ad or is admin
  if (
    req.user.role !== "admin" &&
    advertisement.createdBy.toString() !== req.user.id
  ) {
    return next(
      new AppError(
        "You do not have permission to update this advertisement",
        403,
      ),
    );
  }

  if (position) advertisement.position = position;
  if (priority) advertisement.priority = priority;
  advertisement.updatedBy = req.user.id;

  await advertisement.save();

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        advertisement,
        "Advertisement position updated successfully",
      ),
    );
});

// Delete advertisement
exports.deleteAdvertisement = catchAsync(async (req, res, next) => {
  const advertisement = await Advertisement.findById(req.params.id);

  if (!advertisement) {
    return next(new AppError("Advertisement not found", 404));
  }

  // Check if user owns this ad or is admin
  if (
    req.user.role !== "admin" &&
    advertisement.createdBy.toString() !== req.user.id
  ) {
    return next(
      new AppError(
        "You do not have permission to delete this advertisement",
        403,
      ),
    );
  }

  await Advertisement.findByIdAndDelete(req.params.id);

  res
    .status(200)
    .json(new APIResponse(200, null, "Advertisement deleted successfully"));
});

// Toggle advertisement active status
exports.toggleAdvertisementStatus = catchAsync(async (req, res, next) => {
  const advertisement = await Advertisement.findById(req.params.id);

  if (!advertisement) {
    return next(new AppError("Advertisement not found", 404));
  }

  // Check if user owns this ad or is admin
  if (
    req.user.role !== "admin" &&
    advertisement.createdBy.toString() !== req.user.id
  ) {
    return next(
      new AppError(
        "You do not have permission to update this advertisement",
        403,
      ),
    );
  }

  advertisement.isActive = !advertisement.isActive;
  advertisement.updatedBy = req.user.id;
  await advertisement.save();

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        advertisement,
        `Advertisement ${advertisement.isActive ? "activated" : "deactivated"} successfully`,
      ),
    );
});

// Track advertisement click
exports.trackClick = catchAsync(async (req, res, next) => {
  const advertisement = await Advertisement.findById(req.params.id);

  if (!advertisement) {
    return next(new AppError("Advertisement not found", 404));
  }

  if (!advertisement.isActive || advertisement.isExpired) {
    return next(
      new AppError("Advertisement is not active or has expired", 400),
    );
  }

  await advertisement.incrementClicks();

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { clickUrl: advertisement.clickUrl },
        "Click tracked successfully",
      ),
    );
});

// Get advertisement analytics
exports.getAdvertisementAnalytics = catchAsync(async (req, res, next) => {
  const advertisement = await Advertisement.findById(req.params.id);

  if (!advertisement) {
    return next(new AppError("Advertisement not found", 404));
  }

  // Check if user owns this ad or is admin
  if (
    req.user.role !== "admin" &&
    advertisement.createdBy.toString() !== req.user.id
  ) {
    return next(
      new AppError(
        "You do not have permission to view this advertisement analytics",
        403,
      ),
    );
  }

  const analytics = {
    impressions: advertisement.impressions,
    clicks: advertisement.clicks,
    ctr: advertisement.ctr,
    daysRemaining: advertisement.daysRemaining,
    isExpired: advertisement.isExpired,
    dailyImpressions: advertisement.analytics.dailyImpressions.slice(-30), // Last 30 days
    dailyClicks: advertisement.analytics.dailyClicks.slice(-30), // Last 30 days
    budget: advertisement.budget,
    costPerClick: advertisement.costPerClick,
    totalCost: advertisement.clicks * advertisement.costPerClick,
  };

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        analytics,
        "Advertisement analytics retrieved successfully",
      ),
    );
});

// Get dashboard statistics for admin
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new AppError("Access denied. Admin only.", 403));
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalAds,
    activeAds,
    expiredAds,
    recentAds,
    totalImpressions,
    totalClicks,
    topPerformingAds,
  ] = await Promise.all([
    Advertisement.countDocuments(),
    Advertisement.countDocuments({ isActive: true, endDate: { $gte: now } }),
    Advertisement.countDocuments({ endDate: { $lt: now } }),
    Advertisement.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Advertisement.aggregate([
      { $group: { _id: null, total: { $sum: "$impressions" } } },
    ]),
    Advertisement.aggregate([
      { $group: { _id: null, total: { $sum: "$clicks" } } },
    ]),
    Advertisement.find({ isActive: true })
      .sort({ clicks: -1, impressions: -1 })
      .limit(5)
      .populate("createdBy", "firstName lastName email"),
  ]);

  const stats = {
    totalAds,
    activeAds,
    expiredAds,
    recentAds,
    totalImpressions: totalImpressions[0]?.total || 0,
    totalClicks: totalClicks[0]?.total || 0,
    averageCTR:
      totalImpressions[0]?.total > 0
        ? (
            ((totalClicks[0]?.total || 0) / totalImpressions[0].total) *
            100
          ).toFixed(2)
        : 0,
    topPerformingAds,
  };

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        stats,
        "Dashboard statistics retrieved successfully",
      ),
    );
});

// Bulk update advertisements
exports.bulkUpdateAdvertisements = catchAsync(async (req, res, next) => {
  const { ids, updates } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError("Please provide advertisement IDs", 400));
  }

  if (!updates || typeof updates !== "object") {
    return next(new AppError("Please provide updates", 400));
  }

  // Build query based on user role
  const query = { _id: { $in: ids } };
  if (req.user.role !== "admin") {
    query.createdBy = req.user.id;
  }

  const allowedUpdates = ["isActive", "position", "priority", "adType"];
  const updateData = {};

  allowedUpdates.forEach((field) => {
    if (updates[field] !== undefined) {
      updateData[field] = updates[field];
    }
  });

  updateData.updatedBy = req.user.id;

  const result = await Advertisement.updateMany(query, updateData);

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { modifiedCount: result.modifiedCount },
        `${result.modifiedCount} advertisements updated successfully`,
      ),
    );
});
