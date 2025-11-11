const { validationResult } = require("express-validator");
const User = require("../models/User");
const Activity = require("../models/Activity");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const ApiResponse = require("../utils/apiResponse");
const config = require("../config");
const emailService = require("../services/emailService");
const crypto = require("crypto");

// Helper functions for activity logging
const extractBrowserInfo = (userAgent) => {
  if (!userAgent) return {};
  const browserRegex = {
    Chrome: /Chrome\/([0-9.]+)/,
    Firefox: /Firefox\/([0-9.]+)/,
    Safari: /Safari\/([0-9.]+)/,
    Edge: /Edge\/([0-9.]+)/,
    Opera: /Opera\/([0-9.]+)/,
    IE: /MSIE ([0-9.]+)/,
  };
  const osRegex = {
    Windows: /Windows NT ([0-9.]+)/,
    macOS: /Mac OS X ([0-9._]+)/,
    Linux: /Linux/,
    Android: /Android ([0-9.]+)/,
    iOS: /iPhone OS ([0-9._]+)/,
  };
  let browser = "Unknown",
    version = "",
    os = "Unknown",
    mobile = false;
  for (const [name, regex] of Object.entries(browserRegex)) {
    const match = userAgent.match(regex);
    if (match) {
      browser = name;
      version = match[1];
      break;
    }
  }
  for (const [name, regex] of Object.entries(osRegex)) {
    const match = userAgent.match(regex);
    if (match) {
      os = name;
      if (match[1]) os += ` ${match[1].replace(/_/g, ".")}`;
      break;
    }
  }
  mobile =
    /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent,
    );
  return {
    userAgent,
    browser,
    version,
    os,
    platform: mobile ? "Mobile" : "Desktop",
    mobile,
  };
};

const getNetworkInfo = (req) => {
  const ipAddress =
    req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"];
  return {
    ipAddress: ipAddress?.replace("::ffff:", "") || "Unknown",
    country: req.headers["cf-ipcountry"] || "Unknown",
    region: "Unknown",
    city: "Unknown",
    isp: "Unknown",
  };
};

const logActivity = async (data, req = null) => {
  try {
    const activityData = { ...data, timestamp: new Date() };
    if (req) {
      activityData.browserInfo = extractBrowserInfo(req.headers["user-agent"]);
      activityData.networkInfo = getNetworkInfo(req);
      if (req.headers.referer) {
        activityData.sessionInfo = { referrer: req.headers.referer };
      }
    }
    await Activity.create(activityData);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

// Helper function to create and send JWT token
const createSendToken = (user, statusCode, res, message = "Success") => {
  const token = user.getSignedJwtToken();

  const cookieOptions = {
    expires: new Date(
      Date.now() + config.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
  };

  res.cookie("jwt", token, cookieOptions);

  // Remove password from output
  user.password = undefined;

  return ApiResponse.success(res, { user, token }, message, statusCode);
};

// Register new user
const register = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => error.msg);
    return next(new AppError(errorMessages.join(". "), 400));
  }

  const { username, email, password, firstName, lastName } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() },
      ],
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return next(
          new AppError("An account with this email already exists", 400),
        );
      }
      if (existingUser.username === username.toLowerCase()) {
        return next(new AppError("This username is already taken", 400));
      }
    }

    // Create user
    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      isEmailVerified: false, // User needs to verify email
    });

    // Generate email verification token
    const verificationToken = user.getEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Send verification email
    try {
      const verificationUrl = `${config.CLIENT_URL}/verify-email/${verificationToken}`;
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <tr>
                    <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Welcome to KR Updates!</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px; font-weight: 600;">Verify Your Email Address</h2>
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                        Hi ${firstName},
                      </p>
                      <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                        Thank you for registering! Please verify your email address by clicking the button below to complete your registration.
                      </p>
                      <table role="presentation" style="width: 100%; margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">Verify Email Address</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                        If the button doesn't work, copy and paste this link into your browser:
                      </p>
                      <p style="margin: 10px 0 0 0; color: #667eea; font-size: 14px; word-break: break-all;">
                        ${verificationUrl}
                      </p>
                      <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                        This link will expire in 24 hours. If you didn't create an account, please ignore this email.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 20px 30px; background-color: #f9f9f9; border-radius: 0 0 12px 12px; text-align: center;">
                      <p style="margin: 0; color: #999999; font-size: 12px;">
                        © ${new Date().getFullYear()} KR Updates. All rights reserved.
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

      await emailService.sendEmail({
        to: user.email,
        subject: "Verify Your Email Address - KR Updates",
        html: emailHtml,
      });

      console.log(`Verification email sent to ${user.email}`);
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      // Don't fail registration if email fails, but log it
    }

    // Log registration activity
    await logActivity(
      {
        user: user._id,
        type: "register",
        description: "User registered",
        details: `New user account created: ${firstName} ${lastName} (${username})`,
      },
      req,
    );

    // Return user without token - they need to verify email first
    user.password = undefined;
    return ApiResponse.success(
      res,
      {
        user,
        verificationTokenSent: true,
        message:
          "Account created! Please check your email to verify your account.",
      },
      "Account created successfully! Please check your email to verify your account.",
      201,
    );
  } catch (error) {
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const message =
        field === "email"
          ? "An account with this email already exists"
          : "This username is already taken";
      return next(new AppError(message, 400));
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return next(new AppError(messages.join(". "), 400));
    }

    // Handle other errors
    console.error("Registration error:", error);
    return next(new AppError("Registration failed. Please try again.", 500));
  }
});

