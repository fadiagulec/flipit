// Shared HMAC token verifier. NOT a Netlify function endpoint
// (filename starts with `_` and only exports helpers — Netlify will
// still try to bundle it, so it has to be valid handler-less JS).
//
// USAGE in any gated function:
//   const { isProRequest } = require('./_pro_verify');
//   const isPro = isProRequest(event);  // true if X-Flipit-Pro header is a valid HMAC token

const crypto = require('crypto');
const TOKEN_PREFIX = 'flpt.';

function isProRequest(event) {
    try {
        const secret = process.env.FLIPIT_TOKEN_SECRET;
        if (!secret) return false;
        const headers = event.headers || {};
        const token = headers['x-flipit-pro'] || headers['X-Flipit-Pro'] || '';
        return verifyToken(String(token), secret);
    } catch {
        return false;
    }
}

function verifyToken(token, secret) {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return false;
    const rest = token.slice(TOKEN_PREFIX.length);
    const dot = rest.lastIndexOf('.');
    if (dot < 1) return false;
    const payloadB64 = rest.slice(0, dot);
    const sig = rest.slice(dot + 1);
    const expected = base64UrlEncode(crypto.createHmac('sha256', secret).update(payloadB64).digest());
    if (!constantTimeEq(sig, expected)) return false;

    let payload;
    try {
        const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        payload = JSON.parse(json);
    } catch {
        return false;
    }
    if (!payload || typeof payload.exp !== 'number') return false;
    if (Math.floor(Date.now() / 1000) >= payload.exp) return false;
    return true;
}

function base64UrlEncode(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantTimeEq(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// Netlify treats every .js file in functions/ as a function endpoint.
// Define a benign 404 handler so direct probes return cleanly instead of
// crashing with "handler is undefined" (which leaks the function shape).
// IMPORTANT: handler must be on the same module.exports object that
// holds isProRequest/verifyToken so all three coexist.
async function handler() {
    return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not found' })
    };
}

module.exports = { isProRequest, verifyToken, handler };
