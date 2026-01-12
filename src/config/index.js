const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

const requiredEnvVars = [
  "NODE_ENV",
  "PORT",
  "JWT_SECRET",
];

// Require at least one DB URI (local dev or production)
const hasDbUri = !!(
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI_PRODUCTION
);

// Validate required environment variables
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0 || !hasDbUri) {
  console.error(
    "❌ Missing required environment variables:",
    [
      ...missingEnvVars,
      ...(!hasDbUri ? ["MONGODB_URI (or MONGODB_URI_PRODUCTION)"] : []),
    ].join(", "),
  );
  console.error(
    "📝 Please create a .env file in the root directory with the following variables:",
  );
  console.error(
    "JWT_SECRET=your-super-secure-jwt-secret-key-at-least-32-characters-long",
  );
  console.error("JWT_EXPIRES_IN=7d");
  process.exit(1);
}

const config = {
  // Server Configuration
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT, 10) || 5000,

  // Database Configuration
  // Prefer local/dev URI when present; fall back to production URI.
  MONGODB_URI:
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.MONGODB_URI_PRODUCTION,

  // JWT Configuration - 7 days expiry
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d", // 7 days token expiry
  JWT_COOKIE_EXPIRES_IN: parseInt(process.env.JWT_COOKIE_EXPIRES_IN, 10) || 7, // 7 days cookie expiry

  // Security Configuration
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
  RATE_LIMIT_WINDOW_MS:
    parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS:
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,

  // Email Configuration
  EMAIL_FROM: process.env.EMAIL_FROM,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  // Pagination
  DEFAULT_PAGE_SIZE: parseInt(process.env.DEFAULT_PAGE_SIZE, 10) || 10,
  MAX_PAGE_SIZE: parseInt(process.env.MAX_PAGE_SIZE, 10) || 100,

  // Client URL
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
};

module.exports = config;
