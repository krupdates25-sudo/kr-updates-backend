const mongoose = require("mongoose");
const User = require("./src/models/User");
const config = require("./src/config");

async function listUsers() {
  try {
    await mongoose.connect(config.MONGODB_URI_PRODUCTION);
    console.log("Connected to MongoDB");

    const users = await User.find({}).select(
      "username email firstName lastName role isActive",
    );
    console.log("\nUsers in database:");
    console.log("==================");

    if (users.length === 0) {
      console.log("No users found in database");
    } else {
      users.forEach((user) => {
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Name: ${user.firstName} ${user.lastName}`);
        console.log(`Role: ${user.role}`);
        console.log(`Active: ${user.isActive}`);
        console.log("---");
      });
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

listUsers();
