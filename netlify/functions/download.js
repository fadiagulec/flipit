// Netlify function: /download
// Multi-strategy video download proxy
// Strategy 1: Microlink API (works great for YouTube)
// Strategy 2: Instagram embed page video extraction
// Strategy 3: TikTok embed page video extraction
// Strategy 4: Direct OG/meta video tag extraction (works for many platforms)

const fetch = require('node-fetch');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let url;
  try {
    const body = JSON.parse(event.body || '{}');
    url = (body.url || '').trim();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!url) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url parameter' }) };
  }

  const platform = detectPlatform(url);
  console.log(`Download request: platform=${platform}, url=${url}`);

  // Try strategies in order based on platform
  const strategies = getStrategies(platform);

  for (const strategy of strategies) {
    try {
      console.log(`Trying strategy: ${strategy.name}`);
      const result = await strategy.fn(url);
      if (result && result.downloadUrl) {
        console.log(`Success with ${strategy.name}`);
        return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: strategy.name }) };
      }
    } catch (e) {
      console.log(`Strategy ${strategy.name} failed: ${e.message}`);
    }
  }

  // All strategies failed
  return {
    statusCode: 422,
    headers,
    body: JSON.stringify({
      error: 'Could not extract download link.',
      fallback: true,
      platform
    })
  };
};

function detectPlatform(url) {
  if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram';
  if (/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url)) return 'tiktok';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/twitter\.com|x\.com/i.test(url)) return 'x';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  if (/linkedin\.com/i.test(url)) return 'linkedin';
  if (/threads\.net/i.test(url)) return 'threads';
  return 'other';
}

function getStrategies(platform) {
  // Order strategies by reliability per platform
  switch (platform) {
    case 'youtube':
      return [
        { name: 'microlink', fn: tryMicrolink },
        { name: 'og-video', fn: tryOgVideo }
      ];
    case 'instagram':
      return [
        { name: 'instagram-embed', fn: tryInstagramEmbed },
        { name: 'og-video', fn: tryOgVideo },
        { name: 'microlink', fn: tryMicrolink }
      ];
    case 'tiktok':
      return [
        { name: 'tiktok-embed', fn: tryTikTokEmbed },
        { name: 'tikwm', fn: tryTikwm },
        { name: 'og-video', fn: tryOgVideo },
        { name: 'microlink', fn: tryMicrolink }
      ];
    case 'x':
      return [
        { name: 'twitter-syndication', fn: tryTwitterSyndication },
        { name: 'og-video', fn: tryOgVideo },
        { name: 'microlink', fn: tryMicrolink }
      ];
    case 'facebook':
      return [
        { name: 'og-video', fn: tryOgVideo },
        { name: 'microlink', fn: tryMicrolink }
      ];
    default:
      return [
        { name: 'og-video', fn: tryOgVideo },
        { name: 'microlink', fn: tryMicrolink }
      ];
  }
}

