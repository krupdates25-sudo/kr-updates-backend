const mongoose = require("mongoose");
require("dotenv").config();

// Import models
const Announcement = require("./src/models/Announcement");
const User = require("./src/models/User");

// Connect to MongoDB
mongoose.connect(
  process.env.MONGODB_URI_PRODUCTION || "mongodb://localhost:27017/news_blog",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
);

const createSampleAnnouncements = async () => {
  try {
    console.log("🔗 Connected to MongoDB");

    // Find an admin user to be the creator
    const adminUser = await User.findOne({ role: "admin" });
    if (!adminUser) {
      console.error(
        "❌ No admin user found. Please create an admin user first.",
      );
      process.exit(1);
    }

    console.log(
      `👤 Found admin user: ${adminUser.firstName} ${adminUser.lastName}`,
    );

    // Sample announcements
    const sampleAnnouncements = [
      {
        title: "Welcome to Our New Blog Platform!",
        message:
          "We're excited to launch our new blog platform with enhanced features, better performance, and improved user experience. Explore the new interface and share your thoughts!",
        type: "success",
        priority: "high",
        targetAudience: "all",
        icon: "star",
        actionUrl: "/dashboard",
        actionText: "Explore Now",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        createdBy: adminUser._id,
      },
      {
        title: "Scheduled Maintenance Notice",
        message:
          "We will be performing scheduled maintenance on our servers this weekend from 2:00 AM to 4:00 AM EST. Some features may be temporarily unavailable during this time.",
        type: "warning",
        priority: "medium",
        targetAudience: "all",
        icon: "alert",
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdBy: adminUser._id,
      },
      {
        title: "New Dark Mode Feature Available",
        message:
          "You can now switch between light and dark themes! Look for the theme toggle button in the header to customize your viewing experience.",
        type: "info",
        priority: "medium",
        targetAudience: "all",
        icon: "update",
        actionUrl: "/profile",
        actionText: "Try It Now",
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        createdBy: adminUser._id,
      },
      {
        title: "Admin Panel Updates",
        message:
          "New administrative features have been added including user management, announcement system, and enhanced analytics. Check out the admin panel for more details.",
        type: "update",
        priority: "high",
        targetAudience: "admin",
        icon: "bell",
        actionUrl: "/admin/dashboard",
        actionText: "View Updates",
        startDate: new Date(),
        endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days
        createdBy: adminUser._id,
      },
      {
        title: "Community Guidelines Updated",
        message:
          "We've updated our community guidelines to ensure a better experience for everyone. Please review the new guidelines to stay informed about our policies.",
        type: "info",
        priority: "low",
        targetAudience: "all",
        icon: "info",
        actionUrl: "/guidelines",
        actionText: "Read Guidelines",
        startDate: new Date(),
        endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        createdBy: adminUser._id,
      },
      {
        title: "Security Enhancement Notice",
        message:
          "We've implemented additional security measures to protect your account. Please ensure your password is strong and consider enabling two-factor authentication.",
        type: "warning",
        priority: "high",
        targetAudience: "all",
        icon: "alert",
        actionUrl: "/profile",
        actionText: "Update Security",
        startDate: new Date(),
        endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days
        createdBy: adminUser._id,
      },
    ];

    // Clear existing announcements (optional)
    await Announcement.deleteMany({});
    console.log("🗑️  Cleared existing announcements");

    // Create sample announcements
    const createdAnnouncements =
      await Announcement.insertMany(sampleAnnouncements);
    console.log(
      `✅ Created ${createdAnnouncements.length} sample announcements:`,
    );

    createdAnnouncements.forEach((announcement, index) => {
      console.log(
        `   ${index + 1}. ${announcement.title} (${announcement.type} - ${announcement.priority})`,
      );
    });

    console.log("\n🎉 Sample announcements created successfully!");
    console.log(
      "📱 You can now view them in the header notifications or admin panel.",
    );
  } catch (error) {
    console.error("❌ Error creating sample announcements:", error);
  } finally {
    mongoose.connection.close();
    console.log("📪 Database connection closed");
  }
};

// Run the script
createSampleAnnouncements();
