const express = require("express");
const router = express.Router();

const updatesController = require("../controllers/updatesController");

// Public: collect leads for "Want updates?"
router.post("/subscribe", updatesController.subscribe);

module.exports = router;







