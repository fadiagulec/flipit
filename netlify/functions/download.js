const fetch = require('node-fetch');

const COBALT_INSTANCES = [
  'https://cobalt.api.timelessnesses.me/',
  'https://co.wuk.sh/',
  'https://cobalt-api.nico.moe/',
  'https://cobalt.privacydev.net/'
];

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
    if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL required' }) };

    for (const instance of COBALT_INSTANCES) {
      try {
        const res = await fetch(instance, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, videoQuality: 'max', downloadMode: 'auto' }),
          timeout: 8000
        });

        if (!res.ok) continue;
        const data = await res.json();

        if (data.status === 'error' || !data.status) continue;

        return { statusCode: 200, headers, body: JSON.stringify(data) };
      } catch (e) {
        console.log(`Instance ${instance} failed:`, e.message);
        continue;
      }
    }

    return { statusCode: 503, headers, body: JSON.stringify({ error: 'All download instances unavailable' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
