const { google } = require('googleapis');
const { detectPlatform, extractYouTubeId, getYouTubeThumbnail } = require('./platformDetector');

const fetchThumbnail = async (url, platform) => {
  try {
    if (platform === 'YouTube' || (!platform && detectPlatform(url) === 'YouTube')) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        // For now, just return the standard thumbnail
        // In production, you might want to use YouTube API to verify the video exists
        return getYouTubeThumbnail(videoId);
      }
    }
    
    // For other platforms, you could implement API calls
    // For now, return null and let frontend handle it
    return null;
  } catch (error) {
    console.error('Thumbnail fetch error:', error);
    return null;
  }
};

const getYouTubeVideoDetails = async (videoId) => {
  try {
    if (!process.env.YOUTUBE_API_KEY) {
      return null;
    }
    
    const youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
    
    const response = await youtube.videos.list({
      part: 'snippet',
      id: videoId
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const video = response.data.items[0];
      return {
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail: video.snippet.thumbnails.medium.url,
        channelTitle: video.snippet.channelTitle
      };
    }
    
    return null;
  } catch (error) {
    console.error('YouTube API error:', error);
    return null;
  }
};

module.exports = {
  fetchThumbnail,
  getYouTubeVideoDetails
};