const express = require("express");
const router = express.Router();

const {
  getHindiSchedule,
  getStateNews,
} = require("../controllers/bhaskarController");

// Hindi match schedule (T20 WC etc.)
router.get("/schedule", getHindiSchedule);

// State news list (locations)
router.get("/states", getStateNews);

module.exports = router;


