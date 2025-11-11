const mongoose = require("mongoose");
const User = require("./src/models/User");
require("dotenv").config();

const MONGODB_URI_PRODUCTION =
  process.env.MONGODB_URI_PRODUCTION ||
  "mongodb+srv://kannikaparashar4:kannikaparashar3004@kannika.pncnq3j.mongodb.net/news_feed_production";

const createAdminUser = async () => {
  try {
    console.log("🔗 Connecting to Production MongoDB...");
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI_PRODUCTION, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ Connected to MongoDB successfully!");

    // Admin user data
    const adminData = {
      username: "kannika",
      email: "admin@example.com",
      password: "123Aa123",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
      isEmailVerified: true,
    };

    // Check if admin user already exists
    const existingUser = await User.findOne({
      $or: [{ email: adminData.email }, { username: adminData.username }],
    });

    if (existingUser) {
      console.log("\n⚠️  Admin user already exists!");
      console.log("Username:", existingUser.username);
      console.log("Email:", existingUser.email);
      console.log("Role:", existingUser.role);
      return;
    }

    // Create admin user
    console.log("\n👤 Creating admin user...");
    const adminUser = await User.create(adminData);
    console.log("\n✅ Admin user created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Admin Details:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Username:", adminUser.username);
    console.log("Email:", adminUser.email);
    console.log("Full Name:", adminUser.fullName);
    console.log("Role:", adminUser.role);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n🔐 Login Credentials:");
    console.log("Email:", adminData.email);
    console.log("Password:", adminData.password);
    console.log("\n⚠️  Please save these credentials securely!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error) {
    console.error("\n❌ Error creating admin user:", error.message);

    if (error.code === 11000) {
      console.error(
        "⚠️  Duplicate entry: A user with this email or username already exists.",
      );
    }

    if (error.errors) {
      Object.keys(error.errors).forEach((key) => {
        console.error(`  - ${key}: ${error.errors[key].message}`);
      });
    }

    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("📴 Disconnected from MongoDB");
  }
};

// Run the script
createAdminUser();
