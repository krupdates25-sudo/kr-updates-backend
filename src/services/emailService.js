const nodemailer = require("nodemailer");

// Admin email (sender email)
const ADMIN_EMAIL = "krupdates.25@gmail.com";

// Create transporter
const createTransporter = () => {
  // Validate SMTP configuration
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error(
      "SMTP credentials are missing. Please configure SMTP_USER and SMTP_PASS in your .env file.",
    );
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || ADMIN_EMAIL,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Send email function
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"KR Updates" <${ADMIN_EMAIL}>`,
      to, // Recipient email (selected user's email)
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""), // Strip HTML for text version
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to}:`, result.messageId);
    return result;
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
};

// Send bulk emails with batch processing and rate limiting
const sendBulkEmails = async (emailList) => {
  const results = [];

  // Configuration for batch processing
  const BATCH_SIZE = 50; // Emails per batch
  const CONCURRENT_PER_BATCH = 10; // Parallel sends per batch
  const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds delay between batches (to respect rate limits)

  // Create a single transporter instance to reuse
  const transporter = createTransporter();

  // Split emails into batches
  const batches = [];
  for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
    batches.push(emailList.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `Processing ${emailList.length} emails in ${batches.length} batches...`,
  );

  // Process batches sequentially with delays
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(
      `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} emails)...`,
    );

    // Process emails in batch with limited concurrency
    const batchPromises = [];
    for (let i = 0; i < batch.length; i += CONCURRENT_PER_BATCH) {
      const concurrentBatch = batch.slice(i, i + CONCURRENT_PER_BATCH);

      const concurrentPromises = concurrentBatch.map(async (emailData) => {
        try {
          const mailOptions = {
            from: `"KR Updates" <${ADMIN_EMAIL}>`,
            to: emailData.to,
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text || emailData.html.replace(/<[^>]*>/g, ""),
          };

          const result = await transporter.sendMail(mailOptions);
          return {
            success: true,
            email: emailData.to,
            messageId: result.messageId,
          };
        } catch (error) {
          return {
            success: false,
            email: emailData.to,
            error: error.message,
          };
        }
      });

      batchPromises.push(Promise.all(concurrentPromises));
    }

    // Wait for all concurrent sends in this batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.flat());

    // Add delay between batches (except for the last batch)
    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES),
      );
    }
  }

  console.log(
    `Completed processing ${emailList.length} emails. Success: ${results.filter((r) => r.success).length}, Failed: ${results.filter((r) => !r.success).length}`,
  );

  return results;
};

// Verify email configuration
const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log("Email configuration verified successfully");
    return true;
  } catch (error) {
    console.error("Email configuration verification failed:", error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmails,
  verifyEmailConfig,
};
