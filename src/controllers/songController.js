const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
const SavedSong = require('../models/SavedSong');
const Joi = require('joi');
const { detectPlatform, getYouTubeThumbnail } = require('../services/platformDetector');
const { fetchThumbnail } = require('../services/thumbnailFetcher');

// Validation schemas
const updateSongSchema = Joi.object({
  title: Joi.string().min(1).max(255),
  artist: Joi.string().min(1).max(255),
  url: Joi.string().uri(),
  platform: Joi.string().min(1).max(50)
});

const reorderSongsSchema = Joi.object({
  songs: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      position: Joi.number().integer().min(1).required()
    })
  ).required()
});

const addSongsSchema = Joi.object({
  songs: Joi.array().items(
    Joi.object({
      title: Joi.string().min(1).max(255).required(),
      artist: Joi.string().min(1).max(255).required(),
      url: Joi.string().uri().required(),
      platform: Joi.string().min(1).max(50)
    })
  ).min(1).required()
});

// Get songs in playlist
const getPlaylistSongs = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if playlist exists and is accessible
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (!playlist.isPublic && (!req.user || req.user._id.toString() !== playlist.userId.toString())) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const songs = await Song.find({ playlistId: id }).sort({ position: 1 });

    res.json({
      success: true,
      data: { songs }
    });
  } catch (error) {
    console.error('Get playlist songs error:', error);
    res.status(500).json({ error: 'Failed to get songs' });
  }
};

// Add song to playlist
const addSong = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, artist, url, platform: providedPlatform } = req.body;

    // Check if playlist exists and user owns it
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (playlist.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only add songs to your own playlists' });
    }

    // Auto-detect platform if not provided
    const platform = providedPlatform || detectPlatform(url);

    // Get the next position
    const lastSong = await Song.findOne({ playlistId: id }).sort({ position: -1 });
    const position = lastSong ? lastSong.position + 1 : 1;

    // Fetch thumbnail
    const thumbnail = await fetchThumbnail(url, platform);

    // Create song
    const song = new Song({
      playlistId: id,
      title,
      artist,
      url,
      platform,
      thumbnail,
      position
    });

    await song.save();

    console.log('[SONG_ADDED]', { playlistId: id, songId: song._id, timestamp: new Date() });

    res.status(201).json({
      success: true,
      data: { song }
    });
  } catch (error) {
    console.error('Add song error:', error);
    res.status(500).json({ error: 'Failed to add song' });
  }
};

// Update song
const updateSong = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const song = await Song.findById(id).populate('playlistId');
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check ownership
    if (song.playlistId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only update songs in your own playlists' });
    }

    const updatedSong = await Song.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: { song: updatedSong }
    });
  } catch (error) {
    console.error('Update song error:', error);
    res.status(500).json({ error: 'Failed to update song' });
  }
};

// Delete song
const deleteSong = async (req, res) => {
  try {
    const { id } = req.params;

    const song = await Song.findById(id).populate('playlistId');
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check ownership
    if (song.playlistId.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only delete songs from your own playlists' });
    }

    await Song.findByIdAndDelete(id);

    // Reorder remaining songs
    const remainingSongs = await Song.find({ playlistId: song.playlistId._id }).sort({ position: 1 });
    for (let i = 0; i < remainingSongs.length; i++) {
      await Song.findByIdAndUpdate(remainingSongs[i]._id, { position: i + 1 });
    }

    res.json({
      success: true,
      message: 'Song deleted successfully'
    });
  } catch (error) {
    console.error('Delete song error:', error);
    res.status(500).json({ error: 'Failed to delete song' });
  }
};

