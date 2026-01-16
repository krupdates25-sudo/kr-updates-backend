const Feedback = require("../models/Feedback");
const { AppError } = require("../utils/appError");
const { APIResponse } = require("../utils/apiResponse");
const catchAsync = require("../utils/catchAsync");

// Submit feedback (public - can be anonymous)
exports.submitFeedback = catchAsync(async (req, res, next) => {
  const { rating, description } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return next(new AppError("Please provide a valid rating (1-5)", 400));
  }

  const feedbackData = {
    rating,
    description: description || "",
    userAgent: req.get("user-agent") || "",
    ipAddress: req.ip || req.connection.remoteAddress,
    isAnonymous: !req.user,
  };

  if (req.user) {
    feedbackData.user = req.user._id;
  }

  const feedback = await Feedback.create(feedbackData);

  res.status(201).json(
    new APIResponse(201, feedback, "Feedback submitted successfully")
  );
});

// Get all feedbacks (admin only)
exports.getAllFeedbacks = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    rating,
    status,
    sort = "-createdAt",
  } = req.query;

  const query = {};

  if (rating) {
    query.rating = parseInt(rating);
  }

  if (status) {
    query.status = status;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortField = sort.startsWith("-") ? sort.slice(1) : sort;
  const sortOrder = sort.startsWith("-") ? -1 : 1;

  const [feedbacks, total] = await Promise.all([
    Feedback.find(query)
      .populate("user", "firstName lastName email username")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit)),
    Feedback.countDocuments(query),
  ]);

  res.status(200).json(
    new APIResponse(
      200,
      {
        feedbacks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
      "Feedbacks retrieved successfully"
    )
  );
});

// Get single feedback (admin only)
exports.getFeedback = catchAsync(async (req, res, next) => {
  const feedback = await Feedback.findById(req.params.id).populate(
    "user",
    "firstName lastName email username"
  );

  if (!feedback) {
    return next(new AppError("Feedback not found", 404));
  }

  res.status(200).json(
    new APIResponse(200, feedback, "Feedback retrieved successfully")
  );
});

// Update feedback status (admin only)
exports.updateFeedbackStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;

  if (!["pending", "reviewed", "archived"].includes(status)) {
    return next(new AppError("Invalid status", 400));
  }

  const feedback = await Feedback.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  ).populate("user", "firstName lastName email username");

  if (!feedback) {
    return next(new AppError("Feedback not found", 404));
  }

  res.status(200).json(
    new APIResponse(200, feedback, "Feedback status updated successfully")
  );
});

// Delete feedback (admin only)
exports.deleteFeedback = catchAsync(async (req, res, next) => {
  const feedback = await Feedback.findByIdAndDelete(req.params.id);

  if (!feedback) {
    return next(new AppError("Feedback not found", 404));
  }

  res.status(200).json(
    new APIResponse(200, null, "Feedback deleted successfully")
  );
});

// Get feedback statistics (admin only)
exports.getFeedbackStats = catchAsync(async (req, res, next) => {
  const [
    totalFeedbacks,
    averageRating,
    ratingDistribution,
    recentFeedbacks,
    pendingCount,
  ] = await Promise.all([
    Feedback.countDocuments(),
    Feedback.aggregate([
      {
        $group: {
          _id: null,
          average: { $avg: "$rating" },
        },
      },
    ]),
    Feedback.aggregate([
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Feedback.countDocuments({
      createdAt: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    }),
    Feedback.countDocuments({ status: "pending" }),
  ]);

  const stats = {
    totalFeedbacks,
    averageRating: averageRating[0]?.average
      ? parseFloat(averageRating[0].average.toFixed(2))
      : 0,
    ratingDistribution: ratingDistribution.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    recentFeedbacks,
    pendingCount,
  };

  res.status(200).json(
    new APIResponse(200, stats, "Feedback statistics retrieved successfully")
  );
});

