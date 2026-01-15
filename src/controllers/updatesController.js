const UpdateSubscriber = require("../models/UpdateSubscriber");
const catchAsync = require("../utils/catchAsync");
const ApiResponse = require("../utils/apiResponse");
const { AppError } = require("../utils/appError");

const normalizePhone = (phone) => {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "").trim();
};

// Public endpoint: store lead/subscription request
exports.subscribe = catchAsync(async (req, res, next) => {
  const name = (req.body?.name || "").toString().trim();
  const phone = normalizePhone(req.body?.phone || "");
  const email = (req.body?.email || "").toString().trim().toLowerCase();

  if (!name && !phone && !email) {
    return next(new AppError("Please provide at least one detail.", 400));
  }

  const userAgent = req.headers["user-agent"] || "";
  const referrer = req.headers.referer || "";
  const ipAddress =
    (req.ip ||
      req.connection?.remoteAddress ||
      req.headers["x-forwarded-for"] ||
      "")?.toString();
  const pageUrl = (req.body?.pageUrl || "").toString().trim();

  // Prefer matching by email, then phone
  const match = email ? { email } : phone ? { phone } : null;
  let doc;

  try {
    if (match) {
      doc = await UpdateSubscriber.findOneAndUpdate(
        match,
        {
          $set: {
            name: name || undefined,
            phone: phone || undefined,
            email: email || undefined,
            lastSubmittedAt: new Date(),
            "metadata.userAgent": userAgent,
            "metadata.referrer": referrer,
            "metadata.ipAddress": ipAddress,
            "metadata.pageUrl": pageUrl,
          },
          $inc: { submitCount: 1 },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } else {
      doc = await UpdateSubscriber.create({
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        metadata: { userAgent, referrer, ipAddress, pageUrl },
      });
    }
  } catch (err) {
    // Handle unique collisions (email/phone) by retrying with whichever exists
    if (err?.code === 11000) {
      const retryMatch =
        err?.keyPattern?.email && email
          ? { email }
          : err?.keyPattern?.phone && phone
            ? { phone }
            : null;
      if (retryMatch) {
        doc = await UpdateSubscriber.findOneAndUpdate(
          retryMatch,
          {
            $set: {
              name: name || undefined,
              phone: phone || undefined,
              email: email || undefined,
              lastSubmittedAt: new Date(),
              "metadata.userAgent": userAgent,
              "metadata.referrer": referrer,
              "metadata.ipAddress": ipAddress,
              "metadata.pageUrl": pageUrl,
            },
            $inc: { submitCount: 1 },
          },
          { new: true }
        );
      }
    }

    if (!doc) {
      return next(new AppError("Failed to save details", 500));
    }
  }

  return ApiResponse.success(
    res,
    {
      id: doc._id,
      submitCount: doc.submitCount,
      lastSubmittedAt: doc.lastSubmittedAt,
    },
    "Details saved successfully"
  );
});

// Admin endpoint: Get all subscribers
exports.getAllSubscribers = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";

  // Build search query
  const searchQuery = {};
  if (search) {
    searchQuery.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  // Get subscribers with pagination
  const subscribers = await UpdateSubscriber.find(searchQuery)
    .sort({ lastSubmittedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Get total count
  const total = await UpdateSubscriber.countDocuments(searchQuery);

  return ApiResponse.success(
    res,
    {
      data: subscribers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
    "Subscribers retrieved successfully"
  );
});

// Admin endpoint: Delete subscriber
exports.deleteSubscriber = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const subscriber = await UpdateSubscriber.findByIdAndDelete(id);

  if (!subscriber) {
    return next(new AppError("Subscriber not found", 404));
  }

  return ApiResponse.success(res, null, "Subscriber deleted successfully");
});










