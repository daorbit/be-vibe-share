const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Playlist = require('../models/Playlist');
const Song = require('../models/Song');
const PlaylistLike = require('../models/PlaylistLike');
const SavedPlaylist = require('../models/SavedPlaylist');

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCacheKey = (type, q, limit, offset) => `${type}-${q}-${limit}-${offset}`;

const getCached = (key) => {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data;
  }
  cache.delete(key);
  return null;
};

const setCached = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

// Universal search
const universalSearch = async (req, res) => {
  try {
    const { q, type = 'all', limit = 10, offset = 0 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchLimit = Math.min(parseInt(limit), 20);
    const searchOffset = parseInt(offset);
    const cacheKey = getCacheKey(type, q, searchLimit, searchOffset);

    // Check cache first
    const cachedResult = getCached(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    let results = { users: [], playlists: [], tags: [] };
    let totalUsers = 0, totalPlaylists = 0, totalTags = 0;

    if (type === 'all' || type === 'users') {
      const userQuery = {
        $or: [
          { username: { $regex: q, $options: 'i' } },
          { bio: { $regex: q, $options: 'i' } }
        ]
      };

      const users = await User.find(userQuery)
        .select('-passwordHash')
        .skip(searchOffset)
        .limit(searchLimit)
        .sort({ followersCount: -1 });

      const usersWithId = users.map(user => ({
        id: user._id,
        ...user.toObject()
      }));

      totalUsers = await User.countDocuments(userQuery);
      results.users = usersWithId;
    }

    if (type === 'all' || type === 'playlists') {
      const playlistQuery = {
        isPublic: true,
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $elemMatch: { $regex: q, $options: 'i' } } }
        ]
      };

      const playlists = await Playlist.find(playlistQuery)
        .populate('userId', 'username')
        .skip(searchOffset)
        .limit(searchLimit)
        .sort({ likesCount: -1 });

      totalPlaylists = await Playlist.countDocuments(playlistQuery);
      
      // Add user interaction status to each playlist
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
            id: playlist._id,
            ...playlist.toObject(),
            songCount,
            isLiked,
            isSaved
          };
        })
      );
      
      results.playlists = playlistsWithDetails;
    }

    if (type === 'all' || type === 'tags') {
      // Get tags that match the query
      const tagRegex = new RegExp(`^${q}`, 'i');
      const playlistsWithTags = await Playlist.find({
        isPublic: true,
        tags: { $regex: tagRegex }
      });

      const tagCount = {};
      playlistsWithTags.forEach(playlist => {
        playlist.tags.forEach(tag => {
          if (tagRegex.test(tag)) {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          }
        });
      });

      const tags = Object.entries(tagCount)
        .map(([name, count]) => ({ name, playlistCount: count }))
        .sort((a, b) => b.playlistCount - a.playlistCount)
        .slice(0, searchLimit);

      totalTags = tags.length;
      results.tags = tags;
    }

    const responseData = {
      success: true,
      data: {
        ...results,
        meta: {
          query: q,
          totalUsers,
          totalPlaylists,
          totalTags
        }
      }
    };

    // Cache the result
    setCached(cacheKey, responseData);

    res.json(responseData);
  } catch (error) {
    console.error('Universal search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// Search users only
const searchUsers = async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchLimit = Math.min(parseInt(limit), 50);
    const searchOffset = parseInt(offset);

    const query = {
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { bio: { $regex: q, $options: 'i' } }
      ]
    };

    const users = await User.find(query)
      .select('-passwordHash')
      .skip(searchOffset)
      .limit(searchLimit)
      .sort({ followersCount: -1 });

    const usersWithId = users.map(user => ({
      id: user._id,
      ...user.toObject()
    }));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users: usersWithId,
        meta: {
          total,
          limit: searchLimit,
          offset: searchOffset,
          hasMore: total > searchOffset + searchLimit
        }
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// Search playlists only
const searchPlaylists = async (req, res) => {
  try {
    const { q, limit = 20, offset = 0, sort = 'relevant' } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchLimit = Math.min(parseInt(limit), 50);
    const searchOffset = parseInt(offset);

    const query = {
      isPublic: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $elemMatch: { $regex: q, $options: 'i' } } }
      ]
    };

    let sortOption = { createdAt: -1 };
    if (sort === 'popular') {
      sortOption = { likesCount: -1, createdAt: -1 };
    } else if (sort === 'recent') {
      sortOption = { createdAt: -1 };
    }

    const playlists = await Playlist.find(query)
      .populate('userId', 'username')
      .skip(searchOffset)
      .limit(searchLimit)
      .sort(sortOption);

    const total = await Playlist.countDocuments(query);

    // Add user interaction status to each playlist
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
          id: playlist._id,
          ...playlist.toObject(),
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
        meta: {
          total,
          limit: searchLimit,
          offset: searchOffset,
          hasMore: total > searchOffset + searchLimit,
          sort
        }
      }
    });
  } catch (error) {
    console.error('Search playlists error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// Search tags
const searchTags = async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchLimit = Math.min(parseInt(limit), 50);
    const tagRegex = new RegExp(`^${q}`, 'i');

    const playlistsWithTags = await Playlist.find({
      isPublic: true,
      tags: { $regex: tagRegex }
    });

    const tagCount = {};
    playlistsWithTags.forEach(playlist => {
      playlist.tags.forEach(tag => {
        if (tagRegex.test(tag)) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      });
    });

    const tags = Object.entries(tagCount)
      .map(([name, count]) => ({ name, playlistCount: count }))
      .sort((a, b) => b.playlistCount - a.playlistCount)
      .slice(0, searchLimit);

    res.json({
      success: true,
      data: { tags }
    });
  } catch (error) {
    console.error('Search tags error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// Get search suggestions
const getSearchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 1) {
      return res.json({ success: true, data: { suggestions: [] } });
    }

    const suggestions = [];

    // User suggestions
    const users = await User.find({
      username: { $regex: `^${q}`, $options: 'i' }
    })
    .select('username')
    .limit(3);

    users.forEach(user => {
      suggestions.push({
        type: 'user',
        text: user.username,
        id: user._id
      });
    });

    // Playlist suggestions
    const playlists = await Playlist.find({
      isPublic: true,
      title: { $regex: `^${q}`, $options: 'i' }
    })
    .select('title')
    .limit(3);

    playlists.forEach(playlist => {
      suggestions.push({
        type: 'playlist',
        text: playlist.title,
        id: playlist._id
      });
    });

    // Tag suggestions
    const tagRegex = new RegExp(`^${q}`, 'i');
    const playlistsWithTags = await Playlist.find({
      isPublic: true,
      tags: { $regex: tagRegex }
    }).limit(10);

    const tagCount = {};
    playlistsWithTags.forEach(playlist => {
      playlist.tags.forEach(tag => {
        if (tagRegex.test(tag)) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      });
    });

    Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([tag, count]) => {
        suggestions.push({
          type: 'tag',
          text: tag,
          count
        });
      });

    res.json({
      success: true,
      data: { suggestions }
    });
  } catch (error) {
    console.error('Get search suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
};

// Get trending searches (simplified - in real app, you'd track actual searches)
const getTrendingSearches = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // For now, return some hardcoded trending searches
    // In a real app, you'd have a search analytics table
    const trending = [
      { query: 'lofi', searchCount: 12453 },
      { query: 'workout', searchCount: 9876 },
      { query: 'chill', searchCount: 8543 },
      { query: 'indie', searchCount: 7234 },
      { query: 'roadtrip', searchCount: 6123 },
      { query: 'study', searchCount: 5432 },
      { query: 'party', searchCount: 4987 },
      { query: 'focus', searchCount: 4321 },
      { query: 'sleep', searchCount: 3876 },
      { query: 'motivation', searchCount: 3456 }
    ].slice(0, parseInt(limit));

    res.json({
      success: true,
      data: { trending }
    });
  } catch (error) {
    console.error('Get trending searches error:', error);
    res.status(500).json({ error: 'Failed to get trending searches' });
  }
};

