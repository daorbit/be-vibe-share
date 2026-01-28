// NOTE: Follow/following features are not needed in v1
/*
const mongoose = require('mongoose');

const userFollowSchema = new mongoose.Schema({
  followerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  followingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound index to ensure uniqueness
userFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

module.exports = mongoose.model('UserFollow', userFollowSchema);
*/