const https = require('https');
const http = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: {} }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL required' }) };

    // Try instavideosave API (works for Instagram, no auth needed)
    if (url.includes('instagram.com')) {
      try {
        const apiUrl = `https://api.instavideosave.com/allinone?url=${encodeURIComponent(url)}`;
        const result = await httpGet(apiUrl);
        if (result.data && result.data.media && result.data.media.length > 0) {
          const media = result.data.media;
          if (media.length === 1) {
            return { statusCode: 200, headers, body: JSON.stringify({ status: 'redirect', url: media[0].url }) };
          } else {
            return { statusCode: 200, headers, body: JSON.stringify({
              status: 'picker',
              picker: media.map(m => ({ url: m.url, type: m.type || 'video' }))
            })};
          }
        }
      } catch(e) {
        console.log('instavideosave failed:', e.message);
      }
    }

    // Return fallback signal so client opens a helper
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'use-helper', url }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
