require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /.netlify/functions/issue-pro-token
//
// Verifies a Stripe Checkout session was actually paid, then issues an
// HMAC-signed token that unlocks Pro access in the frontend + backend.
//
// Closes the bug where anyone could navigate to /thank-you.html directly
// and have `localStorage.flipit_pro = 'yes'` set without paying.
//
// Request:  POST { session_id: 'cs_live_...' }
// Response: 200 { token: 'flpt.<payload>.<sig>', expiresIn: '1y' }
//           402 { error: 'Payment not completed for this session.' }
//           400 { error: 'Invalid session_id' }
//           503 { error: 'Service temporarily unavailable.' }
//
// Required env vars:
//   STRIPE_SECRET_KEY     — secret key from Stripe dashboard (sk_live_...)
//   FLIPIT_TOKEN_SECRET   — random 32+ char string for HMAC signing
//
// Frontend stores the returned token as `localStorage.flipit_pro` and
// sends it in the `X-Flipit-Pro` header on every gated request.
// Server-side gates re-verify the HMAC before granting Pro.

const crypto = require('crypto');
const { enforceTokenIssueQuota, rateLimitResponse } = require('./_rate_limit');

const TOKEN_PREFIX = 'flpt.';
const TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

exports.handler = __wrapErr( async function (event) {
    // CORS allowlist matching every other AI endpoint. Keeps the netlify.app
    // origin during the domain-migration window; remove after 30 days.
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

    // ── Rate limit gate (5 attempts/min per IP — Stripe API spam mitigation) ──
    const tokenQuota = await enforceTokenIssueQuota(event);
    if (!tokenQuota.allowed) return rateLimitResponse(headers, tokenQuota);

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const tokenSecret = process.env.FLIPIT_TOKEN_SECRET;
    if (!stripeKey || !tokenSecret) {
        console.error('issue-pro-token: missing STRIPE_SECRET_KEY or FLIPIT_TOKEN_SECRET');
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service temporarily unavailable.' }) };
    }

    let sessionId = '';
    try {
        const body = JSON.parse(event.body || '{}');
        sessionId = String(body.session_id || '').trim();
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }

    // Stripe Checkout session IDs look like cs_live_... or cs_test_...
    if (!/^cs_(live|test)_[A-Za-z0-9_]+$/.test(sessionId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid session_id' }) };
    }

    // Verify with Stripe API
    let session;
    try {
        const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + stripeKey,
                'Stripe-Version': '2024-06-20'
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!resp.ok) {
            const text = await resp.text();
            console.error('Stripe API non-OK:', resp.status, text.slice(0, 200));
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not verify payment.' }) };
        }
        session = await resp.json();
    } catch (err) {
        console.error('Stripe API call failed:', err && err.message);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not verify payment.' }) };
    }

    // Stripe says "paid" or "complete" once the customer has actually paid.
    const paid = session
        && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')
        && (session.status === 'complete' || session.status === 'open' && session.payment_status === 'paid');

    if (!paid) {
        return {
            statusCode: 402,
            headers,
            body: JSON.stringify({ error: 'Payment not completed for this session.' })
        };
    }

    // Mint an HMAC-signed token bound to this session
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
    const payload = {
        sid: sessionId,
        iat: issuedAt,
        exp: expiresAt,
        v: 1
    };
    const token = mintToken(payload, tokenSecret);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            token: token,
            expiresAt: expiresAt
        })
    };
});

// ── Token helpers (also used by the gated functions for verify) ───────────

function mintToken(payload, secret) {
    const json = JSON.stringify(payload);
    const payloadB64 = base64UrlEncode(Buffer.from(json, 'utf8'));
    const sig = sign(payloadB64, secret);
    return TOKEN_PREFIX + payloadB64 + '.' + sig;
}

function sign(data, secret) {
    return base64UrlEncode(crypto.createHmac('sha256', secret).update(data).digest());
}

function base64UrlEncode(buf) {
    return buf.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
