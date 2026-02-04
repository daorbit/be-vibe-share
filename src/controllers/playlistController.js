const Playlist = require('../models/Playlist');
const Song = require('../models/Song');
const PlaylistLike = require('../models/PlaylistLike');
const SavedPlaylist = require('../models/SavedPlaylist');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const Joi = require('joi');
const mongoose = require('mongoose');
const { createNotification } = require('./notificationController');

// Validation schemas
const createPlaylistSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow(''),
  tags: Joi.array().items(Joi.string()).max(5),
  coverGradient: Joi.string().max(100),
  isPublic: Joi.boolean().default(true)
});

const updatePlaylistSchema = Joi.object({
  title: Joi.string().min(1).max(255),
  description: Joi.string().allow(''),
  tags: Joi.array().items(Joi.string()).max(5),
  coverGradient: Joi.string().max(100),
  isPublic: Joi.boolean()
});

const addSongSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  artist: Joi.string().min(1).max(255).required(),
  url: Joi.string().uri().required(),
  platform: Joi.string().min(1).max(50).required()
});

// Get playlists with filters
const getPlaylists = async (req, res) => {
  try {
    const { page = 1, limit = 20, user, tag, sort = 'recent' } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    // If a specific user is requested
    if (user) {
      // Convert user ID string to ObjectId for MongoDB query
      query.userId = mongoose.Types.ObjectId.isValid(user) 
        ? new mongoose.Types.ObjectId(user) 
        : user;
      
      // If the requesting user is the same as the user whose playlists are being fetched,
      // show all playlists (public and private). Otherwise, only show public playlists.
      if (!req.user || req.user._id.toString() !== user) {
        query.isPublic = true;
      }
    } else {
      // If no specific user, only show public playlists
      query.isPublic = true;
    }

    if (tag) {
      query.tags = { $in: [tag] };
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'popular') {
      sortOption = { likesCount: -1, createdAt: -1 };
    }

    // Use aggregation to get playlists with song count in one query
    const playlists = await Playlist.aggregate([
      { $match: query },
      { $sort: sortOption },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'songs',
          localField: '_id',
          foreignField: 'playlistId',
          as: 'songs'
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
          songCount: { $size: '$songs' },
          user: { $arrayElemAt: ['$userData', 0] }
        }
      },
      {
        $project: {
          userData: 0,
          'user.passwordHash': 0
        }
      }
    ]);

    const total = await Playlist.countDocuments(query);

    // Batch check likes and saves if user is logged in
    let playlistsWithDetails = playlists;
    
    if (req.user?._id && playlists.length > 0) {
      const playlistIds = playlists.map(p => p._id);
      
      // Batch fetch all likes and saves in parallel
      const [likes, saves] = await Promise.all([
        PlaylistLike.find({ 
          userId: req.user._id, 
          playlistId: { $in: playlistIds }
        }).lean(),
        SavedPlaylist.find({ 
          userId: req.user._id, 
          playlistId: { $in: playlistIds }
        }).lean()
      ]);
      
      const likedSet = new Set(likes.map(l => l.playlistId.toString()));
      const savedSet = new Set(saves.map(s => s.playlistId.toString()));
      
      playlistsWithDetails = playlists.map(playlist => ({
        _id: playlist._id,
        title: playlist.title,
        description: playlist.description,
        coverGradient: playlist.coverGradient,
        thumbnailUrl: playlist.thumbnailUrl,
        songs: playlist.songs || [],
        tags: playlist.tags,
        likesCount: playlist.likesCount,
        songCount: playlist.songCount,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        isPublic: playlist.isPublic,
        username: playlist.user?.username,
        userAvatar: playlist.user?.avatarUrl,
        userId: playlist.userId,
        isLiked: likedSet.has(playlist._id.toString()),
        isSaved: savedSet.has(playlist._id.toString())
      }));
    } else {
      playlistsWithDetails = playlists.map(playlist => ({
        _id: playlist._id,
        title: playlist.title,
        description: playlist.description,
        coverGradient: playlist.coverGradient,
        thumbnailUrl: playlist.thumbnailUrl,
        songs: playlist.songs || [],
        tags: playlist.tags,
        likesCount: playlist.likesCount,
        songCount: playlist.songCount,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        isPublic: playlist.isPublic,
        username: playlist.user?.username,
        userAvatar: playlist.user?.avatarUrl,
        userId: playlist.userId,
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
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Failed to get playlists' });
  }
};
  
// Create playlist
const createPlaylist = async (req, res) => {
  try {
    const { title, description, tags, coverGradient, isPublic } = req.body;
    const userId = req.user._id;

    const playlist = new Playlist({
      userId,
      title,
      description,
      tags: tags || [],
      coverGradient,
      isPublic: isPublic !== undefined ? isPublic : true
    });

    await playlist.save();

    // Update user's playlist count
    await User.findByIdAndUpdate(userId, { $inc: { playlistCount: 1 } });

    // Populate user info
    await playlist.populate('userId', 'username avatarUrl');

    console.log('[PLAYLIST_CREATED]', { playlistId: playlist._id, userId, timestamp: new Date() });

    res.status(201).json({
      success: true,
      data: { playlist }
    });
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
};

// Get playlist details with songs
const getPlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const playlist = await Playlist.findById(id).populate('userId', 'username avatarUrl');

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check if private and not owner
    // Note: isPublic defaults to true, so only block if explicitly set to false
    if (playlist.isPublic === false && (!req.user || req.user._id.toString() !== playlist.userId._id.toString())) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const songs = await Song.find({ playlistId: id }).sort({ position: 1 });

    // Check if user liked/saved this playlist
    let isLiked = false;
    let isSaved = false;
    if (req.user) {
      const [like, saved] = await Promise.all([
        PlaylistLike.findOne({ userId: req.user._id, playlistId: id }),
        SavedPlaylist.findOne({ userId: req.user._id, playlistId: id })
      ]);
      isLiked = !!like;
      isSaved = !!saved;
    }

    res.json({
      success: true,
      data: {
        playlist: {
          _id: playlist._id,
          title: playlist.title,
          description: playlist.description,
          coverGradient: playlist.coverGradient,
          thumbnailUrl: playlist.thumbnailUrl,
          tags: playlist.tags,
          likesCount: playlist.likesCount,
          isPublic: playlist.isPublic,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
          user: {
            _id: playlist.userId._id,
            username: playlist.userId.username,
            avatarUrl: playlist.userId.avatarUrl
          },
          songs,
          isLiked,
          isSaved
        }
      }
    });
  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({ error: 'Failed to get playlist' });
  }
};

// Update playlist
const updatePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check ownership
    if (playlist.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only update your own playlists' });
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('userId', 'username avatarUrl');

    res.json({
      success: true,
      data: { playlist: updatedPlaylist }
    });
  } catch (error) {
    console.error('Update playlist error:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
};

// Remove playlist thumbnail
const removePlaylistThumbnail = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if playlist exists and user owns it
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (playlist.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only remove thumbnail from your own playlist' });
    }

    // Delete thumbnail from Cloudinary if it exists
    if (playlist.thumbnailUrl && playlist.thumbnailUrl.includes('cloudinary.com')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = playlist.thumbnailUrl.split('/');
        const publicIdWithExtension = urlParts[urlParts.length - 1];
        const publicId = `playlist-thumbnails/${publicIdWithExtension.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Error deleting thumbnail from Cloudinary:', cloudinaryError);
        // Don't fail the entire operation if Cloudinary deletion fails
      }
    }

    // Update playlist's thumbnailUrl to null
    const updatedPlaylist = await Playlist.findByIdAndUpdate(
      id,
      { thumbnailUrl: null },
      { new: true, runValidators: true }
    ).populate('userId', 'username avatarUrl');

    if (!updatedPlaylist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    res.json({
      success: true,
      data: {
        playlist: updatedPlaylist
      }
    });
  } catch (error) {
    console.error('Remove playlist thumbnail error:', error);
    res.status(500).json({ error: 'Failed to remove playlist thumbnail' });
  }
};

// Delete playlist
const deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check ownership
    if (playlist.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only delete your own playlists' });
    }

    // Delete thumbnail from Cloudinary if it exists
    if (playlist.thumbnailUrl && playlist.thumbnailUrl.includes('cloudinary.com')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = playlist.thumbnailUrl.split('/');
        const publicIdWithExtension = urlParts[urlParts.length - 1];
        const publicId = `playlist-thumbnails/${publicIdWithExtension.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Error deleting thumbnail from Cloudinary:', cloudinaryError);
        // Don't fail the entire operation if Cloudinary deletion fails
      }
    }

    // Delete playlist and related data
    await Promise.all([
      Playlist.findByIdAndDelete(id),
      Song.deleteMany({ playlistId: id }),
      PlaylistLike.deleteMany({ playlistId: id }),
      SavedPlaylist.deleteMany({ playlistId: id })
    ]);

    // Update user's playlist count
    await User.findByIdAndUpdate(playlist.userId, { $inc: { playlistCount: -1 } });

    res.json({
      success: true,
      message: 'Playlist deleted successfully'
    });
  } catch (error) {
    console.error('Delete playlist error:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
};

// Like playlist
const likePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Check if playlist exists
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check if already liked
    const existingLike = await PlaylistLike.findOne({ userId, playlistId: id });
    if (existingLike) {
      return res.status(409).json({ error: 'Already liked this playlist' });
    }

    // Create like
    const like = new PlaylistLike({ userId, playlistId: id });
    await like.save();

    // Update playlist likes count
    const updatedPlaylist = await Playlist.findByIdAndUpdate(
      id,
      { $inc: { likesCount: 1 } },
      { new: true }
    );

    // Create notification for playlist owner
    await createNotification({
      userId: playlist.userId,
      type: 'playlist_like',
      actorId: userId,
      playlistId: id
    });

    console.log('[PLAYLIST_LIKED]', { playlistId: id, userId, timestamp: new Date() });

    res.json({
      success: true,
      message: 'Playlist liked successfully',
      data: {
        likesCount: updatedPlaylist.likesCount
      }
    });
  } catch (error) {
    console.error('Like playlist error:', error);
    res.status(500).json({ error: 'Failed to like playlist' });
  }
};

