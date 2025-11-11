const User = require("../models/User");
const Post = require("../models/Post");
const { sendEmail, sendBulkEmails } = require("../services/emailService");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const ApiResponse = require("../utils/apiResponse");
const config = require("../config");

// Generate email template HTML
const generateEmailTemplate = (post, subject, content) => {
  const postUrl = `${config.CLIENT_URL || "http://localhost:5173"}/posts/${post.slug}`;
  const imageUrl =
    post.featuredImage?.url || post.featuredVideo?.thumbnail || "";
  const excerpt = post.excerpt || post.description || "";

  // Consistent color scheme
  const colors = {
    primary: "#2563eb", // Blue
    primaryDark: "#1e40af",
    primaryLight: "#3b82f6",
    text: "#1f2937",
    textLight: "#6b7280",
    bg: "#ffffff",
    bgLight: "#f9fafb",
    border: "#e5e7eb",
    accent: "#10b981", // Green for CTA
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center" style="padding: 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: ${colors.bg}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: ${colors.primary}; padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Kr Updates</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 400;">Stay updated with the latest news</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              
              <!-- Subject -->
              <h2 style="margin: 0 0 16px 0; color: ${colors.text}; font-size: 24px; font-weight: 700; line-height: 1.3; letter-spacing: -0.3px;">
                ${subject}
              </h2>
              
              <!-- Content Text -->
              <p style="margin: 0 0 32px 0; color: ${colors.textLight}; font-size: 16px; line-height: 1.7;">
                ${content}
              </p>
              
              <!-- Featured Image -->
              ${
                imageUrl
                  ? `
              <div style="margin: 0 0 32px 0; border-radius: 12px; overflow: hidden; background-color: ${colors.bgLight};">
                <img src="${imageUrl}" alt="${post.title}" style="width: 100%; height: auto; display: block; max-height: 320px; object-fit: cover;" />
              </div>
              `
                  : ""
              }
              
              <!-- Post Card -->
              <div style="background-color: ${colors.bgLight}; border: 1px solid ${colors.border}; border-radius: 12px; padding: 24px; margin: 0 0 32px 0;">
                <h3 style="margin: 0 0 12px 0; color: ${colors.text}; font-size: 20px; font-weight: 600; line-height: 1.4;">
                  ${post.title}
                </h3>
                ${
                  excerpt
                    ? `
                <p style="margin: 0; color: ${colors.textLight}; font-size: 15px; line-height: 1.6;">
                  ${excerpt}
                </p>
                `
                    : ""
                }
              </div>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${postUrl}" style="display: inline-block; background-color: ${colors.primary}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; letter-spacing: 0.3px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3), 0 2px 4px -1px rgba(37, 99, 235, 0.2); transition: background-color 0.2s;">
                      Read Full Article
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: ${colors.border};"></div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: ${colors.bgLight}; padding: 24px 32px; text-align: center;">
              <p style="margin: 0 0 8px 0; color: ${colors.textLight}; font-size: 13px; line-height: 1.5;">
                You're receiving this email because you're subscribed to our news feed.
              </p>
              <p style="margin: 0; color: ${colors.textLight}; font-size: 13px;">
                <a href="${config.CLIENT_URL || "http://localhost:5173"}" style="color: ${colors.primary}; text-decoration: none; font-weight: 500;">Visit our website</a>
                <span style="color: ${colors.border}; margin: 0 8px;">•</span>
                <a href="#" style="color: ${colors.primary}; text-decoration: none; font-weight: 500;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          
        </table>
        
        <!-- Bottom Spacing -->
        <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td align="center" style="padding: 0;">
              <p style="margin: 0; color: ${colors.textLight}; font-size: 12px; line-height: 1.5;">
                © ${new Date().getFullYear()} News Feed. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// Get all users for notification
const getUsers = catchAsync(async (req, res, next) => {
  const { search, role } = req.query;

  // Only require isActive: true for listing users
  // Email verification will be checked when actually sending emails
  const query = {
    isActive: true,
  };

  if (role && role !== "all") {
    query.role = role;
  }

  if (search) {
    query.$or = [
      { email: { $regex: search, $options: "i" } },
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(query)
    .select(
      "_id email firstName lastName username role profileImage isEmailVerified",
    )
    .sort({ createdAt: -1 })
    .limit(1000);

  ApiResponse.success(res, users, "Users retrieved successfully");
});

// Send notification to selected users
const sendNotification = catchAsync(async (req, res, next) => {
  const { postId, userIds, subject, content, sendToAll } = req.body;

  if (!postId || !subject || !content) {
    return next(
      new AppError("Post ID, subject, and content are required", 400),
    );
  }

  // Get post details
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Get users to send to
  let users = [];
  let totalUsers = 0;
  let unverifiedCount = 0;

  if (sendToAll) {
    // Get all active users first to count them
    const allActiveUsers = await User.find({
      isActive: true,
    }).select("_id email firstName lastName isEmailVerified");

    totalUsers = allActiveUsers.length;

    // Filter to only verified users for sending
    users = allActiveUsers.filter((user) => user.isEmailVerified);
    unverifiedCount = totalUsers - users.length;
  } else if (userIds && userIds.length > 0) {
    // Get selected users
    const selectedUsers = await User.find({
      _id: { $in: userIds },
      isActive: true,
    }).select("_id email firstName lastName isEmailVerified");

    totalUsers = selectedUsers.length;

    // Filter to only verified users for sending
    users = selectedUsers.filter((user) => user.isEmailVerified);
    unverifiedCount = totalUsers - users.length;
  } else {
    return next(
      new AppError("Please select users or choose to send to all", 400),
    );
  }

  if (users.length === 0) {
    return next(
      new AppError(
        `No users with verified emails found. ${unverifiedCount > 0 ? `${unverifiedCount} user(s) have unverified emails.` : ""}`,
        404,
      ),
    );
  }

  // Generate email template
  const emailHtml = generateEmailTemplate(post, subject, content);
  const postUrl = `${config.CLIENT_URL || "http://localhost:5173"}/posts/${post.slug}`;

  // Prepare email list
  const emailList = users.map((user) => ({
    to: user.email,
    subject: subject,
    html: emailHtml,
    text: `${subject}\n\n${content}\n\nRead full article: ${postUrl}`,
  }));

  // For large batches (1000+), process in background and return immediately
  // For smaller batches, wait for completion
  const LARGE_BATCH_THRESHOLD = 500;

  if (emailList.length >= LARGE_BATCH_THRESHOLD) {
    // Process in background for large batches
    sendBulkEmails(emailList)
      .then((results) => {
        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;
        console.log(
          `Background email sending completed: ${successCount} successful, ${failureCount} failed`,
        );
      })
      .catch((error) => {
        console.error("Error in background email sending:", error);
      });

    // Return immediately for large batches
    return ApiResponse.success(
      res,
      {
        total: users.length,
        totalRequested: totalUsers,
        unverifiedSkipped: unverifiedCount,
        processing: true,
        message: `Processing ${emailList.length} emails in background. This may take several minutes.`,
      },
      `Email sending started for ${emailList.length} users. Processing in background...`,
    );
  }

  // For smaller batches, wait for completion
  let results;
  try {
    results = await sendBulkEmails(emailList);
  } catch (error) {
    console.error("Error sending bulk emails:", error);
    return next(new AppError("Failed to send notifications", 500));
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  ApiResponse.success(
    res,
    {
      total: users.length,
      totalRequested: totalUsers,
      unverifiedSkipped: unverifiedCount,
      success: successCount,
      failed: failureCount,
      results: results,
    },
    `Notifications sent: ${successCount} successful, ${failureCount} failed${unverifiedCount > 0 ? `, ${unverifiedCount} skipped (unverified email)` : ""}`,
  );
});

// Send test email
const sendTestEmail = catchAsync(async (req, res, next) => {
  const { postId, email, subject, content } = req.body;

  if (!postId || !email || !subject || !content) {
    return next(
      new AppError("Post ID, email, subject, and content are required", 400),
    );
  }

  // Get post details
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Generate email template
  const emailHtml = generateEmailTemplate(post, subject, content);
  const postUrl = `${config.CLIENT_URL || "http://localhost:5173"}/posts/${post.slug}`;

  try {
    await sendEmail({
      to: email,
      subject: subject,
      html: emailHtml,
      text: `${subject}\n\n${content}\n\nRead full article: ${postUrl}`,
    });

    ApiResponse.success(res, null, "Test email sent successfully");
  } catch (error) {
    console.error("Error sending test email:", error);
    return next(new AppError("Failed to send test email", 500));
  }
});

module.exports = {
  getUsers,
  sendNotification,
  sendTestEmail,
};
