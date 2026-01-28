const mongoose = require('mongoose');

const savedPlaylistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  playlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist',
    required: true
  }
}, {
  timestamps: true
});

// Compound index to ensure uniqueness
savedPlaylistSchema.index({ userId: 1, playlistId: 1 }, { unique: true });

module.exports = mongoose.model('SavedPlaylist', savedPlaylistSchema);