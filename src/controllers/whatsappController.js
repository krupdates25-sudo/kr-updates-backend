const twilio = require("twilio");
const catchAsync = require("../utils/catchAsync");
const ApiResponse = require("../utils/apiResponse");
const { AppError } = require("../utils/appError");

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Format: whatsapp:+14155238886

let client;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

// Send WhatsApp message
const sendWhatsAppMessage = catchAsync(async (req, res, next) => {
  const { recipients, message, customNumber } = req.body;

  if (!message || message.trim() === "") {
    return next(new AppError("Message content is required", 400));
  }

  if ((!recipients || recipients.length === 0) && !customNumber) {
    return next(new AppError("At least one recipient is required", 400));
  }

  // If Twilio is not configured, return mock success response
  if (!client || !accountSid || !authToken || !twilioWhatsAppNumber) {
    console.log("📱 Mock WhatsApp message (Twilio not configured):", {
      recipients: recipients || [],
      customNumber: customNumber || null,
      message: message,
    });

    const mockResponse = {
      totalSent: (recipients?.length || 0) + (customNumber ? 1 : 0),
      totalFailed: 0,
      successful: [
        ...(recipients || []).map((recipient, index) => ({
          to: recipient,
          sid: `mock_sid_${Date.now()}_${index}`,
          status: "queued",
          success: true,
        })),
        ...(customNumber
          ? [
              {
                to: customNumber,
                sid: `mock_sid_${Date.now()}_custom`,
                status: "queued",
                success: true,
              },
            ]
          : []),
      ],
      failed: [],
    };

    return ApiResponse.success(
      res,
      mockResponse,
      `Mock WhatsApp messages sent successfully to ${mockResponse.totalSent} recipient(s). Configure Twilio credentials for real messaging.`,
    );
  }

  const results = [];
  const errors = [];

  try {
    // Prepare phone numbers
    let phoneNumbers = [];

    if (customNumber) {
      // Format custom number
      const formattedNumber = formatPhoneNumber(customNumber);
      phoneNumbers.push(formattedNumber);
    }

    if (recipients && recipients.length > 0) {
      // Format recipients phone numbers
      const formattedRecipients = recipients
        .filter((recipient) => recipient && recipient.trim()) // Filter out empty recipients
        .map(formatPhoneNumber)
        .filter((phone) => phone && phone.length > 3); // Filter out invalid formatted numbers
      phoneNumbers = [...phoneNumbers, ...formattedRecipients];
    }

    // Remove duplicates and filter out invalid numbers
    phoneNumbers = [...new Set(phoneNumbers)].filter(
      (phone) =>
        phone &&
        phone.startsWith("+") &&
        phone.length >= 10 &&
        phone.length <= 16 &&
        /^\+\d+$/.test(phone), // Only + followed by digits
    );

    if (phoneNumbers.length === 0) {
      return next(new AppError("No valid phone numbers provided", 400));
    }

    console.log("📱 Sending WhatsApp messages:", {
      from: twilioWhatsAppNumber,
      to: phoneNumbers,
      message: message.substring(0, 50) + "...",
    });

    // Send messages
    for (const phoneNumber of phoneNumbers) {
      try {
        // Double-check phone number format before sending
        if (!phoneNumber.startsWith("+") || phoneNumber.length < 10) {
          throw new Error(`Invalid phone number format: ${phoneNumber}`);
        }

        // Ensure Twilio WhatsApp number is properly formatted
        const fromNumber = twilioWhatsAppNumber.startsWith("whatsapp:")
          ? twilioWhatsAppNumber
          : `whatsapp:${twilioWhatsAppNumber}`;

        const messageResult = await client.messages.create({
          body: message,
          from: fromNumber, // Your Twilio WhatsApp number (must include whatsapp: prefix)
          to: `whatsapp:${phoneNumber}`, // Recipient's WhatsApp number
        });

        results.push({
          to: phoneNumber,
          sid: messageResult.sid,
          status: messageResult.status,
          success: true,
        });

        // Log successful message
        console.log(
          `✅ WhatsApp message sent to ${phoneNumber}: ${messageResult.sid}`,
        );
      } catch (error) {
        console.error(
          `❌ Failed to send WhatsApp message to ${phoneNumber}:`,
          error.message,
        );
        errors.push({
          to: phoneNumber,
          error: error.message,
          success: false,
        });
      }
    }

    // Prepare response
    const response = {
      totalSent: results.length,
      totalFailed: errors.length,
      successful: results,
      failed: errors,
    };

    if (results.length > 0) {
      ApiResponse.success(
        res,
        response,
        `WhatsApp messages sent successfully to ${results.length} recipient(s)`,
      );
    } else {
      // If no messages were sent successfully, return error details
      const errorMessage =
        errors.length > 0
          ? `Failed to send messages: ${errors.map((e) => e.error).join(", ")}`
          : "No messages were sent successfully";

      ApiResponse.success(res, response, errorMessage, 200);
    }
  } catch (error) {
    console.error("WhatsApp sending error:", error);
    return next(new AppError("Failed to send WhatsApp messages", 500));
  }
});

