const Playlist = require('../models/Playlist');
const User = require('../models/User');
const UserFollow = require('../models/UserFollow');
const Song = require('../models/Song');
const PlaylistLike = require('../models/PlaylistLike');
const SavedPlaylist = require('../models/SavedPlaylist');
const mongoose = require('mongoose');

// Get feed (shows all public playlists like Instagram feed)
const getFeed = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user?._id;

    // Ensure database connection for serverless
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    // Always show all public playlists, sorted by creation date (newest first)
    const playlists = await Playlist.find({ isPublic: true })
      .populate('userId', 'username avatarUrl')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Playlist.countDocuments({ isPublic: true });

    // Add song count and user interaction status to each playlist
    const playlistsWithDetails = await Promise.all(
      playlists.map(async (playlist) => {
        const songCount = await Song.countDocuments({ playlistId: playlist._id });
        
        let isLiked = false;
        let isSaved = false;
        
        if (userId) {
          // Check if user has liked this playlist
          const like = await PlaylistLike.findOne({ 
            userId: userId, 
            playlistId: playlist._id 
          });
          isLiked = !!like;
          
          // Check if user has saved this playlist
          const saved = await SavedPlaylist.findOne({ 
            userId: userId, 
            playlistId: playlist._id 
          });
          isSaved = !!saved;
        }
        
        return {
          ...playlist.toObject(),
          username: playlist.userId.username,          userAvatar: playlist.userId.avatarUrl,
          songCount,
          isLiked,
          isSaved
        };
      })
    );

    res.json({
      success: true,
      data: {
        playlists: playlistsWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
};

module.exports = {
  getFeed
};