// Login user
const login = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => error.msg);
    return next(new AppError(errorMessages.join(". "), 400));
  }

  const { username, password } = req.body;

  // Use the static method for authentication
  const { user, error } = await User.getAuthenticated(username, password);

  if (error) {
    return next(new AppError(error, 401));
  }

  // Log login activity
  await logActivity(
    {
      user: user._id,
      type: "login",
      description: "User logged in",
      details: `Login successful for ${user.firstName} ${user.lastName} (${user.username})`,
    },
    req,
  );

  createSendToken(user, 200, res, "Login successful");
});

// Logout user
const logout = (req, res) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  ApiResponse.success(res, null, "Logged out successfully");
};

// Placeholder for other auth methods
const refreshToken = catchAsync(async (req, res, next) => {
  // TODO: Implement refresh token logic
  return next(new AppError("Not implemented yet", 501));
});

const verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  if (!token) {
    return next(new AppError("Verification token is required", 400));
  }

  // Hash the token to compare with stored hash
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Find user with this token and check if it's not expired
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Invalid or expired verification token", 400));
  }

  // Verify the email
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  // Log verification activity
  await logActivity(
    {
      user: user._id,
      type: "register",
      description: "Email verified",
      details: `User ${user.firstName} ${user.lastName} verified their email`,
    },
    req,
  );

  // Generate token for automatic login after verification
  const authToken = user.getSignedJwtToken();
  user.password = undefined;

  // Redirect to frontend with token
  const redirectUrl = `${config.CLIENT_URL}/verify-email-success?token=${authToken}`;
  res.redirect(redirectUrl);
});

const resendVerification = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError("Email is required", 400));
  }

  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    // Don't reveal if user exists or not for security
    return ApiResponse.success(
      res,
      { message: "If the email exists, a verification link has been sent." },
      "If the email exists, a verification link has been sent.",
      200,
    );
  }

  // Check if already verified
  if (user.isEmailVerified) {
    return next(new AppError("Email is already verified", 400));
  }

  // Generate new verification token
  const verificationToken = user.getEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  // Send verification email
  try {
    const verificationUrl = `${config.CLIENT_URL}/verify-email/${verificationToken}`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Verify Your Email</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px; font-weight: 600;">Email Verification</h2>
                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                      Hi ${user.firstName},
                    </p>
                    <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                      You requested a new verification link. Please click the button below to verify your email address.
                    </p>
                    <table role="presentation" style="width: 100%; margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">Verify Email Address</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin: 10px 0 0 0; color: #667eea; font-size: 14px; word-break: break-all;">
                      ${verificationUrl}
                    </p>
                    <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                      This link will expire in 24 hours.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 30px; background-color: #f9f9f9; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="margin: 0; color: #999999; font-size: 12px;">
                      © ${new Date().getFullYear()} Newsfeed. All rights reserved.
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

    await emailService.sendEmail({
      to: user.email,
      subject: "Verify Your Email Address - Newsfeed",
      html: emailHtml,
    });

    console.log(`Verification email resent to ${user.email}`);
  } catch (emailError) {
    console.error("Error sending verification email:", emailError);
    return next(
      new AppError("Failed to send verification email. Please try again.", 500),
    );
  }

  return ApiResponse.success(
    res,
    { message: "Verification email sent successfully" },
    "Verification email sent successfully",
    200,
  );
});

const forgotPassword = catchAsync(async (req, res, next) => {
  // TODO: Implement forgot password logic
  return next(new AppError("Not implemented yet", 501));
});

const resetPassword = catchAsync(async (req, res, next) => {
  // TODO: Implement reset password logic
  return next(new AppError("Not implemented yet", 501));
});

const updatePassword = catchAsync(async (req, res, next) => {
  // TODO: Implement update password logic
  return next(new AppError("Not implemented yet", 501));
});

const getMe = catchAsync(async (req, res, next) => {
  ApiResponse.success(res, req.user, "User profile retrieved successfully");
});

const updateMe = catchAsync(async (req, res, next) => {
  // TODO: Implement update profile logic
  return next(new AppError("Not implemented yet", 501));
});

const deleteMe = catchAsync(async (req, res, next) => {
  // TODO: Implement account deletion logic
  return next(new AppError("Not implemented yet", 501));
});

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  updatePassword,
  getMe,
  updateMe,
  deleteMe,
};