// Unlike playlist
const unlikePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const like = await PlaylistLike.findOneAndDelete({ userId, playlistId: id });
    if (!like) {
      return res.status(404).json({ error: 'Like not found' });
    }

    // Delete the notification when unliking
    const Notification = require('../models/Notification');
    await Notification.findOneAndDelete({
      type: 'playlist_like',
      actorId: userId,
      playlistId: id
    }).catch(err => console.error('Delete notification error:', err));

    // Update playlist likes count
    const updatedPlaylist = await Playlist.findByIdAndUpdate(
      id,
      { $inc: { likesCount: -1 } },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Playlist unliked successfully',
      data: {
        likesCount: updatedPlaylist.likesCount
      }
    });
  } catch (error) {
    console.error('Unlike playlist error:', error);
    res.status(500).json({ error: 'Failed to unlike playlist' });
  }
};

// Save playlist
const savePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Check if playlist exists
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check if already saved
    const existingSave = await SavedPlaylist.findOne({ userId, playlistId: id });
    if (existingSave) {
      return res.status(409).json({ error: 'Already saved this playlist' });
    }

    // Create save
    const save = new SavedPlaylist({ userId, playlistId: id });
    await save.save();

    // Create notification for playlist owner
    await createNotification({
      userId: playlist.userId,
      type: 'playlist_save',
      actorId: userId,
      playlistId: id
    });

    res.json({
      success: true,
      message: 'Playlist saved successfully'
    });
  } catch (error) {
    console.error('Save playlist error:', error);
    res.status(500).json({ error: 'Failed to save playlist' });
  }
};

