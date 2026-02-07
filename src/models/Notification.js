const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['playlist_like', 'playlist_save'],
    required: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  playlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist',
    required: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound index for efficient queries
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Prevent duplicate notifications
notificationSchema.index({ userId: 1, type: 1, actorId: 1, playlistId: 1 }, { unique: true });

// TTL index to automatically delete notifications after 5 days (432000 seconds)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 432000 });

module.exports = mongoose.model('Notification', notificationSchema);
