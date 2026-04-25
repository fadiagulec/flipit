// Netlify function: /download
// TikTok/YouTube -> Railway yt-dlp (base64), Twitter/X -> syndication API,
// Instagram -> embed scrape + downloader links, others -> Cobalt/Microlink/OG

const fetch = require('node-fetch');
const COBALT_URL  = 'https://cobalt-api-production-4129.up.railway.app/';
const RAILWAY_URL = 'https://web-production-8afc3.up.railway.app/download';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let url;
  try {
    const body = JSON.parse(event.body || '{}');
    url = (body.url || '').trim();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url parameter' }) };

  const platform = detectPlatform(url);

  // 1. TikTok + YouTube: Railway yt-dlp returns base64 video
  if (platform === 'tiktok' || platform === 'youtube') {
    try {
      const result = await tryRailway(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'railway', platform }) };
    } catch (e) { console.log('Railway failed:', e.message); }
  }

  // 2. Twitter/X: syndication API
  if (platform === 'x') {
    try {
      const result = await tryTwitter(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'twitter', platform }) };
    } catch (e) { console.log('Twitter failed:', e.message); }
  }

  // 3. Cobalt for non-Instagram platforms
  if (platform !== 'instagram') {
    try {
      const result = await tryCobalt(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'cobalt', platform }) };
    } catch (e) { console.log('Cobalt failed:', e.message); }
  }

  // 4. Instagram: embed scrape attempt, then helpful downloader links
  if (platform === 'instagram') {
    try {
      const result = await tryInstagramEmbed(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'ig-embed', platform }) };
    } catch (e) { console.log('Instagram embed failed:', e.message); }
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        downloadUrl: null, openUrl: url, platform, source: 'manual',
        instruction: 'Instagram blocks server downloads. Open in the app, tap ... then Save.',
        downloaders: [
          { name: 'SnapInsta', url: 'https://snapinsta.app' },
          { name: 'SaveFrom', url: 'https://savefrom.net' },
          { name: 'iGram', url: 'https://igram.world' }
        ]
      })
    };
  }

  // 5. Microlink fallback
  try {
    const result = await tryMicrolink(url);
    if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'microlink', platform }) };
  } catch (e) { console.log('Microlink failed:', e.message); }

  // 6. OG meta tags
  try {
    const result = await tryOgMeta(url);
    if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'og-meta', platform }) };
  } catch (e) { console.log('OG meta failed:', e.message); }

  // 7. Generic fallback
  const instructions = {
    tiktok: 'Open in TikTok app, tap Share, Save video.',
    youtube: 'Use YouTube Premium download or save to Watch Later.',
    x: 'Open in X, long-press image, Save image.',
    facebook: 'Open in Facebook app, tap ..., Save.',
    linkedin: 'Open in LinkedIn, tap ..., Save.',
    threads: 'Open in Threads, tap Share, Save.',
    other: 'Open the post and use the built-in save option.'
  };
  return {
    statusCode: 200, headers,
    body: JSON.stringify({ downloadUrl: null, openUrl: url, platform, source: 'manual', instruction: instructions[platform] || instructions.other })
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

async function tryRailway(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(RAILWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });
    const data = await res.json();
    if (!data.success || !data.videoData) return null;
    const estimatedBytes = (data.videoData.length * 3) / 4;
    if (estimatedBytes > 5.5 * 1024 * 1024) return null; // Netlify 6MB cap
    return {
      videoData: data.videoData,
      ext: data.ext || '.mp4',
      type: 'video',
      filename: 'flipit-video' + (data.ext || '.mp4')
    };
  } finally { clearTimeout(timeout); }
}

async function tryCobalt(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(COBALT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ url, videoQuality: 'max', filenameStyle: 'basic' }),
      signal: controller.signal
    });
    const data = await res.json();
    if ((data.status === 'tunnel' || data.status === 'redirect' || data.status === 'stream') && data.url) {
      return {
        downloadUrl: data.url,
        filename: data.filename || null,
        type: data.filename && /\.(jpg|png|webp)/i.test(data.filename) ? 'image' : 'video'
      };
    }
    if (data.status === 'picker' && data.picker && data.picker.length > 0) {
      const items = data.picker.map(p => ({
        url: p.url,
        type: p.type || (/\.(jpg|png|webp)/i.test(p.url) ? 'image' : 'video'),
        thumb: p.thumb || null
      }));
      return { downloadUrl: items[0].url, carousel: items, filename: data.filename || null, type: items[0].type, mediaCount: items.length };
    }
    return null;
  } finally { clearTimeout(timeout); }
}