// Handle incoming WhatsApp messages (webhook)
const handleIncomingMessage = catchAsync(async (req, res, next) => {
  const { Body, From, To, MessageSid } = req.body;

  console.log("📱 Incoming WhatsApp message:", {
    from: From,
    to: To,
    body: Body,
    sid: MessageSid,
  });

  // Extract phone number from WhatsApp format
  const senderPhone = From.replace("whatsapp:", "");

  // Here you can:
  // 1. Save the message to database
  // 2. Process the message content
  // 3. Send automated responses
  // 4. Notify admins of new messages

  // Example: Send auto-reply
  if (client && Body.toLowerCase().includes("hello")) {
    try {
      await client.messages.create({
        body: "👋 Hello! Thanks for contacting us. We'll get back to you soon!",
        from: To, // Your WhatsApp number
        to: From, // Sender's WhatsApp number
      });
    } catch (error) {
      console.error("Failed to send auto-reply:", error);
    }
  }

  // Respond to Twilio webhook
  res.status(200).send("OK");
});

// Get message status (delivery reports)
const getMessageStatus = catchAsync(async (req, res, next) => {
  if (!client) {
    return next(new AppError("WhatsApp service not configured", 500));
  }

  const { messageSid } = req.params;

  try {
    const message = await client.messages(messageSid).fetch();

    ApiResponse.success(
      res,
      {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
      },
      "Message status retrieved successfully",
    );
  } catch (error) {
    console.error("Error fetching message status:", error);
    return next(new AppError("Failed to fetch message status", 500));
  }
});

// Format phone number to international format
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") return null;

  // Remove all whitespace and non-digit characters except +
  const cleaned = phoneNumber.trim().replace(/[^\d+]/g, "");

  // If empty after cleaning, return null
  if (!cleaned || cleaned === "+") return null;

  // If already starts with +, validate and return
  if (cleaned.startsWith("+")) {
    // Ensure it's at least 10 digits after the +
    const digits = cleaned.substring(1);
    if (digits.length >= 10 && digits.length <= 15 && /^\d+$/.test(digits)) {
      return cleaned;
    } else {
      return null; // Invalid format
    }
  }

  // Remove any + from middle of string for processing
  const digitsOnly = cleaned.replace(/\+/g, "");

  // Must have at least 10 digits
  if (digitsOnly.length < 10) return null;

  // Handle different number formats
  if (digitsOnly.length === 10) {
    // Assume Indian number, add +91
    return `+91${digitsOnly}`;
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    // Indian number with country code
    return `+${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    // US/Canada number
    return `+${digitsOnly}`;
  } else if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    // International number, add +
    return `+${digitsOnly}`;
  }

  // If we can't format it properly, return null
  return null;
};

// Test WhatsApp configuration
const testWhatsAppConfig = catchAsync(async (req, res, next) => {
  const configStatus = {
    configured: false,
    accountSid: accountSid ? "✅ Set" : "❌ Missing",
    authToken: authToken ? "✅ Set" : "❌ Missing",
    whatsappNumber: twilioWhatsAppNumber
      ? `✅ Set (${twilioWhatsAppNumber})`
      : "❌ Missing",
    requiredEnvVars: [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_WHATSAPP_NUMBER",
    ],
    notes: [],
  };

  if (!client) {
    configStatus.notes.push(
      "⚠️ Twilio client not initialized - check environment variables",
    );
    return ApiResponse.success(
      res,
      configStatus,
      "WhatsApp configuration incomplete",
    );
  }

  try {
    // Test by fetching account info
    const account = await client.api.accounts(accountSid).fetch();

    configStatus.configured = true;
    configStatus.accountName = account.friendlyName;
    configStatus.accountStatus = account.status;

    // Additional checks
    if (!twilioWhatsAppNumber.startsWith("whatsapp:")) {
      configStatus.notes.push(
        "⚠️ TWILIO_WHATSAPP_NUMBER should start with 'whatsapp:' (e.g., 'whatsapp:+14155238886')",
      );
    }

    if (account.status !== "active") {
      configStatus.notes.push(
        `⚠️ Twilio account status is '${account.status}', should be 'active'`,
      );
    }

    configStatus.notes.push("💡 For WhatsApp sandbox testing:");
    configStatus.notes.push(
      "1. Go to Twilio Console > Messaging > Try it out > Send a WhatsApp message",
    );
    configStatus.notes.push("2. Follow the sandbox setup instructions");
    configStatus.notes.push(
      "3. Send 'join <sandbox-keyword>' to your Twilio WhatsApp number first",
    );
    configStatus.notes.push(
      "4. The recipient must be verified in the sandbox before sending messages",
    );

    ApiResponse.success(
      res,
      configStatus,
      "WhatsApp service configuration checked",
    );
  } catch (error) {
    configStatus.notes.push(`❌ Configuration test failed: ${error.message}`);
    return ApiResponse.success(
      res,
      configStatus,
      "WhatsApp configuration has issues",
    );
  }
});

module.exports = {
  sendWhatsAppMessage,
  handleIncomingMessage,
  getMessageStatus,
  testWhatsAppConfig,
};
