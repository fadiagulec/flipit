// Netlify function: /download
// TikTok/YouTube -> Railway yt-dlp (base64), Twitter/X -> syndication API,
// Instagram -> embed scrape + downloader links, others -> Cobalt/Microlink/OG

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

  // 1. TikTok + YouTube + Instagram: Railway yt-dlp returns base64 video
  // Instagram needs INSTAGRAM_COOKIES_B64 set on the Railway service to work.
  if (platform === 'tiktok' || platform === 'youtube' || platform === 'instagram') {
    try {
      const result = await tryRailway(url);
      if (result && !result._tooLarge) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'railway', platform }) };
      if (result && result._tooLarge) {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            downloadUrl: null, openUrl: url, platform, source: 'too-large',
            instruction: `Video is too large (${result.sizeMb || '>4'} MB) to deliver through this connection. Try a shorter clip.`
          })
        };
      }
    } catch (e) { console.log('Railway failed:', e.message); }
  }

  // 2. Twitter/X: syndication API
  if (platform === 'x') {
    try {
      const result = await tryTwitter(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'twitter', platform }) };
    } catch (e) { console.log('Twitter failed:', e.message); }
  }

  // 3. LinkedIn: scrape page for embedded video URLs before falling back
  if (platform === 'linkedin') {
    try {
      const result = await tryLinkedIn(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'linkedin-scrape', platform }) };
    } catch (e) { console.log('LinkedIn scrape failed:', e.message); }
  }

  // 4. Cobalt for non-Instagram platforms
  if (platform !== 'instagram') {
    try {
      const result = await tryCobalt(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'cobalt', platform }) };
    } catch (e) { console.log('Cobalt failed:', e.message); }
  }

  // 4. Instagram: embed scrape (Railway already tried above)
  if (platform === 'instagram') {
    try {
      const result = await tryInstagramEmbed(url);
      if (result) return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'ig-embed', platform }) };
    } catch (e) { console.log('Instagram embed failed:', e.message); }
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
    tiktok: 'Could not download this TikTok video. The video may be private, region-locked, or temporarily unavailable.',
    youtube: 'Could not download this YouTube video. It may be age-restricted, members-only, or region-locked.',
    instagram: 'Could not download this Instagram post. It may be private or temporarily unavailable.',
    x: 'Could not download this X/Twitter media. The tweet may be protected or deleted.',
    facebook: 'Could not download this Facebook video. The post may be private.',
    linkedin: 'Could not download this LinkedIn video. The post may not have a publicly embedded video.',
    threads: 'Could not download this Threads post. The post may be private.',
    other: 'Could not download from this URL.'
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
    // Netlify caps response bodies at 6MB. The base64 string itself is what
    // gets serialized into the JSON body — so it's the base64 length that
    // must fit, not the decoded binary size. Old code checked binary > 5.5MB,
    // which lets through base64 of ~7.3MB and causes Netlify to truncate the
    // response → corrupt downloads. Cap at 5MB of base64 (≈3.75MB binary).
    if (data.videoData.length > 5 * 1024 * 1024) {
      return { _tooLarge: true, sizeMb: data.size_mb };
    }
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

async function tryLinkedIn(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow', signal: controller.signal
    });
    clearTimeout(timeout);
    const html = await res.text();

    const cleanUrl = (s) => s.replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');

    // a. og:video meta tags
    const ogVideoPatterns = [
      /property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i,
      /property=["']og:video["']\s+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["']\s+property=["']og:video:secure_url["']/i,
      /content=["']([^"']+)["']\s+property=["']og:video["']/i
    ];
    for (const p of ogVideoPatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http')) {
        return { downloadUrl: cleanUrl(m[1]), type: 'video', filename: 'linkedin.mp4' };
      }
    }

    // b. progressiveStreams JSON pattern (LinkedIn video player config)
    const progMatch = html.match(/"progressiveStreams":\s*\[\s*\{[^}]*?"streamingLocations":\s*\[\s*\{[^}]*?"url":\s*"([^"]+)"/);
    if (progMatch && progMatch[1] && progMatch[1].startsWith('http')) {
      return { downloadUrl: cleanUrl(progMatch[1]), type: 'video', filename: 'linkedin.mp4' };
    }

    // c. contentUrl pointing to mp4
    const contentUrlMatch = html.match(/"contentUrl":\s*"([^"]+\.mp4[^"]*)"/);
    if (contentUrlMatch && contentUrlMatch[1] && contentUrlMatch[1].startsWith('http')) {
      return { downloadUrl: cleanUrl(contentUrlMatch[1]), type: 'video', filename: 'linkedin.mp4' };
    }

    // d. nested "video":{"url":"..."} patterns
    const videoObjPatterns = [
      /"video":\s*\{[^}]*?"url":\s*"([^"]+)"/,
      /"videoPlayMetadata"[\s\S]{0,500}?"url":\s*"([^"]+\.mp4[^"]*)"/
    ];
    for (const p of videoObjPatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http')) {
        return { downloadUrl: cleanUrl(m[1]), type: 'video', filename: 'linkedin.mp4' };
      }
    }

    // Image post fallback: og:image
    const ogImagePatterns = [
      /property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["']\s+property=["']og:image["']/i
    ];
    for (const p of ogImagePatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].startsWith('http')) {
        return { downloadUrl: cleanUrl(m[1]), type: 'image', filename: 'linkedin.jpg' };
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