async function tryTwitter(url) {
  const match = url.match(/status\/(\d+)/);
  if (!match) return null;
  const tweetId = match[1];
  for (const token of ['x', 'a']) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('https://cdn.syndication.twimg.com/tweet-result?id=' + tweetId + '&lang=en&token=' + token, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal
      });
      clearTimeout(timeout);
      const text = await res.text();
      if (!text || text.startsWith('<!')) continue;
      const data = JSON.parse(text);
      const mediaList = data.mediaDetails || [];
      if (mediaList.length > 0) {
        const items = mediaList.map(m => {
          if (m.video_info && m.video_info.variants) {
            const best = m.video_info.variants.filter(v => v.content_type === 'video/mp4').sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            return best ? { url: best.url, type: 'video' } : null;
          }
          if (m.media_url_https) return { url: m.media_url_https + '?name=large', type: 'image' };
          return null;
        }).filter(Boolean);
        if (items.length > 1) return { downloadUrl: items[0].url, carousel: items, type: items[0].type, mediaCount: items.length, filename: 'tweet_' + tweetId };
        if (items.length === 1) return { downloadUrl: items[0].url, type: items[0].type, filename: 'tweet_' + tweetId + (items[0].type === 'video' ? '.mp4' : '.jpg') };
      }
      if (data.photos && data.photos.length > 0) {
        const items = data.photos.map(p => ({ url: p.url + '?name=large', type: 'image' }));
        if (items.length === 1) return { downloadUrl: items[0].url, type: 'image', filename: 'tweet_' + tweetId + '.jpg' };
        return { downloadUrl: items[0].url, carousel: items, type: 'image', mediaCount: items.length, filename: 'tweet_' + tweetId };
      }
    } catch (e) { continue; }
  }
  return null;
}

async function tryInstagramEmbed(url) {
  const scMatch = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  if (!scMatch) return null;
  const sc = scMatch[1];
  const embedUrl = 'https://www.instagram.com/p/' + sc + '/embed/captioned/';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'iframe',
        'Referer': 'https://www.instagram.com/'
      },
      redirect: 'follow', signal: controller.signal
    });
    clearTimeout(timeout);
    const html = await res.text();
    const videoPatterns = [/"video_url":"([^"]+)"/, /"contentUrl":"([^"]+)"/];
    for (const p of videoPatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http')) {
        return { downloadUrl: m[1].replace(/\\u0026/g, '&').replace(/\\/g, ''), type: 'video', filename: 'instagram_' + sc + '.mp4' };
      }
    }
    const imgPatterns = [/"display_url":"([^"]+)"/, /property="og:image"\s+content="([^"]+)"/];
    for (const p of imgPatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http') && !m[1].includes('150x150')) {
        return { downloadUrl: m[1].replace(/\\u0026/g, '&').replace(/\\/g, ''), type: 'image', filename: 'instagram_' + sc + '.jpg' };
      }
    }
  } catch (e) { clearTimeout(timeout); }
  return null;
}

async function tryMicrolink(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://api.microlink.io?url=' + encodeURIComponent(url) + '&video=true', { signal: controller.signal });
    const data = await res.json();
    if (data.status === 'success' && data.data) {
      if (data.data.video && data.data.video.url) return { downloadUrl: data.data.video.url, type: 'video', filename: null };
      if (data.data.image && data.data.image.url && data.data.image.url.startsWith('http') && data.data.image.width > 200 && data.data.image.height > 200) {
        return { downloadUrl: data.data.image.url, type: 'image', filename: null };
      }
    }
  } finally { clearTimeout(timeout); }
  return null;
}

async function tryOgMeta(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'Accept': 'text/html' },
      redirect: 'follow', signal: controller.signal
    });
    const html = await res.text();
    const videoP = [/property="og:video:secure_url"\s+content="([^"]+)"/, /property="og:video"\s+content="([^"]+)"/];
    for (const p of videoP) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http') && !m[1].includes('embed')) return { downloadUrl: m[1].replace(/&amp;/g, '&'), type: 'video', filename: 'video.mp4' };
    }
    const imgP = [/property="og:image"\s+content="([^"]+)"/, /name="twitter:image"\s+content="([^"]+)"/];
    for (const p of imgP) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http')) return { downloadUrl: m[1].replace(/&amp;/g, '&'), type: 'image', filename: 'image.jpg' };
    }
  } finally { clearTimeout(timeout); }
  return null;
}
