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
const { protect } = require("../middleware/auth");

const router = express.Router();

// All search routes require authentication
router.use(protect);

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
