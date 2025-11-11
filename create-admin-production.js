const mongoose = require("mongoose");
const User = require("./src/models/User");
const readline = require("readline-sync");
require("dotenv").config();

const MONGODB_URI_PRODUCTION =
  process.env.MONGODB_URI_PRODUCTION ||
  "mongodb+srv://kannikaparashar4:kannikaparashar3004@kannika.pncnq3j.mongodb.net/news_feed_production";

const createAdminUser = async () => {
  try {
    console.log("🔗 Connecting to Production MongoDB...");
    console.log(
      "📍 Database:",
      MONGODB_URI_PRODUCTION.split("@")[1] || "Production",
    );

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI_PRODUCTION, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
    });

    console.log("✅ Connected to MongoDB successfully!\n");

    // Get admin details from user input
    console.log("📝 Please provide admin user details:\n");

    const username =
      readline.question("Username (default: admin): ") || "admin";
    const email = readline.questionEMail("Email: ", {
      keepWhitespace: false,
    });
    const password = readline.question("Password (min 6 characters): ", {
      hideEchoBack: true,
    });
    const firstName =
      readline.question("First Name (default: Admin): ") || "Admin";
    const lastName = readline.question("Last Name (default: User): ") || "User";

    // Validate password
    if (password.length < 6) {
      console.error("❌ Error: Password must be at least 6 characters long");
      await mongoose.disconnect();
      process.exit(1);
    }

    // Admin user data
    const adminData = {
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password: password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: "admin",
      isActive: true,
      isEmailVerified: true,
    };

    console.log("\n🔍 Checking if admin user already exists...");

    // Check if admin user already exists
    const existingUser = await User.findOne({
      $or: [{ email: adminData.email }, { username: adminData.username }],
    });

    if (existingUser) {
      console.log("\n⚠️  User already exists!");
      console.log("Username:", existingUser.username);
      console.log("Email:", existingUser.email);
      console.log("Role:", existingUser.role);

      const updateRole = readline.keyInYNStrict(
        "\nDo you want to update this user to admin role?",
      );

      if (updateRole) {
        existingUser.role = "admin";
        existingUser.isActive = true;
        existingUser.isEmailVerified = true;
        if (password) {
          existingUser.password = password; // Will be hashed by pre-save hook
        }
        await existingUser.save();
        console.log("\n✅ User updated to admin successfully!");
        console.log("Username:", existingUser.username);
        console.log("Email:", existingUser.email);
        console.log("Role:", existingUser.role);
      } else {
        console.log("\n❌ Operation cancelled.");
      }
      await mongoose.disconnect();
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
    console.log("Status:", adminUser.isActive ? "Active" : "Inactive");
    console.log("Email Verified:", adminUser.isEmailVerified ? "Yes" : "No");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n🔐 Login Credentials:");
    console.log("Email:", adminUser.email);
    console.log("Password:", password);
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
console.log("🚀 Admin User Creation Script");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
createAdminUser();
