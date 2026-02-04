# vibecheck Backend API

A Node.js-powered backend for the vibecheck music playlist sharing platform.

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL (or MongoDB)
- **Authentication**: JWT (JSON Web Tokens)
- **ORM**: Prisma / Sequelize / Mongoose
- **Caching**: Redis (optional)
- **File Storage**: AWS S3 / Cloudinary

## Database Schema

### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  playlist_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Playlists
```sql
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_gradient VARCHAR(100) DEFAULT 'from-purple-800 to-pink-900',
  tags TEXT[] DEFAULT '{}',
  likes_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Songs (Song Links)
```sql
CREATE TABLE songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  platform VARCHAR(50) NOT NULL,
  thumbnail TEXT,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### User Follows
```sql
CREATE TABLE user_follows (
  follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);
```

### Playlist Likes
```sql
CREATE TABLE playlist_likes (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, playlist_id)
);
```

### Saved Playlists
```sql
CREATE TABLE saved_playlists (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, playlist_id)
);
```

## API Endpoints

### Authentication
```
POST   /api/auth/register     - Register new user
POST   /api/auth/login        - User login (returns JWT)
POST   /api/auth/logout       - Invalidate token
POST   /api/auth/refresh      - Refresh access token
GET    /api/auth/me           - Get current user
```

### Users
```
GET    /api/users                    - List users (with pagination)
GET    /api/users/:username          - Get user profile by username
GET    /api/users/:id                - Get user profile by ID
PUT    /api/users/:id                - Update user profile
DELETE /api/users/:id                - Delete user account
GET    /api/users/:id/playlists      - Get user's playlists
GET    /api/users/:id/followers      - Get user's followers
GET    /api/users/:id/following      - Get users that user follows
POST   /api/users/:id/follow         - Follow a user
DELETE /api/users/:id/follow         - Unfollow a user
```

### Playlists
```
GET    /api/playlists                - List public playlists (with filters)
POST   /api/playlists                - Create new playlist
GET    /api/playlists/:id            - Get playlist details with songs
PUT    /api/playlists/:id            - Update playlist
DELETE /api/playlists/:id            - Delete playlist
POST   /api/playlists/:id/like       - Like a playlist
DELETE /api/playlists/:id/like       - Unlike a playlist
POST   /api/playlists/:id/save       - Save playlist to library
DELETE /api/playlists/:id/save       - Remove from saved
```

### Songs
```
GET    /api/playlists/:id/songs      - Get all songs in playlist
POST   /api/playlists/:id/songs      - Add song to playlist
PUT    /api/songs/:id                - Update song details
DELETE /api/songs/:id                - Remove song from playlist
PUT    /api/playlists/:id/songs/reorder - Reorder songs
```

### Discover/Feed
```
GET    /api/feed                     - Get personalized feed
GET    /api/discover/users           - Suggested users to follow
GET    /api/discover/playlists       - Trending playlists
GET    /api/tags/:tag                - Get playlists by tag
```

### Search
```
GET    /api/search                   - Universal search (users, playlists, tags)
       ?q=<query>                    - Search query (required, min 2 chars)
       ?type=all|users|playlists|tags - Filter by type (default: all)
       ?limit=<number>               - Results per type (default: 10)
       ?offset=<number>              - Pagination offset (default: 0)

GET    /api/search/users             - Search only users
       ?q=<query>                    - Search in username and bio
       ?limit=<number>               - Results limit (default: 20)
       ?offset=<number>              - Pagination offset

GET    /api/search/playlists         - Search only playlists
       ?q=<query>                    - Search in title, description, tags
       ?limit=<number>               - Results limit (default: 20)
       ?offset=<number>              - Pagination offset
       ?sort=recent|popular          - Sort order (default: relevant)

GET    /api/search/tags              - Search tags
       ?q=<query>                    - Tag prefix search
       ?limit=<number>               - Results limit (default: 20)

GET    /api/search/suggestions       - Get search suggestions
       ?q=<query>                    - Partial query for autocomplete

GET    /api/search/trending          - Get trending searches
       ?limit=<number>               - Number of trends (default: 10)

GET    /api/search/recent            - Get user's recent searches (auth required)
       ?limit=<number>               - Number of recent searches (default: 10)

DELETE /api/search/recent            - Clear user's recent searches (auth required)

DELETE /api/search/recent/:id        - Remove specific recent search (auth required)
```

