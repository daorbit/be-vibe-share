const detectPlatform = (url) => {
  if (!url) return null;
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return 'YouTube';
  }
  
  if (urlLower.includes('spotify.com')) {
    return 'Spotify';
  }
  
  if (urlLower.includes('soundcloud.com')) {
    return 'SoundCloud';
  }
  
  if (urlLower.includes('music.apple.com')) {
    return 'Apple Music';
  }
  
  if (urlLower.includes('deezer.com')) {
    return 'Deezer';
  }
  
  if (urlLower.includes('tidal.com')) {
    return 'Tidal';
  }
  
  return 'Unknown';
};

const extractYouTubeId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
};

const getYouTubeThumbnail = (videoId) => {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
};

module.exports = {
  detectPlatform,
  extractYouTubeId,
  getYouTubeThumbnail
};