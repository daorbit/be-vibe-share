const express = require('express');
const router = express.Router();
const {
  universalSearch,
  searchUsers,
  searchPlaylists,
  searchTags,
  getSearchSuggestions,
  getTrendingSearches,
  getRecentSearches,
  clearRecentSearches,
  removeRecentSearch
} = require('../controllers/searchController');
const authenticate = require('../middleware/auth');

// Universal search
router.get('/', universalSearch);

// Specific searches
router.get('/users', searchUsers);
router.get('/playlists', searchPlaylists);
router.get('/tags', searchTags);

// Suggestions and trending
router.get('/suggestions', getSearchSuggestions);
router.get('/trending', getTrendingSearches);

// Recent searches (auth required)
router.get('/recent', authenticate, getRecentSearches);
router.delete('/recent', authenticate, clearRecentSearches);
router.delete('/recent/:id', authenticate, removeRecentSearch);

module.exports = router;