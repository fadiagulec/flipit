exports.handler = async function(event) {
  const allowedOrigins = ['https://flipit-app.netlify.app'];
  const origin = event.headers?.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  // Media downloads require a dedicated media processing server.
  // For now, return a helpful message directing users to alternatives.
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      error: 'Media download is temporarily unavailable. Use the Extract & Flip button to get the script, or try a free downloader like savefrom.net or snapinsta.app for the media.'
    })
  };
};