// Get user's recent searches (placeholder - would need a search history model)
const getRecentSearches = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Placeholder - in real app, you'd query user's search history
    const recentSearches = [
      { id: '1', query: 'summer vibes', searchedAt: new Date(Date.now() - 86400000) },
      { id: '2', query: 'lofi beats', searchedAt: new Date(Date.now() - 172800000) },
      { id: '3', query: 'workout mix', searchedAt: new Date(Date.now() - 259200000) }
    ].slice(0, parseInt(limit));

    res.json({
      success: true,
      data: { recentSearches }
    });
  } catch (error) {
    console.error('Get recent searches error:', error);
    res.status(500).json({ error: 'Failed to get recent searches' });
  }
};

// Clear recent searches (placeholder)
const clearRecentSearches = async (req, res) => {
  // Placeholder - would delete user's search history
  res.json({
    success: true,
    message: 'Recent searches cleared'
  });
};

// Remove specific recent search (placeholder)
const removeRecentSearch = async (req, res) => {
  const { id } = req.params;
  // Placeholder - would delete specific search from history
  res.json({
    success: true,
    message: 'Recent search removed'
  });
};

module.exports = {
  universalSearch,
  searchUsers,
  searchPlaylists,
  searchTags,
  getSearchSuggestions,
  getTrendingSearches,
  getRecentSearches,
  clearRecentSearches,
  removeRecentSearch
};