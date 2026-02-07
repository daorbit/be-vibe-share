const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// Helper function to cleanup old notifications (5 days)
const cleanupOldNotifications = async () => {
  try {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const result = await Notification.deleteMany({
      createdAt: { $lt: fiveDaysAgo }
    });
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} old notifications`);
    }
  } catch (error) {
    console.error('Cleanup old notifications error:', error);
  }
};

// Get user notifications
const getNotifications = async (req, res) => {
  try {
    // Run cleanup in background (non-blocking)
    cleanupOldNotifications().catch(err => console.error('Background cleanup error:', err));

    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const skip = (page - 1) * limit;

    const query = { userId: req.user._id };
    
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('actorId', 'username avatarUrl')
      .populate('playlistId', 'title coverImage coverGradient')
      .lean();

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId: req.user._id, 
      isRead: false 
    });

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// Get unread count
const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await Notification.deleteOne({
      _id: notificationId,
      userId: req.user._id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

// Helper function to create notification (used by other controllers)
const createNotification = async ({ userId, type, actorId, playlistId }) => {
  try {
    // Don't create notification if user is acting on their own content
    if (userId.toString() === actorId.toString()) {
      return null;
    }

    // Try to create notification, ignore if duplicate
    const notification = await Notification.create({
      userId,
      type,
      actorId,
      playlistId
    }).catch(err => {
      // Ignore duplicate key errors (notification already exists)
      if (err.code === 11000) {
        return null;
      }
      throw err;
    });

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  deleteNotification,
  createNotification
};