// ── STRATEGY: Microlink (reliable for YouTube) ──────────────
async function tryMicrolink(url) {
  const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&video=true&audio=false`;
  const res = await fetchWithTimeout(apiUrl, {}, 15000);
  const data = await res.json();

  if (data.status === 'success' && data.data) {
    const videoUrl = data.data.video && data.data.video.url;
    if (videoUrl) {
      return { downloadUrl: videoUrl, filename: null };
    }
  }
  return null;
}

// ── STRATEGY: Instagram embed page scraping ─────────────────
async function tryInstagramEmbed(url) {
  // Normalize to embed URL
  const match = url.match(/(reel|p)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;

  const embedUrl = `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
  const res = await fetchWithTimeout(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  }, 12000);

  const html = await res.text();

  // Look for video URL in embed page
  const videoPatterns = [
    /video_url":"([^"]+)"/,
    /"contentUrl":"([^"]+)"/,
    /og:video:secure_url"\s+content="([^"]+)"/,
    /og:video"\s+content="([^"]+)"/,
    /property="og:video"\s+content="([^"]+)"/,
    /src="(https:\/\/[^"]*\.mp4[^"]*)"/,
    /video_versions.*?url":"([^"]+)"/
  ];

  for (const pattern of videoPatterns) {
    const m = html.match(pattern);
    if (m && m[1]) {
      let videoUrl = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      if (videoUrl.startsWith('http')) {
        return { downloadUrl: videoUrl, filename: `instagram_${match[2]}.mp4` };
      }
    }
  }

  // Look for image if no video
  const imgPatterns = [
    /display_url":"([^"]+)"/,
    /og:image"\s+content="([^"]+)"/,
    /property="og:image"\s+content="([^"]+)"/
  ];

  for (const pattern of imgPatterns) {
    const m = html.match(pattern);
    if (m && m[1]) {
      let imgUrl = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      if (imgUrl.startsWith('http')) {
        return { downloadUrl: imgUrl, filename: `instagram_${match[2]}.jpg` };
      }
    }
  }

  return null;
}

// ── STRATEGY: TikTok embed page ─────────────────────────────
async function tryTikTokEmbed(url) {
  // Try to get video from TikTok's oEmbed
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetchWithTimeout(oembedUrl, {}, 10000);
  const data = await res.json();

  if (data.thumbnail_url) {
    // oEmbed doesn't give video URL directly, but try the page
    const pageRes = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      },
      redirect: 'follow'
    }, 12000);

    const html = await pageRes.text();

    const videoPatterns = [
      /downloadAddr":"([^"]+)"/,
      /playAddr":"([^"]+)"/,
      /"contentUrl":"([^"]+)"/,
      /og:video:secure_url"\s+content="([^"]+)"/,
      /og:video"\s+content="([^"]+)"/,
      /property="og:video"\s+content="([^"]+)"/
    ];

    for (const pattern of videoPatterns) {
      const m = html.match(pattern);
      if (m && m[1]) {
        let videoUrl = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        if (videoUrl.startsWith('http')) {
          return { downloadUrl: videoUrl, filename: 'tiktok_video.mp4' };
        }
      }
    }
  }

  return null;
}

// ── STRATEGY: TikWM (TikTok specific) ──────────────────────
async function tryTikwm(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await fetchWithTimeout(apiUrl, {}, 12000);
  const data = await res.json();

  if (data.code === 0 && data.data) {
    const dlUrl = data.data.play || data.data.hdplay || data.data.wmplay;
    if (dlUrl) {
      return { downloadUrl: dlUrl, filename: 'tiktok_video.mp4' };
    }
    // Images (slideshow)
    if (data.data.images && data.data.images.length > 0) {
      return { downloadUrl: data.data.images[0], filename: 'tiktok_image.jpg' };
    }
  }
  return null;
}

// ── STRATEGY: Twitter syndication API ───────────────────────
async function tryTwitterSyndication(url) {
  const tweetIdMatch = url.match(/status\/(\d+)/);
  if (!tweetIdMatch) return null;

  const tweetId = tweetIdMatch[1];
  const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`;

  const res = await fetchWithTimeout(syndicationUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }, 10000);

  const data = await res.json();

  // Look for video in mediaDetails
  if (data.mediaDetails && data.mediaDetails.length > 0) {
    for (const media of data.mediaDetails) {
      if (media.video_info && media.video_info.variants) {
        // Get highest quality mp4
        const mp4s = media.video_info.variants
          .filter(v => v.content_type === 'video/mp4')
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        if (mp4s.length > 0) {
          return { downloadUrl: mp4s[0].url, filename: `twitter_${tweetId}.mp4` };
        }
      }
      // Image
      if (media.media_url_https) {
        return { downloadUrl: media.media_url_https, filename: `twitter_${tweetId}.jpg` };
      }
    }
  }

  // Look for photos
  if (data.photos && data.photos.length > 0) {
    return { downloadUrl: data.photos[0].url, filename: `twitter_${tweetId}.jpg` };
  }

  return null;
}

// ── STRATEGY: Generic OG video tag extraction ───────────────
async function tryOgVideo(url) {
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html'
    },
    redirect: 'follow'
  }, 12000);

  const html = await res.text();

  // Look for video URLs in meta tags
  const videoPatterns = [
    /property="og:video:secure_url"\s+content="([^"]+)"/,
    /property="og:video"\s+content="([^"]+)"/,
    /content="([^"]+)"\s+property="og:video:secure_url"/,
    /content="([^"]+)"\s+property="og:video"/,
    /name="twitter:player:stream"\s+content="([^"]+)"/,
    /content="([^"]+)"\s+name="twitter:player:stream"/,
    /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/,
    /"videoUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/
  ];

  for (const pattern of videoPatterns) {
    const m = html.match(pattern);
    if (m && m[1]) {
      let videoUrl = m[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
      if (videoUrl.startsWith('http') && !videoUrl.includes('embed')) {
        return { downloadUrl: videoUrl, filename: 'video.mp4' };
      }
    }
  }

  // Look for image as fallback
  const imgPatterns = [
    /property="og:image"\s+content="([^"]+)"/,
    /content="([^"]+)"\s+property="og:image"/
  ];

  for (const pattern of imgPatterns) {
    const m = html.match(pattern);
    if (m && m[1] && m[1].startsWith('http')) {
      return { downloadUrl: m[1].replace(/&amp;/g, '&'), filename: 'image.jpg', type: 'image' };
    }
  }

  return null;
}

// ── HELPER: fetch with timeout ──────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
