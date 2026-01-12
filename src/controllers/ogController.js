const Post = require("../models/Post");
const catchAsync = require("../utils/catchAsync");
const { AppError } = require("../utils/appError");

// Detect if request is from a bot/crawler
const isBot = (userAgent) => {
  if (!userAgent) return false;
  const botPatterns = [
    /facebookexternalhit/i,
    /Facebot/i,
    /Twitterbot/i,
    /LinkedInBot/i,
    /WhatsApp/i,
    /Googlebot/i,
    /bingbot/i,
    /Slackbot/i,
    /Applebot/i,
    /Discordbot/i,
    /TelegramBot/i,
    /SkypeUriPreview/i,
    /Slurp/i,
    /DuckDuckBot/i,
    /Baiduspider/i,
    /YandexBot/i,
    /Sogou/i,
    /Exabot/i,
    /ia_archiver/i,
  ];
  return botPatterns.some((pattern) => pattern.test(userAgent));
};

// Generate Open Graph HTML
const generateOGHTML = (post, baseUrl) => {
  // Get image URL and ensure it's absolute
  let imageUrl =
    post.featuredImage?.url ||
    post.featuredVideo?.thumbnail ||
    post.featuredVideo?.url ||
    `${baseUrl}/favicon.png`;
  
  // Ensure image URL is absolute (Cloudinary URLs should already be absolute)
  if (imageUrl && imageUrl.startsWith("data:")) {
    imageUrl = `${baseUrl}/favicon.png`;
  }
  if (imageUrl && !imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    // If relative, make it absolute to this host
    if (imageUrl.startsWith("/")) {
      imageUrl = `${baseUrl}${imageUrl}`;
    } else {
      imageUrl = `${baseUrl}/${imageUrl}`;
    }
  }
  
  const title = `${post.title} - KR Updates`;
  const description = post.excerpt || post.description || post.title;
  // Use current host for sharing URL (works behind proxies via passed baseUrl)
  const url = `${baseUrl}/post/${post.slug || post._id}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary Meta Tags -->
  <title>${escapeHtml(title)}</title>
  <meta name="title" content="${escapeHtml(title)}">
  <meta name="description" content="${escapeHtml(description)}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(post.title)}">` : ''}
  <meta property="og:site_name" content="KR Updates">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${escapeHtml(url)}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  
  <!-- Additional Meta Tags -->
  <meta name="author" content="KR Updates">
  <meta name="robots" content="index, follow">
  
  <!-- Redirect to actual page for non-bots -->
  <script>
    if (!navigator.userAgent.match(/facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Googlebot|bingbot|Slackbot|Applebot|Discordbot|TelegramBot|SkypeUriPreview|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|ia_archiver/i)) {
      window.location.href = "${escapeHtml(url)}";
    }
  </script>
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { margin-top: 0; color: #333; }
    p { color: #666; line-height: 1.6; }
    img { max-width: 100%; height: auto; border-radius: 4px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(post.title)}</h1>
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(post.title)}">` : ''}
    <p>${escapeHtml(description)}</p>
    <p><strong>Source:</strong> KR Updates</p>
    <p><a href="${escapeHtml(url)}">Read full article →</a></p>
  </div>
</body>
</html>`;
};

// Escape HTML to prevent XSS
const escapeHtml = (text) => {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

// Get Open Graph HTML for a post
const getPostOG = catchAsync(async (req, res, next) => {
  const { slug } = req.params;
  const userAgent = req.headers["user-agent"] || "";
  // Build public base URL (works behind proxies like ngrok)
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const baseUrl = `${protocol}://${host}`;

  // Find the post
  const post = await Post.findOne({
    $or: [{ slug }, { _id: slug }],
    status: "published",
    isActive: true,
  }).populate("author", "username firstName lastName profileImage");

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Always serve OG HTML for the /og/:slug endpoint
  // This endpoint is specifically for bots/crawlers
  const html = generateOGHTML(post, baseUrl);
  res.setHeader("Content-Type", "text/html");
  // Avoid stale previews in social crawlers
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  return res.send(html);
});

module.exports = {
  getPostOG,
  isBot,
};

