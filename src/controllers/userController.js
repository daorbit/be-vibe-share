const User = require('../models/User');
const Playlist = require('../models/Playlist');
const UserFollow = require('../models/UserFollow');
const PlaylistLike = require('../models/PlaylistLike');
const SavedPlaylist = require('../models/SavedPlaylist');
const Song = require('../models/Song');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');

// Get users with pagination
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { bio: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(query)
      .select('-passwordHash')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

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
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// Get user by username
const getUserByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // NOTE: Follow/following features are not needed in v1
    // Check if current user is following this user
    // let isFollowing = false;
    // if (req.user) {
    //   const follow = await UserFollow.findOne({
    //     followerId: req.user._id,
    //     followingId: user._id
    //   });
    //   isFollowing = !!follow;
    // }

    res.json({
      success: true,
      data: {
        user: {
          ...user.toObject(),
          // NOTE: Follow/following features are not needed in v1
          // isFollowing
        }
      }
    });
  } catch (error) {
    console.error('Get user by username error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // NOTE: Follow/following features are not needed in v1
    // Check if current user is following this user
    // let isFollowing = false;
    // if (req.user) {
    //   const follow = await UserFollow.findOne({
    //     followerId: req.user._id,
    //     followingId: user._id
    //   });
    //   isFollowing = !!follow;
    // }

    res.json({
      success: true,
      data: {
        user: {
          ...user.toObject(),
          // NOTE: Follow/following features are not needed in v1
          // isFollowing
        }
      }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Update user profile
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { bio, avatarUrl, username, socialLinks } = req.body;

    // Check if user is updating their own profile
    if (req.user._id.toString() !== id) {
      return res.status(403).json({ error: 'Can only update your own profile' });
    }

    // Validate avatarUrl: only allow Cloudinary URLs
    if (avatarUrl) {
      const isValidFormat = avatarUrl.startsWith('https://res.cloudinary.com/');
      if (!isValidFormat) {
        return res.status(400).json({ error: 'Invalid avatar format - only uploaded images are allowed' });
      }
    }

    // Validate social links
    if (socialLinks) {
      const urlRegex = /^https?:\/\/.+/;
      const allowedPlatforms = ['instagram', 'twitter', 'youtube', 'spotify', 'website'];
      
      for (const [platform, url] of Object.entries(socialLinks)) {
        if (!allowedPlatforms.includes(platform)) {
          return res.status(400).json({ error: `Invalid social platform: ${platform}` });
        }
        if (url && !urlRegex.test(url)) {
          return res.status(400).json({ error: `Invalid URL format for ${platform}` });
        }
      }
    }

    // If username is being updated, ensure uniqueness and basic validation
    if (username) {
      const usernameTrim = username.trim();
      const usernameRegex = /^[a-zA-Z0-9_\-]{3,50}$/;
      if (!usernameRegex.test(usernameTrim)) {
        return res.status(400).json({ error: 'Username must be 3-50 chars, alphanumeric, underscore or dash' });
      }

      const existing = await User.findOne({ username: usernameTrim });
      if (existing && existing._id.toString() !== id) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const updates = {};
    if (bio !== undefined) updates.bio = bio;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (username !== undefined) updates.username = username.trim();
    if (socialLinks !== undefined) updates.socialLinks = socialLinks;

    const user = await User.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Delete user account
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is deleting their own account
    if (req.user._id.toString() !== id) {
      return res.status(403).json({ error: 'Can only delete your own account' });
    }

    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Get user's playlists
const getUserPlaylists = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let query = { userId: id };
    
    // If not the owner, only show public playlists
    if (!req.user || req.user._id.toString() !== id) {
      query.isPublic = true;
    }

    const playlists = await Playlist.find(query)
      .populate('userId', 'username')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Playlist.countDocuments(query);

    // Add song count and user interaction status to each playlist
    const playlistsWithDetails = await Promise.all(
      playlists.map(async (playlist) => {
        const songCount = await Song.countDocuments({ playlistId: playlist._id });
        
        let isLiked = false;
        let isSaved = false;
        
        if (req.user?._id) {
          // Check if user has liked this playlist
          const like = await PlaylistLike.findOne({ 
            userId: req.user._id, 
            playlistId: playlist._id 
          });
          isLiked = !!like;
          
          // Check if user has saved this playlist
          const saved = await SavedPlaylist.findOne({ 
            userId: req.user._id, 
            playlistId: playlist._id 
          });
          isSaved = !!saved;
        }
        
        return {
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
          username: playlist.userId.username,
          userAvatar: playlist.userId.avatarUrl,
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
    console.error('Get user playlists error:', error);
    res.status(500).json({ error: 'Failed to get playlists' });
  }
};

// NOTE: Follow/following features are not needed in v1
/*
const getUserFollowers = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const followers = await UserFollow.find({ followingId: id })
      .populate('followerId', '-passwordHash')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await UserFollow.countDocuments({ followingId: id });

    res.json({
      success: true,
      data: {
        followers: followers.map(f => f.followerId),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user followers error:', error);
    res.status(500).json({ error: 'Failed to get followers' });
  }
};

// Get users that user is following
const getUserFollowing = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const following = await UserFollow.find({ followerId: id })
      .populate('followingId', '-passwordHash')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await UserFollow.countDocuments({ followerId: id });

    res.json({
      success: true,
      data: {
        following: following.map(f => f.followingId),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user following error:', error);
    res.status(500).json({ error: 'Failed to get following' });
  }
};

// Follow a user
const followUser = async (req, res) => {
  try {
    const { id } = req.params;
    const followerId = req.user._id;

    if (followerId.toString() === id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    // Check if already following
    const existingFollow = await UserFollow.findOne({
      followerId,
      followingId: id
    });

    if (existingFollow) {
      return res.status(409).json({ error: 'Already following this user' });
    }

    // Create follow relationship
    const follow = new UserFollow({
      followerId,
      followingId: id
    });
    await follow.save();

    // Update counts
    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } });
    const updatedUser = await User.findByIdAndUpdate(id, { $inc: { followersCount: 1 } }, { new: true });

    console.log('[USER_FOLLOWED]', { followerId, followingId: id, timestamp: new Date() });

    res.json({
      success: true,
      message: 'Successfully followed user',
      data: {
        followersCount: updatedUser.followersCount
      }
    });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ error: 'Failed to follow user' });
  }
};

// Unfollow a user
const unfollowUser = async (req, res) => {
  try {
    const { id } = req.params;
    const followerId = req.user._id;

    const follow = await UserFollow.findOneAndDelete({
      followerId,
      followingId: id
    });

    if (!follow) {
      return res.status(404).json({ error: 'Not following this user' });
    }

    // Update counts
    await User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } });
    const updatedUser = await User.findByIdAndUpdate(id, { $inc: { followersCount: -1 } }, { new: true });

    res.json({
      success: true,
      message: 'Successfully unfollowed user',
      data: {
        followersCount: updatedUser.followersCount
      }
    });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
};
*/

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream({
      folder: 'profile-pictures',
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'face'
    }, async (error, result) => {
      if (error) {
        console.error('Cloudinary upload error:', error);
        return res.status(500).json({ error: 'Failed to upload image' });
      }

      try {
        // Update user's avatarUrl
        const user = await User.findByIdAndUpdate(
          req.user._id,
          { avatarUrl: result.secure_url },
          { new: true, runValidators: true }
        ).select('-passwordHash');

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        res.json({
          success: true,
          data: {
            user,
            imageUrl: result.secure_url
          }
        });
      } catch (dbError) {
        console.error('Database update error:', dbError);
        res.status(500).json({ error: 'Failed to update profile' });
      }
    });

    // Pipe the buffer to Cloudinary
    const bufferStream = require('stream').Readable.from(req.file.buffer);
    bufferStream.pipe(uploadStream);
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
};

module.exports = {
  getUsers,
  getUserByUsername,
  getUserById,
  updateUser,
  deleteUser,
  getUserPlaylists,
  uploadProfilePicture,
  // NOTE: Follow/following features are not needed in v1
  // getUserFollowers,
  // getUserFollowing,
  // followUser,
  // unfollowUser
};