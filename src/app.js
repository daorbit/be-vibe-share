require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const app = express();

// Trust proxy for rate limiting (important for Vercel deployment)
app.set('trust proxy', 1);

// Connect to MongoDB
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.log('MongoDB URI not set, skipping database connection');
}

// Middleware
app.use(helmet());
app.use(compression()); // Enable gzip compression
app.use(cors({
  origin: ['https://vibe-share-zeta.vercel.app/', 'http://localhost:8080', 'http://localhost:3000','https://vibe-share-zeta.vercel.app',"https://lovable.dev","https://lovable.dev/projects/ee257b27-ae33-42d5-b750-9627c12ab5cb", "https://id-preview--ee257b27-ae33-42d5-b750-9627c12ab5cb.lovable.app"],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/feed', require('./routes/feed'));
app.use('/api/discover', require('./routes/discover'));
app.use('/api/search', require('./routes/search'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(require('./middleware/errorHandler'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await mongoose.disconnect();
  process.exit(0);
});

module.exports = app;