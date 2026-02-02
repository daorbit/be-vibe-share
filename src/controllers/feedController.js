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

    // Use aggregation for better performance
    const playlists = await Playlist.aggregate([
      { $match: { isPublic: true } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'songs',
          localField: '_id',
          foreignField: 'playlistId',
          as: 'songsData'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userData'
        }
      },
      {
        $addFields: {
          songCount: { $size: '$songsData' },
          user: { $arrayElemAt: ['$userData', 0] }
        }
      },
      {
        $project: {
          songsData: 0,
          userData: 0,
          'user.passwordHash': 0
        }
      }
    ]);

    const total = await Playlist.countDocuments({ isPublic: true });

    // Batch check likes and saves
    let playlistsWithDetails = playlists;
    
    if (userId && playlists.length > 0) {
      const playlistIds = playlists.map(p => p._id);
      
      const [likes, saves] = await Promise.all([
        PlaylistLike.find({ userId, playlistId: { $in: playlistIds } }).lean(),
        SavedPlaylist.find({ userId, playlistId: { $in: playlistIds } }).lean()
      ]);
      
      const likedSet = new Set(likes.map(l => l.playlistId.toString()));
      const savedSet = new Set(saves.map(s => s.playlistId.toString()));
      
      playlistsWithDetails = playlists.map(playlist => ({
        ...playlist,
        username: playlist.user?.username,
        userAvatar: playlist.user?.avatarUrl,
        isLiked: likedSet.has(playlist._id.toString()),
        isSaved: savedSet.has(playlist._id.toString())
      }));
    } else {
      playlistsWithDetails = playlists.map(playlist => ({
        ...playlist,
        username: playlist.user?.username,
        userAvatar: playlist.user?.avatarUrl,
        isLiked: false,
        isSaved: false
      }));
    }

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