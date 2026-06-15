require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /transcode-eraser-video
//
// Proxies the eraser upload to the Railway backend's /prepare-eraser.
// Browser fetches against external Railway URLs sometimes fail with
// "Failed to fetch" (corporate proxies, mobile carrier filters, browser
// extensions blocking *.up.railway.app, etc.). Routing through Netlify
// keeps the browser talking to the same origin it loaded the page from,
// so those edge networks can't block the request.

const RAILWAY_PREPARE_URL = 'https://web-production-8afc3.up.railway.app/prepare-eraser';

exports.handler = __wrapErr(async function (event) {
    const allowedOrigins = ['https://flipit.earnwith-ai.com', 'https://flipit-app.netlify.app'];
    const origin = event.headers?.origin || '';
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const headers = {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // The body is already JSON-stringified base64. Just pass it through —
    // no need to parse + re-stringify, which costs CPU for nothing on a
    // multi-MB string.
    if (!event.body || event.body.length < 50) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty body' }) };
    }

    try {
        const resp = await fetch(RAILWAY_PREPARE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: event.body,
            // Hard timeout below Netlify's 26s function cap so we never get
            // killed mid-request. Railway transcode is typically 5-15s.
            signal: AbortSignal.timeout(24000)
        });
        const text = await resp.text();
        return { statusCode: resp.status, headers, body: text };
    } catch (err) {
        console.error('Transcode proxy failed:', err?.message || err);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Transcode proxy failed: ' + (err?.message || 'unknown') })
        };
    }
});
