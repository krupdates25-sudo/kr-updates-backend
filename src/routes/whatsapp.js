const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  sendWhatsAppMessage,
  handleIncomingMessage,
  getMessageStatus,
  testWhatsAppConfig,
} = require("../controllers/whatsappController");

const router = express.Router();

// Public webhook for incoming messages (Twilio will call this)
router.post("/webhook", handleIncomingMessage);

// Temporary public route for configuration testing
router.get("/config-check", testWhatsAppConfig);

// Protected routes
router.use(protect);

// Admin only routes
router.post("/send", restrictTo("admin"), sendWhatsAppMessage);
router.get("/status/:messageSid", restrictTo("admin"), getMessageStatus);
router.get("/test-config", restrictTo("admin"), testWhatsAppConfig);

module.exports = router;