## Request/Response Examples

### Register User
```javascript
// POST /api/auth/register
{
  "email": "user@example.com",
  "username": "musiclover",
  "password": "securepassword123"
}

// Response
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "musiclover"
    },
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token"
  }
}
```

### Follow User
```javascript
// POST /api/users/:id/follow
// Headers: Authorization: Bearer <token>

// Response
{
  "success": true,
  "message": "Successfully followed user",
  "data": {
    "followersCount": 1235
  }
}
```

### Create Playlist
```javascript
// POST /api/playlists
{
  "title": "my favorites",
  "description": "Songs I love",
  "tags": ["vibes", "chill"],
  "coverGradient": "from-purple-800 to-pink-900",
  "isPublic": true
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "my favorites",
    "songs": [],
    "likesCount": 0,
    "createdAt": "2024-01-20T..."
  }
}
```

### Add Song to Playlist
```javascript
// POST /api/playlists/:id/songs
{
  "title": "Blinding Lights",
  "artist": "The Weeknd",
  "url": "https://www.youtube.com/watch?v=4NRXx6U8ABQ",
  "platform": "YouTube"
}

// Response - thumbnail auto-detected
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Blinding Lights",
    "artist": "The Weeknd",
    "thumbnail": "https://img.youtube.com/vi/4NRXx6U8ABQ/mqdefault.jpg",
    "position": 1
  }
}
```

### Search (Universal)
```javascript
// GET /api/search?q=chill&type=all&limit=5

// Response
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "chill.hub",
        "bio": "Sharing chill vibes only",
        "avatarUrl": "https://...",
        "followersCount": 1234,
        "isFollowing": false
      }
    ],
    "playlists": [
      {
        "id": "uuid",
        "title": "chill vibes only",
        "description": "Perfect background music",
        "coverGradient": "from-purple-800 to-pink-900",
        "tags": ["chill", "lofi"],
        "likesCount": 567,
        "songsCount": 24,
        "user": {
          "id": "uuid",
          "username": "luna.waves"
        }
      }
    ],
    "tags": [
      {
        "name": "chill",
        "playlistCount": 145
      },
      {
        "name": "chillhop",
        "playlistCount": 89
      }
    ],
    "meta": {
      "query": "chill",
      "totalUsers": 15,
      "totalPlaylists": 42,
      "totalTags": 3
    }
  }
}
```

### Search Users Only
```javascript
// GET /api/search/users?q=music&limit=10

// Response
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "musiclover",
        "bio": "Music is my life",
        "avatarUrl": "https://...",
        "followersCount": 5678,
        "playlistCount": 12,
        "isFollowing": true
      }
    ],
    "meta": {
      "total": 25,
      "limit": 10,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### Search Playlists Only
```javascript
// GET /api/search/playlists?q=workout&sort=popular&limit=10

// Response
{
  "success": true,
  "data": {
    "playlists": [
      {
        "id": "uuid",
        "title": "Ultimate Workout",
        "description": "Get pumped!",
        "coverGradient": "from-red-800 to-orange-900",
        "tags": ["workout", "gym", "motivation"],
        "likesCount": 3421,
        "songsCount": 32,
        "createdAt": "2024-01-15T...",
        "user": {
          "id": "uuid",
          "username": "beatdropper",
          "verified": true
        }
      }
    ],
    "meta": {
      "total": 89,
      "limit": 10,
      "offset": 0,
      "hasMore": true,
      "sort": "popular"
    }
  }
}
```

### Search Suggestions (Autocomplete)
```javascript
// GET /api/search/suggestions?q=chi

