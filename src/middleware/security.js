const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss");
const hpp = require("hpp");
const config = require("../config");

// Enhanced Rate limiting with dynamic limits based on user role
const createRateLimiter = (windowMs, max, message, adminMultiplier = 10) => {
  return rateLimit({
    windowMs,
    max: (req) => {
      // Dynamic limits based on user role
      if (req.user?.role === "admin") {
        return max * adminMultiplier; // 10x limit for admins
      } else if (req.user?.role === "moderator") {
        return max * 5; // 5x limit for moderators
      } else if (req.user?.role === "author") {
        return max * 3; // 3x limit for authors
      }
      return max; // Default limit for regular users
    },
    message: {
      error:
        message || "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Store rate limit info in headers
    skip: (req) => {
      // Skip rate limiting for admin users in development
      return config.NODE_ENV === "development" && req.user?.role === "admin";
    },
    // Use the new handler instead of deprecated onLimitReached
    handler: (req, res) => {
      console.warn(
        `🚨 Rate limit exceeded for ${req.user?.role || "anonymous"} user from IP: ${req.ip}`,
      );
      res.set({
        "X-RateLimit-Policy": `${req.user?.role || "user"}-tier`,
        "X-RateLimit-UserRole": req.user?.role || "anonymous",
      });

      // Send rate limit response
      res.status(429).json({
        error:
          message || "Too many requests from this IP, please try again later.",
        retryAfter: Math.round(windowMs / 1000),
      });
    },
  });
};

// General rate limiter - increased base limit
const generalLimiter = createRateLimiter(
  config.RATE_LIMIT_WINDOW_MS, // 15 minutes
  config.RATE_LIMIT_MAX_REQUESTS || 200, // 200 requests per windowMs (doubled)
  "Too many requests from this IP, please try again later.",
  20, // 20x limit for admins = 4000 requests per 15 min
);

// Strict rate limiter for auth endpoints - more lenient for admins
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  10, // 10 requests per windowMs (doubled from 5)
  "Too many authentication attempts from this IP, please try again after 15 minutes.",
  10, // 10x limit for admins = 100 auth attempts per 15 min
);

// Password reset rate limiter - higher for admins
const passwordResetLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  5, // 5 requests per hour (increased from 3)
  "Too many password reset attempts from this IP, please try again after an hour.",
  20, // 20x limit for admins = 100 resets per hour
);

// API rate limiter for expensive operations - much higher for admins
const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  150, // 150 requests per windowMs (tripled from 50)
  "Too many API requests from this IP, please try again later.",
  20, // 20x limit for admins = 3000 requests per 15 min
);

// Helmet configuration for security headers
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.NODE_ENV === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// XSS protection middleware
const xssProtection = (req, res, next) => {
  // Clean request body
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = xss(req.body[key]);
      }
    }
  }

  // Clean query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === "string") {
        req.query[key] = xss(req.query[key]);
      }
    }
  }

  next();
};

// MongoDB injection protection
const mongoSanitizeConfig = mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized key: ${key} in request from IP: ${req.ip}`);
  },
});

// HTTP Parameter Pollution protection
const hppConfig = hpp({
  whitelist: ["tags", "categories", "sort"], // Allow these parameters to be arrays
});

// Security logging middleware
const securityLogger = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /script/i,
    /javascript/i,
    /vbscript/i,
    /onload/i,
    /onerror/i,
    /eval\(/i,
    /expression\(/i,
    /document\.cookie/i,
    /document\.write/i,
  ];

  const checkForSuspiciousContent = (obj, path = "") => {
    if (typeof obj === "string") {
      suspiciousPatterns.forEach((pattern) => {
        if (pattern.test(obj)) {
          console.warn(
            `🚨 Suspicious content detected at ${path}: ${obj.substring(0, 100)}... from IP: ${req.ip}`,
          );
        }
      });
    } else if (typeof obj === "object" && obj !== null) {
      Object.keys(obj).forEach((key) => {
        checkForSuspiciousContent(obj[key], `${path}.${key}`);
      });
    }
  };

  // Check request body and query parameters
  if (req.body) checkForSuspiciousContent(req.body, "body");
  if (req.query) checkForSuspiciousContent(req.query, "query");

  next();
};

// IP whitelist middleware (for admin routes)
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (config.NODE_ENV === "development") {
      return next(); // Skip in development
    }

    const clientIP = req.ip || req.connection.remoteAddress;

    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        success: false,
        message: "Access denied from this IP address",
      });
    }

    next();
  };
};

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');

    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173", // Vite default port
      "http://127.0.0.1:5173", // Vite alternative
      "https://yourdomain.com",
      "https://krupdates.in", // Production domain
      "https://www.krupdates.in", // Production domain with www
    ];

    if (config.NODE_ENV === "development") {
      allowedOrigins.push(
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://localhost:4173", // Vite preview port
        "http://127.0.0.1:4173",
      );
    }

    // Allow ngrok URLs (for testing WhatsApp/Facebook previews)
    const isNgrok = normalizedOrigin && (
      normalizedOrigin.includes('ngrok-free.app') ||
      normalizedOrigin.includes('ngrok.io') ||
      normalizedOrigin.includes('ngrok.app')
    );

    // Check both original and normalized origin
    if (allowedOrigins.includes(normalizedOrigin) || 
        allowedOrigins.includes(origin) || 
        isNgrok) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin} (normalized: ${normalizedOrigin})`);
      // In production, be more permissive for debugging
      if (config.NODE_ENV === "production") {
        console.warn(`Allowing origin in production mode: ${origin}`);
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
    "X-Requested-With",
  ],
  exposedHeaders: [
    "Content-Length",
    "Content-Type",
  ],
  maxAge: 86400, // 24 hours
};

module.exports = {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  apiLimiter,
  helmetConfig,
  xssProtection,
  mongoSanitizeConfig,
  hppConfig,
  securityLogger,
  ipWhitelist,
  corsOptions,
};
