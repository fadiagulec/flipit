// Netlify function: /download
// Multi-strategy media download: video + images + carousels
// YouTube video: Microlink API (confirmed working)
// Twitter media: Syndication API (videos + images)
// All platforms: OG meta tags for video/image extraction
// Fallback: platform-specific save instructions

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

  // Strategy 1: Microlink API — video + image extraction
  try {
    const result = await tryMicrolink(url);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'microlink', platform }) };
    }
  } catch (e) {
    console.log('Microlink failed:', e.message);
  }

  // Strategy 2: Twitter syndication API — videos + images + carousels
  if (platform === 'x') {
    try {
      const result = await tryTwitter(url);
      if (result) {
        return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'twitter', platform }) };
      }
    } catch (e) {
      console.log('Twitter syndication failed:', e.message);
    }
  }

  // Strategy 3: OG meta tags — video AND image extraction
  try {
    const result = await tryOgMeta(url);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'og-meta', platform }) };
    }
  } catch (e) {
    console.log('OG meta failed:', e.message);
  }

  // No direct download — return save instructions
  const instructions = {
    instagram: 'Open in Instagram app → tap ••• → Save. For carousels, swipe to each image and screenshot, or use "Save to Collection".',
    tiktok: 'Open in TikTok app → tap Share arrow → tap "Save video". For photo posts, long-press the image → Save.',
    youtube: 'Use YouTube app download button (YouTube Premium) or save to Watch Later.',
    x: 'Open in X app → tap the image to fullscreen → long-press → "Save image". For videos, tap Share → Bookmark.',
    facebook: 'Open in Facebook app → tap ••• → Save video/photo.',
    linkedin: 'Open in LinkedIn app → tap ••• → Save.',
    threads: 'Open in Threads app → tap Share → Save.'
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      downloadUrl: null,
      openUrl: url,
      platform,
      instruction: instructions[platform] || 'Open the post and use the app\'s built-in save option.',
      source: 'manual'
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

// ── Microlink: extracts video AND image ─────────────────────
async function tryMicrolink(url) {
  const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&video=true`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    const data = await res.json();

    if (data.status === 'success' && data.data) {
      // Try video first
      if (data.data.video && data.data.video.url) {
        return { downloadUrl: data.data.video.url, filename: null, type: 'video' };
      }
      // Then try image (skip base64 placeholders and tiny icons)
      if (data.data.image && data.data.image.url &&
          !data.data.image.url.startsWith('data:') &&
          data.data.image.url.startsWith('http')) {
        // Check image dimensions if available — skip small icons
        const w = data.data.image.width || 999;
        const h = data.data.image.height || 999;
        if (w > 200 && h > 200) {
          return { downloadUrl: data.data.image.url, filename: null, type: 'image' };
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

// ── Twitter syndication: videos + images + carousels ────────
async function tryTwitter(url) {
  const match = url.match(/status\/(\d+)/);
  if (!match) return null;

  const tweetId = match[1];
  const endpoints = [
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=x`,
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=a`
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      const text = await res.text();
      if (!text || text.startsWith('<!')) continue;

      const data = JSON.parse(text);

      // Check mediaDetails for videos and images
      if (data.mediaDetails && data.mediaDetails.length > 0) {
        // Multiple media = carousel
        if (data.mediaDetails.length > 1) {
          const images = [];
          for (const media of data.mediaDetails) {
            if (media.video_info && media.video_info.variants) {
              const mp4s = media.video_info.variants
                .filter(v => v.content_type === 'video/mp4')
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
              if (mp4s.length > 0) {
                images.push({ url: mp4s[0].url, type: 'video' });
              }
            } else if (media.media_url_https) {
              images.push({ url: media.media_url_https + '?name=large', type: 'image' });
            }
          }
          if (images.length > 0) {
            return {
              downloadUrl: images[0].url,
              carousel: images,
              filename: `twitter_${tweetId}_carousel`,
              type: images[0].type,
              mediaCount: images.length
            };
          }
        }

        // Single media
        const media = data.mediaDetails[0];
        if (media.video_info && media.video_info.variants) {
          const mp4s = media.video_info.variants
            .filter(v => v.content_type === 'video/mp4')
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (mp4s.length > 0) {
            return { downloadUrl: mp4s[0].url, filename: `twitter_${tweetId}.mp4`, type: 'video' };
          }
        }
        if (media.media_url_https) {
          return { downloadUrl: media.media_url_https + '?name=large', filename: `twitter_${tweetId}.jpg`, type: 'image' };
        }
      }

      // Check photos array
      if (data.photos && data.photos.length > 0) {
        if (data.photos.length > 1) {
          const images = data.photos.map((p, i) => ({
            url: p.url + '?name=large',
            type: 'image'
          }));
          return {
            downloadUrl: images[0].url,
            carousel: images,
            filename: `twitter_${tweetId}_carousel`,
            type: 'image',
            mediaCount: images.length
          };
        }
        return { downloadUrl: data.photos[0].url + '?name=large', filename: `twitter_${tweetId}.jpg`, type: 'image' };
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// ── OG meta tags: video AND image extraction ────────────────
async function tryOgMeta(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    const html = await res.text();

    // Try video first
    const videoPatterns = [
      /property="og:video:secure_url"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:video:secure_url"/,
      /property="og:video"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:video"/,
      /name="twitter:player:stream"\s+content="([^"]+)"/
    ];

    for (const pattern of videoPatterns) {
      const m = html.match(pattern);
      if (m && m[1] && m[1].startsWith('http') && !m[1].includes('embed')) {
        return { downloadUrl: m[1].replace(/&amp;/g, '&'), filename: 'video.mp4', type: 'video' };
      }
    }

    // Then try image (get the largest/best quality)
    const imagePatterns = [
      /property="og:image"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:image"/,
      /name="twitter:image"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+name="twitter:image"/,
      /name="twitter:image:src"\s+content="([^"]+)"/
    ];

    for (const pattern of imagePatterns) {
      const m = html.match(pattern);
      if (m && m[1] && m[1].startsWith('http') && !m[1].startsWith('data:')) {
        return { downloadUrl: m[1].replace(/&amp;/g, '&'), filename: 'image.jpg', type: 'image' };
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}
