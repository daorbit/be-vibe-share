const express = require('express');
const router = express.Router();
const { getFeed } = require('../controllers/feedController');
const { optionalAuthenticate } = require('../middleware/auth');

// Routes
router.get('/', optionalAuthenticate, getFeed);

module.exports = router;