// Unsave playlist
const unsavePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const save = await SavedPlaylist.findOneAndDelete({ userId, playlistId: id });
    if (!save) {
      return res.status(404).json({ error: 'Save not found' });
    }

    res.json({
      success: true,
      message: 'Playlist unsaved successfully'
    });
  } catch (error) {
    console.error('Unsave playlist error:', error);
    res.status(500).json({ error: 'Failed to unsave playlist' });
  }
};

// Get user's saved playlists
const getSavedPlaylists = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const savedPlaylists = await SavedPlaylist.find({ userId: req.user._id })
      .populate({
        path: 'playlistId',
        populate: { path: 'userId', select: 'username avatarUrl' }
      })
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await SavedPlaylist.countDocuments({ userId: req.user._id });

    // Filter out null playlists (in case some were deleted) and add song count
    const validPlaylists = await Promise.all(
      savedPlaylists
        .filter(saved => saved.playlistId)
        .map(async (saved) => {
          const songCount = await Song.countDocuments({ playlistId: saved.playlistId._id });
          
          // Check if user has liked this playlist
          const like = await PlaylistLike.findOne({ 
            userId: req.user._id, 
            playlistId: saved.playlistId._id 
          });
          const isLiked = !!like;
          
          return {
            ...saved.playlistId.toObject(),
            songCount: songCount,
            isSaved: true,
            isLiked
          };
        })
    );

    res.json({
      success: true,
      data: {
        playlists: validPlaylists,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get saved playlists error:', error);
    res.status(500).json({ error: 'Failed to get saved playlists' });
  }
};

// Upload playlist thumbnail
const uploadPlaylistThumbnail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if playlist exists and user owns it
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (playlist.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only upload thumbnail to your own playlist' });
    }

    // Upload to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream({
      folder: 'playlist-thumbnails',
      width: 800,
      height: 800,
      crop: 'fill'
    }, async (error, result) => {
      if (error) {
        console.error('Cloudinary upload error:', error);
        return res.status(500).json({ error: 'Failed to upload image' });
      }

      try {
        // Update playlist's thumbnailUrl
        const updatedPlaylist = await Playlist.findByIdAndUpdate(
          id,
          { thumbnailUrl: result.secure_url },
          { new: true, runValidators: true }
        ).populate('userId', 'username avatarUrl');

        if (!updatedPlaylist) {
          return res.status(404).json({ error: 'Playlist not found' });
        }

        res.json({
          success: true,
          data: {
            playlist: updatedPlaylist,
            imageUrl: result.secure_url
          }
        });
      } catch (dbError) {
        console.error('Database update error:', dbError);
        res.status(500).json({ error: 'Failed to update playlist' });
      }
    });

    // Pipe the buffer to Cloudinary
    const bufferStream = require('stream').Readable.from(req.file.buffer);
    bufferStream.pipe(uploadStream);
  } catch (error) {
    console.error('Upload playlist thumbnail error:', error);
    res.status(500).json({ error: 'Failed to upload playlist thumbnail' });
  }
};

module.exports = {
  getPlaylists,
  createPlaylist,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  likePlaylist,
  unlikePlaylist,
  savePlaylist,
  unsavePlaylist,
  getSavedPlaylists,
  uploadPlaylistThumbnail,
  removePlaylistThumbnail,
  createPlaylistSchema,
  updatePlaylistSchema,
  addSongSchema
};