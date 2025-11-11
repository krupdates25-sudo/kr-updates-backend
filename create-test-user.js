const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");
const config = require("./src/config");

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI_PRODUCTION);
    console.log("Connected to MongoDB");

    // Check if test user already exists
    const existingUser = await User.findOne({ email: "admin@test.com" });
    if (existingUser) {
      console.log("Test admin user already exists");
      console.log("Email: admin@test.com");
      console.log("Password: admin123");
      process.exit(0);
    }

    // Create test admin user
    const testUser = await User.create({
      username: "admin",
      email: "admin@test.com",
      password: "admin123",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
      isEmailVerified: true,
    });

    console.log("Test admin user created successfully!");
    console.log("Email: admin@test.com");
    console.log("Username: admin");
    console.log("Password: admin123");
    console.log("Role: admin");

    // Also create a test moderator
    const existingModerator = await User.findOne({
      email: "moderator@test.com",
    });
    if (!existingModerator) {
      await User.create({
        username: "moderator",
        email: "moderator@test.com",
        password: "moderator123",
        firstName: "Moderator",
        lastName: "User",
        role: "moderator",
        isActive: true,
        isEmailVerified: true,
      });
      console.log("\nTest moderator user created successfully!");
      console.log("Email: moderator@test.com");
      console.log("Username: moderator");
      console.log("Password: moderator123");
      console.log("Role: moderator");
    }

    // Create a test regular user
    const existingViewer = await User.findOne({ email: "user@test.com" });
    if (!existingViewer) {
      await User.create({
        username: "testuser",
        email: "user@test.com",
        password: "user123",
        firstName: "Test",
        lastName: "User",
        role: "viewer",
        isActive: true,
        isEmailVerified: true,
      });
      console.log("\nTest regular user created successfully!");
      console.log("Email: user@test.com");
      console.log("Username: testuser");
      console.log("Password: user123");
      console.log("Role: viewer");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error creating test user:", error);
    process.exit(1);
  }
}

createTestUser();
