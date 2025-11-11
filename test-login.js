const mongoose = require("mongoose");
const User = require("./src/models/User");
const config = require("./src/config");

async function testLogin() {
  try {
    await mongoose.connect(config.MONGODB_URI_PRODUCTION);
    console.log("Connected to MongoDB");

    // Test login for different users
    const testCredentials = [
      { username: "admin@example.com", password: "admin123" },
      { username: "admin", password: "admin123" },
      { username: "test@gmail.com", password: "test123" },
      { username: "test", password: "test123" },
      { username: "kannika30@gmail.com", password: "kannika123" },
      { username: "kannika30", password: "kannika123" },
    ];

    console.log("\nTesting login credentials:");
    console.log("==========================");

    for (const cred of testCredentials) {
      try {
        console.log(
          `\nTesting: ${cred.username} with password: ${cred.password}`,
        );

        const result = await User.getAuthenticated(
          cred.username,
          cred.password,
        );

        if (result.user) {
          console.log(
            `✅ SUCCESS: ${result.user.firstName} ${result.user.lastName} (${result.user.role})`,
          );
        } else {
          console.log(`❌ FAILED: ${result.error}`);
        }
      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
      }
    }

    // Also check if users have passwords set
    console.log("\n\nChecking user password status:");
    console.log("==============================");

    const users = await User.find({}).select(
      "+password username email firstName lastName",
    );
    users.forEach((user) => {
      console.log(
        `${user.username} (${user.email}): Password ${user.password ? "SET" : "NOT SET"} (${user.password ? user.password.substring(0, 10) + "..." : "N/A"})`,
      );
    });

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

testLogin();
