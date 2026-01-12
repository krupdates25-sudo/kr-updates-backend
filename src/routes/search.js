const express = require("express");
const {
  globalSearch,
  searchPosts,
  searchUsers,
  searchAnnouncements,
  searchCategories,
  getSuggestions,
  getTrendingSearches,
} = require("../controllers/searchController");
const { optionalAuth } = require("../middleware/auth");

const router = express.Router();

// Search should work without authentication (optional auth for personalization/admin)
router.use(optionalAuth);

// Global search
router.get("/global", globalSearch);

// Specific search routes
router.get("/posts", searchPosts);
router.get("/users", searchUsers);
router.get("/announcements", searchAnnouncements);
router.get("/categories", searchCategories);

// Search suggestions and trending
router.get("/suggestions", getSuggestions);
router.get("/trending", getTrendingSearches);

module.exports = router;
