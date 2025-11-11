const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");
const config = require("./src/config");

async function fixUsers() {
  try {
    await mongoose.connect(config.MONGODB_URI_PRODUCTION);
    console.log("Connected to MongoDB");

    // Unlock all locked accounts
    console.log("Unlocking all locked accounts...");
    const unlockResult = await User.updateMany(
      {
        $or: [{ lockUntil: { $exists: true } }, { loginAttempts: { $gt: 0 } }],
      },
      {
        $unset: { lockUntil: 1, loginAttempts: 1 },
      },
    );
    console.log(`Unlocked ${unlockResult.modifiedCount} accounts`);

    // Reset passwords for known users
    const userUpdates = [
      { email: "admin@example.com", password: "admin123" },
      { email: "test@gmail.com", password: "test123" },
      { email: "kannika30@gmail.com", password: "kannika123" },
      { email: "02vineetmishra@gmail.com", password: "vineet123" },
      { email: "test5@gmail.com", password: "test123" },
      { email: "kam@kam.com", password: "kam123" },
      { email: "kk@kk.com", password: "kk123" },
    ];

    console.log("\nResetting passwords for users...");
    for (const update of userUpdates) {
      try {
        const hashedPassword = await bcrypt.hash(update.password, 12);
        const result = await User.updateOne(
          { email: update.email },
          {
            password: hashedPassword,
            $unset: { lockUntil: 1, loginAttempts: 1 },
          },
        );

        if (result.modifiedCount > 0) {
          console.log(
            `✅ Updated password for ${update.email} -> ${update.password}`,
          );
        } else {
          console.log(`❌ User not found: ${update.email}`);
        }
      } catch (error) {
        console.log(`❌ Error updating ${update.email}: ${error.message}`);
      }
    }

    // Create a fresh test admin if needed
    const testAdmin = await User.findOne({ email: "testadmin@test.com" });
    if (!testAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 12);
      await User.create({
        username: "testadmin",
        email: "testadmin@test.com",
        password: hashedPassword,
        firstName: "Test",
        lastName: "Admin",
        role: "admin",
        isActive: true,
        isEmailVerified: true,
      });
      console.log("\n✅ Created fresh test admin:");
      console.log("Email: testadmin@test.com");
      console.log("Username: testadmin");
      console.log("Password: admin123");
    }

    // Create a fresh test moderator if needed
    const testMod = await User.findOne({ email: "testmod@test.com" });
    if (!testMod) {
      const hashedPassword = await bcrypt.hash("mod123", 12);
      await User.create({
        username: "testmod",
        email: "testmod@test.com",
        password: hashedPassword,
        firstName: "Test",
        lastName: "Moderator",
        role: "moderator",
        isActive: true,
        isEmailVerified: true,
      });
      console.log("\n✅ Created fresh test moderator:");
      console.log("Email: testmod@test.com");
      console.log("Username: testmod");
      console.log("Password: mod123");
    }

    console.log("\n✅ All users fixed and unlocked!");
    console.log("\nTest these credentials:");
    console.log("=======================");
    console.log("Admin: admin@example.com / admin123");
    console.log("Admin: testadmin@test.com / admin123");
    console.log("Moderator: testmod@test.com / mod123");
    console.log("User: test@gmail.com / test123");

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixUsers();
