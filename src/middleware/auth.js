const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const config = require("../config");
const { AppError } = require("../utils/appError");

// Protect routes - authentication required
const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  // Check for token in cookies
  else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError("You are not logged in! Please log in to get access.", 401),
    );
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Check if user still exists
    const currentUser = await User.findById(decoded.id).select("+isActive");
    if (!currentUser) {
      return next(
        new AppError(
          "The user belonging to this token does no longer exist.",
          401,
        ),
      );
    }

    // Check if user is active
    if (!currentUser.isActive) {
      return next(
        new AppError(
          "Your account has been deactivated. Please contact support.",
          401,
        ),
      );
    }

    // Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError(
          "User recently changed password! Please log in again.",
          401,
        ),
      );
    }

    // Grant access to protected route
    req.user = currentUser;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token. Please log in again!", 401));
    } else if (error.name === "TokenExpiredError") {
      return next(
        new AppError("Your token has expired! Please log in again.", 401),
      );
    }
    return next(new AppError("Authentication failed", 401));
  }
});

// Restrict to certain roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this action", 403),
      );
    }
    next();
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      const currentUser = await User.findById(decoded.id).select("+isActive");

      if (
        currentUser &&
        currentUser.isActive &&
        !currentUser.changedPasswordAfter(decoded.iat)
      ) {
        req.user = currentUser;
      }
    } catch (error) {
      // Silently fail for optional auth
    }
  }

  next();
});

// Check if user owns resource or is admin/moderator
const checkOwnership = (Model, paramName = "id") => {
  return asyncHandler(async (req, res, next) => {
    const resourceId = req.params[paramName];
    const resource = await Model.findById(resourceId);

    if (!resource) {
      return next(new AppError("Resource not found", 404));
    }

    // Admin and moderator can access any resource
    if (req.user.role === "admin" || req.user.role === "moderator") {
      req.resource = resource;
      return next();
    }

    // Check if user owns the resource
    const userId = req.user._id.toString();
    const resourceUserId = resource.author
      ? resource.author.toString()
      : resource.user?.toString();

    if (resourceUserId !== userId) {
      return next(new AppError("You can only access your own resources", 403));
    }

    req.resource = resource;
    next();
  });
};

module.exports = {
  protect,
  restrictTo,
  optionalAuth,
  checkOwnership,
};
