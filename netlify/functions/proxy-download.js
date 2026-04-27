// Netlify function: /proxy-download
// Server-side proxy for media URLs that block cross-origin browser fetches
// (e.g. LinkedIn CDN, Twitter twimg.com). Frontend calls this same-origin so
// it can download bytes instead of opening a new tab.
//
// GET /.netlify/functions/proxy-download?url=<urlencoded>&filename=<optional>
// Streams the upstream bytes back base64-encoded with a Content-Disposition
// attachment header so the browser saves the file.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — Netlify response cap is 6MB
const FETCH_TIMEOUT_MS = 25000;

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const params = (event.queryStringParameters || {});
    const rawUrl = params.url;
    if (!rawUrl) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid URL' })
      };
    }

    let decoded;
    try {
      decoded = decodeURIComponent(rawUrl);
    } catch {
      decoded = rawUrl;
    }

    let parsed;
    try {
      parsed = new URL(decoded);
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid URL' })
      };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid URL' })
      };
    }

    // Fetch the upstream resource
    let upstream;
    try {
      upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': '*/*'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
    } catch (err) {
      console.error('Proxy error:', err);
      return {
        statusCode: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not retrieve that file.' })
      };
    }

    if (!upstream.ok) {
      console.error('Proxy error: upstream returned', upstream.status);
      return {
        statusCode: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not retrieve that file.' })
      };
    }

    let arrayBuffer;
    try {
      arrayBuffer = await upstream.arrayBuffer();
    } catch (err) {
      console.error('Proxy error:', err);
      return {
        statusCode: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not retrieve that file.' })
      };
    }

    if (arrayBuffer.byteLength > MAX_BYTES) {
      return {
        statusCode: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'File too large to proxy. Try a shorter clip or a different platform.' })
      };
    }

    const buffer = Buffer.from(arrayBuffer);

    // Detect content type: prefer upstream header, then sniff, then default
    let contentType = upstream.headers.get('content-type');
    if (!contentType) {
      contentType = sniffMediaType(buffer) || 'application/octet-stream';
    }

    // Resolve filename: param > URL pathname tail > default
    const filename = sanitizeFilename(
      params.filename || extractFilenameFromUrl(parsed) || 'flipit-media'
    );

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'public, max-age=300'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('Proxy error:', err);
    return {
      statusCode: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Could not retrieve that file.' })
    };
  }
};

// Sniff first 12 bytes for common media signatures
function sniffMediaType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  // mp4 / iso-bmff: bytes 4..7 = "ftyp"
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return 'video/mp4';
  }
  // webm / matroska: 1A 45 DF A3
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) {
    return 'video/webm';
  }
  // jpeg: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
    return 'image/jpeg';
  }
  // png: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
    b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A
  ) {
    return 'image/png';
  }
  return null;
}

function extractFilenameFromUrl(parsed) {
  try {
    const path = parsed.pathname || '';
    const tail = path.split('/').filter(Boolean).pop();
    if (!tail) return null;
    // Strip query-like leftovers just in case
    return tail.split('?')[0] || null;
  } catch {
    return null;
  }
}

function sanitizeFilename(name) {
  if (!name) return 'flipit-media';
  // Strip quote, CR, LF, and any other control char (0x00-0x1F, 0x7F)
  let safe = String(name).replace(/["\r\n]/g, '').replace(/[\x00-\x1F\x7F]/g, '');
  safe = safe.trim();
  if (!safe) return 'flipit-media';
  // Cap length to a sane maximum
  if (safe.length > 200) safe = safe.slice(0, 200);
  return safe;
}