// Reorder songs
const reorderSongs = async (req, res) => {
  try {
    const { id } = req.params;
    const { songs } = req.body;

    // Check if playlist exists and user owns it
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (playlist.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only reorder songs in your own playlists' });
    }

    // Validate that all song IDs belong to this playlist
    const songIds = songs.map(s => s.id);
    const existingSongs = await Song.find({
      _id: { $in: songIds },
      playlistId: id
    });

    if (existingSongs.length !== songIds.length) {
      return res.status(400).json({ error: 'Some songs not found in this playlist' });
    }

    // Update positions
    const updatePromises = songs.map(songData =>
      Song.findByIdAndUpdate(songData.id, { position: songData.position })
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Songs reordered successfully'
    });
  } catch (error) {
    console.error('Reorder songs error:', error);
    res.status(500).json({ error: 'Failed to reorder songs' });
  }
};

// Add multiple songs to playlist
const addSongs = async (req, res) => {
  try {
    const { id } = req.params;
    const { songs } = req.body;

    // Check if playlist exists and user owns it
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (playlist.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only add songs to your own playlists' });
    }

    // Get the next position
    const lastSong = await Song.findOne({ playlistId: id }).sort({ position: -1 });
    let nextPosition = lastSong ? lastSong.position + 1 : 1;

    // Process songs in parallel for better performance
    const songPromises = songs.map(async (songData) => {
      const { title, artist, url, platform: providedPlatform } = songData;

      // Auto-detect platform if not provided
      const platform = providedPlatform || detectPlatform(url);

      // Fetch thumbnail
      const thumbnail = await fetchThumbnail(url, platform);

      // Create song
      const song = new Song({
        playlistId: id,
        title,
        artist,
        url,
        platform,
        thumbnail,
        position: nextPosition++
      });

      return song.save();
    });

    const savedSongs = await Promise.all(songPromises);

    console.log('[SONGS_ADDED]', { playlistId: id, songCount: savedSongs.length, timestamp: new Date() });

    res.status(201).json({
      success: true,
      data: { songs: savedSongs }
    });
  } catch (error) {
    console.error('Add songs error:', error);
    res.status(500).json({ error: 'Failed to add songs' });
  }
};

// Save song
const saveSong = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Check if song exists
    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check if already saved
    const existingSave = await SavedSong.findOne({ userId, songId: id });
    if (existingSave) {
      return res.status(409).json({ error: 'Already saved this song' });
    }

    // Create save
    const save = new SavedSong({ userId, songId: id });
    await save.save();

    res.json({
      success: true,
      message: 'Song saved successfully'
    });
  } catch (error) {
    console.error('Save song error:', error);
    res.status(500).json({ error: 'Failed to save song' });
  }
};

// Unsave song
const unsaveSong = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const save = await SavedSong.findOneAndDelete({ userId, songId: id });
    if (!save) {
      return res.status(404).json({ error: 'Save not found' });
    }

    res.json({
      success: true,
      message: 'Song unsaved successfully'
    });
  } catch (error) {
    console.error('Unsave song error:', error);
    res.status(500).json({ error: 'Failed to unsave song' });
  }
};

// Get user's saved songs
const getSavedSongs = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const savedSongs = await SavedSong.find({ userId: req.user._id })
      .populate({
        path: 'songId',
        populate: {
          path: 'playlistId',
          select: 'title userId',
          populate: {
            path: 'userId',
            select: 'username avatarUrl'
          }
        }
      })
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await SavedSong.countDocuments({ userId: req.user._id });

    // Filter out null songs (in case some were deleted)
    const validSongs = savedSongs
      .filter(save => save.songId)
      .map(save => ({
        ...save.songId.toObject(),
        savedAt: save.createdAt,
        playlistInfo: {
          id: save.songId.playlistId?._id,
          title: save.songId.playlistId?.title,
          owner: save.songId.playlistId?.userId?.username
        }
      }));

    res.json({
      success: true,
      data: {
        songs: validSongs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get saved songs error:', error);
    res.status(500).json({ error: 'Failed to get saved songs' });
  }
};

module.exports = {
  getPlaylistSongs,
  addSong,
  addSongs,
  updateSong,
  deleteSong,
  reorderSongs,
  saveSong,
  unsaveSong,
  getSavedSongs,
  updateSongSchema,
  addSongsSchema,
  reorderSongsSchema
};