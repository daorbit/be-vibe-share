const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  playlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 255
  },
  artist: {
    type: String,
    required: true,
    maxlength: 255
  },
  url: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    required: true,
    maxlength: 50
  },
  thumbnail: {
    type: String
  },
  position: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Indexes
songSchema.index({ playlistId: 1 });
songSchema.index({ playlistId: 1, position: 1 });

module.exports = mongoose.model('Song', songSchema);