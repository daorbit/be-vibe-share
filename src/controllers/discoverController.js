const User = require('../models/User');
const Playlist = require('../models/Playlist');
const UserFollow = require('../models/UserFollow');
const Song = require('../models/Song');
const PlaylistLike = require('../models/PlaylistLike');
const SavedPlaylist = require('../models/SavedPlaylist');

// Get suggested users to follow
const getSuggestedUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Get users that current user already follows
    const following = await UserFollow.find({ followerId: req.user._id });
    const followingIds = following.map(f => f.followingId);
    followingIds.push(req.user._id); // Exclude self

    // Get users not followed, sorted by follower count
    const users = await User.find({
      _id: { $nin: followingIds }
    })
    .select('-passwordHash')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ followersCount: -1, createdAt: -1 });

    const total = await User.countDocuments({
      _id: { $nin: followingIds }
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get suggested users error:', error);
    res.status(500).json({ error: 'Failed to get suggested users' });
  }
};

// Get trending playlists
const getTrendingPlaylists = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user?._id;

    // Use aggregation for better performance
    const playlists = await Playlist.aggregate([
      { $match: { isPublic: true } },
      { $sort: { likesCount: -1, createdAt: -1 } },
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
    console.error('Get trending playlists error:', error);
    res.status(500).json({ error: 'Failed to get trending playlists' });
  }
};

// Get playlists by tag
const getPlaylistsByTag = async (req, res) => {
  try {
    const { tag } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const playlists = await Playlist.find({
      isPublic: true,
      tags: { $in: [tag] }
    })
    .populate('userId', 'username avatarUrl')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ likesCount: -1, createdAt: -1 });

    const total = await Playlist.countDocuments({
      isPublic: true,
      tags: { $in: [tag] }
    });

    // Add song count to each playlist
    const playlistsWithSongCount = await Promise.all(
      playlists.map(async (playlist) => {
        const songCount = await Song.countDocuments({ playlistId: playlist._id });
        return {
          ...playlist.toObject(),
          username: playlist.userId.username,          userAvatar: playlist.userId.avatarUrl,
          songCount
        };
      })
    );

    res.json({
      success: true,
      data: {
        playlists: playlistsWithSongCount,
        tag,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get playlists by tag error:', error);
    res.status(500).json({ error: 'Failed to get playlists by tag' });
  }
};

module.exports = {
  getSuggestedUsers,
  getTrendingPlaylists,
  getPlaylistsByTag
};