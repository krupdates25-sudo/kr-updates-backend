const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, ".env") });

const SiteSettings = require("./src/models/SiteSettings");

async function test() {
    try {
        console.log("Connecting to:", process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected!");

        const settings = await SiteSettings.getSettings();
        console.log("Settings found:", settings);

        process.exit(0);
    } catch (err) {
        console.error("Test failed!");
        console.error(err);
        process.exit(1);
    }
}

test();
