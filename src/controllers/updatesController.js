const UpdateSubscriber = require("../models/UpdateSubscriber");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const APIResponse = require("../utils/apiResponse");

// Get all subscribers (admin only)
const getSubscribers = catchAsync(async (req, res, next) => {
  const { limit = 100, page = 1, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query
  const query = {};
  
  // Search functionality
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  // Get total count and subscribers
  const [totalCount, subscribers] = await Promise.all([
    UpdateSubscriber.countDocuments(query),
    UpdateSubscriber.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
  ]);

  const totalPages = Math.ceil(totalCount / parseInt(limit));

  APIResponse.paginated(
    res,
    subscribers,
    {
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount,
      totalPages,
      hasMore: parseInt(page) < totalPages,
    },
    "Subscribers retrieved successfully"
  );
});

// Get single subscriber (admin only)
const getSubscriber = catchAsync(async (req, res, next) => {
  const subscriber = await UpdateSubscriber.findById(req.params.id);

  if (!subscriber) {
    return next(new AppError("Subscriber not found", 404));
  }

  APIResponse.success(res, subscriber, "Subscriber retrieved successfully");
});

// Create subscriber (public - for subscription form)
const createSubscriber = catchAsync(async (req, res, next) => {
  const { name, phone, email, source = "want_updates" } = req.body;

  // Get metadata from request
  const metadata = {
    userAgent: req.headers["user-agent"] || "",
    referrer: req.headers.referer || "",
    ipAddress: req.ip || req.connection.remoteAddress || "",
    pageUrl: req.body.pageUrl || "",
  };

  // Check if subscriber already exists (by email or phone)
  let existingSubscriber = null;
  if (email) {
    existingSubscriber = await UpdateSubscriber.findOne({ email: email.toLowerCase() });
  }
  if (!existingSubscriber && phone) {
    existingSubscriber = await UpdateSubscriber.findOne({ phone });
  }

  if (existingSubscriber) {
    // Update existing subscriber
    existingSubscriber.submitCount += 1;
    existingSubscriber.lastSubmittedAt = new Date();
    if (name && !existingSubscriber.name) {
      existingSubscriber.name = name;
    }
    if (phone && !existingSubscriber.phone) {
      existingSubscriber.phone = phone;
    }
    if (email && !existingSubscriber.email) {
      existingSubscriber.email = email.toLowerCase();
    }
    existingSubscriber.metadata = { ...existingSubscriber.metadata, ...metadata };
    await existingSubscriber.save();

    return ApiResponse.success(
      res,
      existingSubscriber,
      "Subscriber updated successfully"
    );
  }

  // Create new subscriber
  const subscriber = await UpdateSubscriber.create({
    name,
    phone,
    email: email ? email.toLowerCase() : undefined,
    source,
    metadata,
  });

  APIResponse.created(res, subscriber, "Subscriber created successfully");
});

// Update subscriber (admin only)
const updateSubscriber = catchAsync(async (req, res, next) => {
  const { name, phone, email } = req.body;
  const subscriber = await UpdateSubscriber.findById(req.params.id);

  if (!subscriber) {
    return next(new AppError("Subscriber not found", 404));
  }

  // Update fields
  if (name !== undefined) subscriber.name = name;
  if (phone !== undefined) subscriber.phone = phone;
  if (email !== undefined) subscriber.email = email.toLowerCase();

  await subscriber.save();

  APIResponse.updated(res, subscriber, "Subscriber updated successfully");
});

// Delete subscriber (admin only)
const deleteSubscriber = catchAsync(async (req, res, next) => {
  const subscriber = await UpdateSubscriber.findByIdAndDelete(req.params.id);

  if (!subscriber) {
    return next(new AppError("Subscriber not found", 404));
  }

  APIResponse.deleted(res, "Subscriber deleted successfully");
});

module.exports = {
  getSubscribers,
  getSubscriber,
  createSubscriber,
  updateSubscriber,
  deleteSubscriber,
};
