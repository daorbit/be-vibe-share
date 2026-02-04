const express = require('express');
const router = express.Router();
const {
  getSuggestedUsers,
  getTrendingPlaylists,
  getPlaylistsByTag
} = require('../controllers/discoverController');
const { authenticate } = require('../middleware/auth');

// Routes
router.get('/users', authenticate, getSuggestedUsers);
router.get('/playlists', getTrendingPlaylists);
router.get('/tags/:tag', getPlaylistsByTag);

module.exports = router;