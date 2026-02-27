const SiteSettings = require("../models/SiteSettings");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");
const ApiResponse = require("../utils/apiResponse");
const Activity = require("../models/Activity");

const SOCIAL_PLATFORMS = ["youtube", "facebook", "instagram", "twitter", "linkedin"];

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

const normalizeSocialProfiles = (settings) => {
  const current = Array.isArray(settings.socialProfiles) ? settings.socialProfiles : [];
  const byPlatform = new Map(
    current
      .filter((p) => p && p.platform)
      .map((p) => [String(p.platform).toLowerCase(), p])
  );

  // If profiles already exist, just ensure all platforms are present.
  // If not, seed from socialLinks with sensible defaults.
  const hadProfiles = current.length > 0;

  const next = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const existing = byPlatform.get(platform);
    const linkUrl =
      (settings.socialLinks && settings.socialLinks[platform]) || "";

    if (existing) {
      next.push({
        platform,
        url: existing.url ?? linkUrl ?? "",
        enabled: typeof existing.enabled === "boolean" ? existing.enabled : !!(existing.url || linkUrl),
        placements: Array.isArray(existing.placements) ? existing.placements : [],
      });
      continue;
    }

    const seededUrl = linkUrl || "";
    next.push({
      platform,
      url: seededUrl,
      enabled: !!seededUrl,
      placements:
        !hadProfiles && (platform === "youtube" || platform === "facebook") && seededUrl
          ? ["dashboard_follow"]
          : [],
    });
  }

  // Detect changes (very lightweight compare)
  const normalize = (arr) =>
    JSON.stringify(
      (arr || []).map((p) => ({
        platform: p.platform,
        url: p.url || "",
        enabled: !!p.enabled,
        placements: Array.isArray(p.placements) ? p.placements.slice().sort() : [],
      }))
    );

  const changed = normalize(current) !== normalize(next);
  if (changed) {
    settings.socialProfiles = next;
  }
  return changed;
};

const syncSocialLinksFromProfiles = (settings) => {
  if (!Array.isArray(settings.socialProfiles)) return;
  if (!settings.socialLinks) settings.socialLinks = {};

  for (const p of settings.socialProfiles) {
    if (!p || !p.platform) continue;
    const platform = String(p.platform).toLowerCase();
    if (!SOCIAL_PLATFORMS.includes(platform)) continue;
    if (p.url !== undefined) {
      settings.socialLinks[platform] = p.url || "";
    }
  }
};

// Get site settings
const getSettings = catchAsync(async (req, res, next) => {
  const settings = await SiteSettings.getSettings();

  // Backfill rich social profiles from legacy socialLinks (and ensure all platforms exist)
  const changed = normalizeSocialProfiles(settings);
  if (changed) {
    syncSocialLinksFromProfiles(settings);
    await settings.save();
  }

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
    socialProfiles,
    seo,
    maintenanceMode,
    maintenanceMessage,
    theme,
    typography,
    colorPalette,
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

  // Rich social profiles (enabled + placements)
  if (socialProfiles !== undefined) {
    if (!Array.isArray(socialProfiles)) {
      return next(new AppError("socialProfiles must be an array", 400));
    }

    settings.socialProfiles = socialProfiles
      .filter((p) => p && p.platform)
      .map((p) => ({
        platform: String(p.platform).toLowerCase(),
        url: p.url || "",
        enabled: !!p.enabled,
        placements: Array.isArray(p.placements) ? p.placements : [],
      }));

    // Keep legacy socialLinks in sync
    syncSocialLinksFromProfiles(settings);
  } else if (socialLinks !== undefined) {
    // Ensure socialProfiles exists and reflect URL updates without overriding enabled/placements
    const changed = normalizeSocialProfiles(settings);
    if (changed) {
      syncSocialLinksFromProfiles(settings);
    }
  }

  if (seo !== undefined) {
    if (!settings.seo) settings.seo = {};
    if (seo.metaTitle !== undefined) settings.seo.metaTitle = seo.metaTitle;
    if (seo.metaDescription !== undefined)
      settings.seo.metaDescription = seo.metaDescription;
    if (seo.metaKeywords !== undefined)
      settings.seo.metaKeywords = Array.isArray(seo.metaKeywords) ? seo.metaKeywords : [];
  }
  if (maintenanceMode !== undefined)
    settings.maintenanceMode = maintenanceMode;
  if (maintenanceMessage !== undefined)
    settings.maintenanceMessage = maintenanceMessage;
  if (theme !== undefined) {
    if (!["light", "dark", "system"].includes(theme)) {
      return next(new AppError("theme must be light, dark, or system", 400));
    }
    settings.theme = theme;
  }
  if (typography !== undefined) {
    if (!settings.typography) settings.typography = {};
    if (typography.fontFamily !== undefined)
      settings.typography.fontFamily = typography.fontFamily;
    if (typography.headingFontFamily !== undefined)
      settings.typography.headingFontFamily = typography.headingFontFamily;
    if (typography.baseFontSize !== undefined)
      settings.typography.baseFontSize = typography.baseFontSize;
  }
  if (colorPalette !== undefined) {
    if (!settings.colorPalette) settings.colorPalette = {};
    if (colorPalette.primaryColor !== undefined)
      settings.colorPalette.primaryColor = colorPalette.primaryColor;
    if (colorPalette.accentColor !== undefined)
      settings.colorPalette.accentColor = colorPalette.accentColor;
  }

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

