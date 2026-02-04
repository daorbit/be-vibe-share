const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
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
} = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Routes
router.get('/', getUsers);
router.get('/id/:id', getUserById);
router.get('/:username', getUserByUsername);
router.put('/:id', authenticate, updateUser);
router.post('/upload-profile-picture', authenticate, upload.single('profilePicture'), uploadProfilePicture);
router.delete('/:id', authenticate, deleteUser);
router.get('/:id/playlists', getUserPlaylists);
// NOTE: Follow/following features are not needed in v1
// router.get('/:id/followers', getUserFollowers);
// router.get('/:id/following', getUserFollowing);
// router.post('/:id/follow', authenticate, followUser);
// router.delete('/:id/follow', authenticate, unfollowUser);

module.exports = router;