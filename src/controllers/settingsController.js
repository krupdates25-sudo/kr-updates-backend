const SiteSettings = require("../models/SiteSettings");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const ApiResponse = require("../utils/apiResponse");
const Activity = require("../models/Activity");

// Helper function to extract browser info
const extractBrowserInfo = (userAgent) => {
  if (!userAgent) return { browser: "Unknown", os: "Unknown" };
  // Simple browser detection
  if (userAgent.includes("Chrome")) return { browser: "Chrome", os: "Unknown" };
  if (userAgent.includes("Firefox"))
    return { browser: "Firefox", os: "Unknown" };
  if (userAgent.includes("Safari")) return { browser: "Safari", os: "Unknown" };
  if (userAgent.includes("Edge")) return { browser: "Edge", os: "Unknown" };
  return { browser: "Unknown", os: "Unknown" };
};

// Helper function to get network info
const getNetworkInfo = (req) => {
  return {
    ip: req.ip || req.connection.remoteAddress || "Unknown",
    country: "Unknown",
    city: "Unknown",
    isp: "Unknown",
  };
};

// Get site settings
const getSettings = catchAsync(async (req, res, next) => {
  const settings = await SiteSettings.getSettings();
  ApiResponse.success(res, settings, "Site settings retrieved successfully");
});

// Update site settings (Admin only)
const updateSettings = catchAsync(async (req, res, next) => {
  const {
    siteName,
    siteDescription,
    siteLogo,
    siteFavicon,
    contactEmail,
    contactPhone,
    address,
    socialLinks,
    seo,
    maintenanceMode,
    maintenanceMessage,
  } = req.body;

  // Get or create settings
  let settings = await SiteSettings.findOne();
  if (!settings) {
    settings = await SiteSettings.create({});
  }

  // Update fields
  if (siteName !== undefined) settings.siteName = siteName;
  if (siteDescription !== undefined)
    settings.siteDescription = siteDescription;
  if (siteLogo !== undefined) settings.siteLogo = siteLogo;
  if (siteFavicon !== undefined) settings.siteFavicon = siteFavicon;
  if (contactEmail !== undefined) settings.contactEmail = contactEmail;
  if (contactPhone !== undefined) settings.contactPhone = contactPhone;
  if (address !== undefined) settings.address = address;
  if (socialLinks !== undefined) {
    if (socialLinks.facebook !== undefined)
      settings.socialLinks.facebook = socialLinks.facebook;
    if (socialLinks.twitter !== undefined)
      settings.socialLinks.twitter = socialLinks.twitter;
    if (socialLinks.instagram !== undefined)
      settings.socialLinks.instagram = socialLinks.instagram;
    if (socialLinks.linkedin !== undefined)
      settings.socialLinks.linkedin = socialLinks.linkedin;
    if (socialLinks.youtube !== undefined)
      settings.socialLinks.youtube = socialLinks.youtube;
  }
  if (seo !== undefined) {
    if (seo.metaTitle !== undefined) settings.seo.metaTitle = seo.metaTitle;
    if (seo.metaDescription !== undefined)
      settings.seo.metaDescription = seo.metaDescription;
    if (seo.metaKeywords !== undefined)
      settings.seo.metaKeywords = seo.metaKeywords;
  }
  if (maintenanceMode !== undefined)
    settings.maintenanceMode = maintenanceMode;
  if (maintenanceMessage !== undefined)
    settings.maintenanceMessage = maintenanceMessage;

  // Set last updated by
  settings.lastUpdatedBy = req.user._id;

  // Save settings
  await settings.save();

  // Log the action
  await Activity.create({
    user: req.user._id,
    type: "settings_updated",
    description: "Admin updated site settings",
    details: `Site settings updated by ${req.user.firstName} ${req.user.lastName}`,
    browserInfo: extractBrowserInfo(req.headers["user-agent"]),
    networkInfo: getNetworkInfo(req),
  });

  ApiResponse.success(res, settings, "Site settings updated successfully");
});

module.exports = {
  getSettings,
  updateSettings,
};

