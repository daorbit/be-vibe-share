const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is not set!');
  process.exit(1);
}

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().min(3).max(50).required(),
  password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
  
  const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'
  });
  
  return { accessToken, refreshToken };
};

// Decode and validate Google JWT credential
const decodeGoogleCredential = (credential) => {
  try {
    // Google JWTs are standard JWTs, decode without verification for now
    // In production, you should verify the token signature
    const decoded = jwt.decode(credential);
    
    if (!decoded) {
      throw new Error('Invalid Google credential');
    }
    
    // Validate required fields
    if (!decoded.sub || !decoded.email || !decoded.email_verified) {
      throw new Error('Invalid Google credential: missing required fields');
    }
    
    return {
      googleId: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
      emailVerified: decoded.email_verified
    };
  } catch (error) {
    console.error('Error decoding Google credential:', error);
    throw new Error('Invalid Google credential');
  }
};

// Register user
const register = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        error: existingUser.email === email ? 'Email already exists' : 'Username already exists' 
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Create user
    const user = new User({
      email,
      username,
      passwordHash
    });
    
    await user.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    console.log('[USER_REGISTERED]', { userId: user._id, email, username, timestamp: new Date() });
    
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          username: user.username
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    console.log('[USER_LOGIN]', { userId: user._id, email, timestamp: new Date() });
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          username: user.username
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userObj = user.toObject();
    // Ensure a stable `id` field exists on the client
    userObj.id = userObj.id || userObj._id;

    res.json({
      success: true,
      data: { user: userObj }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Refresh token
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);
    
    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// Logout (client-side token removal)
const logout = async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

// Google Sign In with JWT credential
const googleSignIn = async (req, res) => {
  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }
    
    // Decode and validate Google credential
    const googleData = decodeGoogleCredential(credential);
    
    // Check if user already exists with this Google ID
    let user = await User.findOne({ googleId: googleData.googleId });
    
    if (user) {
      // Update user data if missing
      if (!user.avatarUrl && googleData.picture) {
        user.avatarUrl = googleData.picture;
      }
      await user.save();
    } else {
      // Check if user exists with same email
      user = await User.findOne({ email: googleData.email });
      
      if (user) {
        // Link Google account to existing user
        user.googleId = googleData.googleId;
        user.provider = 'google';
        if (!user.avatarUrl && googleData.picture) {
          user.avatarUrl = googleData.picture;
        }
        await user.save();
      } else {
        // Create new user
        const username = googleData.name.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 1000);
        user = new User({
          email: googleData.email,
          username: username,
          googleId: googleData.googleId,
          provider: 'google',
          avatarUrl: googleData.picture || null
        });
        
        await user.save();
      }
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    console.log('[USER_GOOGLE_SIGNIN]', { userId: user._id, email: user.email, username: user.username, timestamp: new Date() });
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Google sign-in error:', error);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
};

module.exports = {
  register,
  login,
  getMe,
  refresh,
  logout,
  googleSignIn,
  registerSchema,
  loginSchema
};