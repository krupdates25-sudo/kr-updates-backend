
const express = require('express');
const translateController = require('../controllers/translateController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public translation for now, or protect it if needed
router.post('/', translateController.translateText);

module.exports = router;
