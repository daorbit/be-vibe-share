const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 255
  },
  description: {
    type: String
  },
  coverGradient: {
    type: String,
    default: 'from-purple-800 to-pink-900',
    maxlength: 100
  },
  thumbnailUrl: {
    type: String
  },
  tags: [{
    type: String
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  isPublic: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
playlistSchema.index({ userId: 1 });
playlistSchema.index({ isPublic: 1 });
playlistSchema.index({ tags: 1 });

module.exports = mongoose.model('Playlist', playlistSchema);