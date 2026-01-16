const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const morgan = require("morgan");

// Import configuration and database
const config = require("./config");
const Database = require("./config/database");

// Import security middleware
const {
  generalLimiter,
  helmetConfig,
  xssProtection,
  mongoSanitizeConfig,
  hppConfig,
  securityLogger,
  corsOptions,
} = require("./middleware/security");

// Import error handling
const { AppError } = require("./utils/appError");
const globalErrorHandler = require("./middleware/errorHandler");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const postRoutes = require("./routes/posts");
const activityRoutes = require("./routes/activities");
const whatsappRoutes = require("./routes/whatsapp");
const advertisementRoutes = require("./routes/advertisements");
const announcementRoutes = require("./routes/announcements");
const searchRoutes = require("./routes/search");
const breakingNewsRoutes = require("./routes/breakingNews");
const notificationRoutes = require("./routes/notifications");
const settingsRoutes = require("./routes/settings");
const feedbackRoutes = require("./routes/feedbacks");

// Initialize database
Database.getInstance();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Create Socket.IO instance
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://ae29ca4a076d.ngrok-free.app",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  },
});

// Make io available globally
global.io = io;

// Trust proxy (for rate limiting and IP detection)
app.set("trust proxy", 1);

// Security middleware
app.use(helmetConfig);
app.use(cors(corsOptions));
// app.use(generalLimiter); // Removed rate limiting
app.use(mongoSanitizeConfig);
app.use(xssProtection);
app.use(hppConfig);
app.use(securityLogger);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (config.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
  });
});

// API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/posts", postRoutes);
app.use("/api/v1/activities", activityRoutes);
app.use("/api/v1/whatsapp", whatsappRoutes);
app.use("/api/v1/advertisements", advertisementRoutes);
app.use("/api/v1/announcements", announcementRoutes);
app.use("/api/v1/search", searchRoutes);
app.use("/api/v1/breaking-news", breakingNewsRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/feedbacks", feedbackRoutes);

// Handle undefined routes
app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handling middleware
app.use(globalErrorHandler);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received. Shutting down gracefully");
  server.close(() => {
    console.log("💥 Process terminated!");
  });
});

process.on("SIGINT", () => {
  console.log("👋 SIGINT received. Shutting down gracefully");
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.log(err.name, err.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.log("UNHANDLED REJECTION! 💥 Shutting down...");
  console.log(err.name, err.message);
  process.exit(1);
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`👤 User connected: ${socket.id}`);

  // Join user room for personal notifications
  socket.on("joinUser", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 User ${socket.id} joined user room ${userId}`);
  });

  // Leave user room
  socket.on("leaveUser", (userId) => {
    socket.leave(`user_${userId}`);
    console.log(`👤 User ${socket.id} left user room ${userId}`);
  });

  // Join post room for real-time updates
  socket.on("joinPost", (postId) => {
    socket.join(`post_${postId}`);
    console.log(`📄 User ${socket.id} joined post ${postId}`);
  });

  // Leave post room
  socket.on("leavePost", (postId) => {
    socket.leave(`post_${postId}`);
    console.log(`📄 User ${socket.id} left post ${postId}`);
  });

  socket.on("disconnect", () => {
    console.log(`👤 User disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = config.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running in ${config.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
