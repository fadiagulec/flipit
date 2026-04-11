// Netlify function proxying the Railway backend's /download endpoint.
// The Railway service extracts the direct video via yt-dlp and returns it as
// base64 in `videoData`. We forward that payload unchanged so the browser can
// materialize the file locally without redirecting to a third-party site.

const https = require('https');

const RAILWAY_BACKEND = 'https://web-production-8afc3.up.railway.app';

function postJson(targetUrl, payload, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const u = new URL(targetUrl);
    const req = https.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'Accept': 'application/json'
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: null, raw }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!url) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL required' }) };
    }

    // Proxy straight through to Railway. It handles Instagram, TikTok, YT, etc.
    const result = await postJson(`${RAILWAY_BACKEND}/download`, { url });

    if (result.status === 200 && result.data && result.data.success && result.data.videoData) {
      // Netlify functions have a ~6MB response cap. Forward only if payload
      // fits; otherwise signal the client to call Railway directly.
      const bodyStr = JSON.stringify(result.data);
      if (Buffer.byteLength(bodyStr, 'utf8') < 5_500_000) {
        return { statusCode: 200, headers, body: bodyStr };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'too-large', backend: `${RAILWAY_BACKEND}/download` })
      };
    }

    if (result.data) {
      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'backend-no-data', upstream: result.status })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
