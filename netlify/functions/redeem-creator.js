require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /.netlify/functions/redeem-creator
//
// Issues a long-lived Pro token to anyone who knows the secret creator code
// stored in the FLIPIT_CREATOR_CODE env var. Same HMAC format as issue-pro-token
// so the existing _pro_verify.js gate accepts it automatically.
//
// Intended use: the owner (and only the owner) visits /creator.html?code=<secret>
// once per device to unlock Pro for that browser. The code is never exposed to
// the browser unless typed in the URL — keep that URL private.
//
// Request:  POST { code: '<creator-code>' }
// Response: 200 { token: 'flpt.<payload>.<sig>', expiresAt: <unix> }
//           401 { error: 'Invalid code' }
//           503 { error: 'Service temporarily unavailable.' }
//
// Required env vars:
//   FLIPIT_CREATOR_CODE   — random 32+ char secret only the owner knows
//   FLIPIT_TOKEN_SECRET   — same HMAC secret used by issue-pro-token

const crypto = require('crypto');

const TOKEN_PREFIX = 'flpt.';
const TOKEN_TTL_SECONDS = 5 * 365 * 24 * 60 * 60; // 5 years

exports.handler = __wrapErr( async function (event) {
    const allowedOrigins = [
        'https://flipit.earnwith-ai.com',
        'https://flipit-app.netlify.app'
    ];
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

    const creatorCode = process.env.FLIPIT_CREATOR_CODE;
    const tokenSecret = process.env.FLIPIT_TOKEN_SECRET;
    if (!creatorCode || !tokenSecret) {
        console.error('redeem-creator: missing FLIPIT_CREATOR_CODE or FLIPIT_TOKEN_SECRET');
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service temporarily unavailable.' }) };
    }
    if (String(creatorCode).length < 16) {
        console.error('redeem-creator: FLIPIT_CREATOR_CODE too short (need 16+ chars)');
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service temporarily unavailable.' }) };
    }

    let submitted = '';
    try {
        const body = JSON.parse(event.body || '{}');
        submitted = String(body.code || '').trim();
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }

    if (!submitted || !constantTimeEq(submitted, String(creatorCode))) {
        // Tiny delay to dampen brute force; real protection is the entropy of the secret.
        await new Promise(r => setTimeout(r, 250));
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid code' }) };
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
    const payload = {
        sid: 'creator-' + crypto.randomBytes(8).toString('hex'),
        kind: 'creator',
        iat: issuedAt,
        exp: expiresAt,
        v: 1
    };
    const token = mintToken(payload, tokenSecret);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ token, expiresAt })
    };
});

function mintToken(payload, secret) {
    const json = JSON.stringify(payload);
    const payloadB64 = base64UrlEncode(Buffer.from(json, 'utf8'));
    const sig = base64UrlEncode(
        crypto.createHmac('sha256', secret).update(payloadB64).digest()
    );
    return TOKEN_PREFIX + payloadB64 + '.' + sig;
}

function base64UrlEncode(buf) {
    return buf.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function constantTimeEq(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}