// Response
{
  "success": true,
  "data": {
    "suggestions": [
      { "type": "tag", "text": "chill", "count": 145 },
      { "type": "user", "text": "chill.hub", "id": "uuid" },
      { "type": "playlist", "text": "chill vibes only", "id": "uuid" },
      { "type": "tag", "text": "chillhop", "count": 89 }
    ]
  }
}
```

### Trending Searches
```javascript
// GET /api/search/trending?limit=10

// Response
{
  "success": true,
  "data": {
    "trending": [
      { "query": "lofi", "searchCount": 12453 },
      { "query": "workout", "searchCount": 9876 },
      { "query": "chill", "searchCount": 8543 },
      { "query": "indie", "searchCount": 7234 },
      { "query": "roadtrip", "searchCount": 6123 }
    ]
  }
}
```

### Recent Searches (Auth Required)
```javascript
// GET /api/search/recent?limit=5
// Headers: Authorization: Bearer <token>

// Response
{
  "success": true,
  "data": {
    "recentSearches": [
      { "id": "uuid", "query": "summer vibes", "searchedAt": "2024-01-20T..." },
      { "id": "uuid", "query": "lofi beats", "searchedAt": "2024-01-19T..." },
      { "id": "uuid", "query": "workout mix", "searchedAt": "2024-01-18T..." }
    ]
  }
}
```

## Middleware

### Authentication Middleware
```javascript
// Verify JWT and attach user to request
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per window
});

app.use('/api/', limiter);
```

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/vibecheck

# Authentication
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d

# External Services
YOUTUBE_API_KEY=your-youtube-api-key
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Storage
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=vibecheck-uploads

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

## Supported Music Platforms

Song links support automatic platform detection:
- YouTube (youtube.com, youtu.be)
- Spotify (open.spotify.com)
- SoundCloud (soundcloud.com)
- Apple Music (music.apple.com)
- Deezer (deezer.com)
- Tidal (tidal.com)

YouTube links automatically fetch thumbnail previews via YouTube Data API.

## Tags System

Playlists support up to 5 tags for categorization:
- Tags are stored as a PostgreSQL array
- Suggested tags: chill, vibes, workout, study, party, roadtrip, lofi, hiphop, indie, electronic, rnb, pop, rock, jazz, classical, motivation, sleep, focus

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── redis.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── playlistController.js
│   │   └── songController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── validation.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Playlist.js
│   │   ├── Song.js
│   │   └── Follow.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── playlists.js
│   │   └── discover.js
│   ├── services/
│   │   ├── platformDetector.js
│   │   └── thumbnailFetcher.js
│   ├── utils/
│   │   └── helpers.js
│   └── app.js
├── prisma/
│   └── schema.prisma
├── tests/
├── .env.example
├── package.json
└── README.md
```

## Console Logging (Development)

All data operations are logged for development:
```javascript
console.log('[PLAYLIST_CREATED]', { playlist, timestamp })
console.log('[SONG_ADDED]', { playlistId, song, timestamp })
console.log('[USER_LOGIN]', { email, timestamp })
console.log('[USER_FOLLOWED]', { followerId, followingId, timestamp })
console.log('[PLAYLIST_LIKED]', { playlistId, userId, timestamp })
```

## Getting Started

```bash
# Clone the repo
git clone https://github.com/yourname/vibecheck-backend.git
cd vibecheck-backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## Future Enhancements

- [ ] Real-time notifications (WebSocket)
- [ ] Direct messaging between users
- [ ] Playlist collaboration (multiple editors)
- [ ] Music recommendation engine
- [ ] Social sharing with OG previews
- [ ] Playlist embedding for external sites
- [ ] Import from Spotify/Apple Music
- [ ] Analytics dashboard for creators
- [ ] Push notifications (mobile)
- [ ] Activity feed (who liked, followed, etc.)

---

Made with 💜 for vibecheck
