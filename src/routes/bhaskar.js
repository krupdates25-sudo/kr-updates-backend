const express = require("express");
const router = express.Router();

const {
  getHindiSchedule,
  getStateNews,
  getCricketFeed,
  getStoryDetails,
} = require("../controllers/bhaskarController");

// Hindi match schedule (T20 WC etc.)
router.get("/schedule", getHindiSchedule);

// State news list (locations)
router.get("/states", getStateNews);

// Cricket category feed (news)
router.get("/cricket", getCricketFeed);

// Story details by filename
router.get("/story/:filename", getStoryDetails);
router.get("/story", getStoryDetails); // Also support ?shortUrl=... query param

module.exports = router;


