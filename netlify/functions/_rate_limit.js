// Shared per-IP rate limiter backed by Netlify Blobs. NOT a function endpoint
// (filename starts with `_` — but Netlify still bundles every .js in this dir
// so the file has to be valid handler-bearing JS).
//
// USAGE in any gated function:
//   const { isProRequest } = require('./_pro_verify');
//   const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');
//   ...
//   const isPro = isProRequest(event);
//   const quota = await enforceAiQuota(event, isPro);
//   if (!quota.allowed) return rateLimitResponse(headers, quota);
//
// USAGE in issue-pro-token:
//   const { enforceTokenIssueQuota, rateLimitResponse } = require('./_rate_limit');
//   const tokenQuota = await enforceTokenIssueQuota(event);
//   if (!tokenQuota.allowed) return rateLimitResponse(headers, tokenQuota);
//
// Limits:
//   Free AI calls:   3 / day per IP
//   Pro AI calls:    50 / day  AND  1000 / month per IP (whichever hits first)
//   issue-pro-token: 5 / minute per IP (Stripe-spam mitigation)
//
// Storage:
//   Netlify Blobs store `flipit-quota`. Keys:
//     ai:{ipHash}:{YYYY-MM-DD}    — daily counter
//     ai:{ipHash}:{YYYY-MM}       — monthly counter
//     token:{ipHash}:{YYYYMMDDHHMI} — per-minute counter for issue-pro-token
//   IP is hashed with SHA256(IP + FLIPIT_TOKEN_SECRET), first 16 hex chars,
//   so blob keys are not reversible to raw IPs (privacy + length safety).
//
// Failure mode:
//   If Netlify Blobs is unavailable for any reason, fail OPEN (allow the
//   request, log a warning) rather than break the app for a $37 product.

const crypto = require('crypto');

// Lazy-load @netlify/blobs so a missing dep just disables rate limiting
// instead of crashing every function at import time.
let _getStore = null;
let _blobsLoaded = false;
function loadBlobs() {
    if (_blobsLoaded) return _getStore;
    _blobsLoaded = true;
    try {
        const blobs = require('@netlify/blobs');
        _getStore = blobs && blobs.getStore;
    } catch (err) {
        console.warn('[rate_limit] @netlify/blobs not available, rate limiting disabled:', err && err.message);
        _getStore = null;
    }
    return _getStore;
}

const STORE_NAME = 'flipit-quota';

const FREE_DAILY_LIMIT  = 3;
const PRO_DAILY_LIMIT   = 50;
const PRO_MONTHLY_LIMIT = 1000;
const TOKEN_PER_MIN_LIMIT = 5;

// ── IP helpers ────────────────────────────────────────────────────────────

function getClientIp(event) {
    try {
        const headers = event && event.headers ? event.headers : {};
        const direct = headers['x-nf-client-connection-ip'] || headers['X-NF-Client-Connection-Ip'];
        if (direct) return String(direct).trim();
        const xff = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
        if (xff) {
            const first = String(xff).split(',')[0].trim();
            if (first) return first;
        }
    } catch {}
    return 'unknown';
}

function hashIp(ip) {
    const secret = process.env.FLIPIT_TOKEN_SECRET || '';
    const h = crypto.createHash('sha256').update(String(ip) + secret).digest('hex');
    return h.slice(0, 16);
}

// ── Time helpers (UTC) ────────────────────────────────────────────────────

function nowParts(d = new Date()) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return {
        day:   `${yyyy}-${mm}-${dd}`,
        month: `${yyyy}-${mm}`,
        minute:`${yyyy}${mm}${dd}${hh}${mi}`
    };
}

function secondsTillMidnightUtc(d = new Date()) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
    return Math.max(1, Math.floor((next.getTime() - d.getTime()) / 1000));
}

function secondsTillEndOfMonthUtc(d = new Date()) {
    // First day of next month, 00:00 UTC
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    return Math.max(1, Math.floor((next.getTime() - d.getTime()) / 1000));
}

function secondsTillNextMinute(d = new Date()) {
    const next = new Date(d.getTime());
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(next.getUTCMinutes() + 1);
    return Math.max(1, Math.floor((next.getTime() - d.getTime()) / 1000));
}

// ── Blob helpers (atomic-ish increment) ───────────────────────────────────

async function readCount(store, key) {
    try {
        const v = await store.get(key, { type: 'json' });
        if (v && typeof v.count === 'number') return v.count;
    } catch (err) {
        // Treat missing keys / decode failures as zero
    }
    return 0;
}

async function writeCount(store, key, count) {
    try {
        await store.setJSON(key, { count, updatedAt: Date.now() });
    } catch (err) {
        console.warn('[rate_limit] setJSON failed for', key, err && err.message);
    }
}

function getStoreSafe() {
    const factory = loadBlobs();
    if (!factory) return null;
    try {
        // Try ambient context first (works when Netlify Functions runtime
        // auto-injects NETLIFY_BLOBS_CONTEXT).
        return factory(STORE_NAME);
    } catch (err) {
        // Ambient context missing — try explicit siteID + token. This works
        // if the user has set NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN as
        // function env vars (one-time setup; see _rate_limit.js header).
        const siteID = process.env.NETLIFY_SITE_ID;
        const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
        if (siteID && token) {
            try {
                return factory({ name: STORE_NAME, siteID, token, consistency: 'eventual' });
            } catch (err2) {
                console.warn('[rate_limit] explicit-creds getStore also failed:', err2 && err2.message);
            }
        }
        console.warn('[rate_limit] getStore failed, falling back to in-memory:', err && err.message);
        return null;
    }
}

// ── In-memory fallback store (per warm Lambda instance) ──────────────────
// When Netlify Blobs is unavailable, we maintain a simple Map keyed by
// `ai:{ipHash}:{day}` to enforce limits within a single warm instance.
// This isn't durable across instances or cold starts, but it stops the
// "anyone can spam thousands of free flips" worst case. The Anthropic
// account-level rate limit acts as a backstop for distributed abuse.
const _memCounts = new Map(); // key → { count, expiresAt }

function memRead(key) {
    const e = _memCounts.get(key);
    if (!e) return 0;
    if (Date.now() > e.expiresAt) {
        _memCounts.delete(key);
        return 0;
    }
    return e.count;
}

function memWrite(key, count, ttlSec) {
    _memCounts.set(key, { count, expiresAt: Date.now() + ttlSec * 1000 });
    // Cheap GC: prune up to 100 expired entries per write to keep memory bounded.
    if (_memCounts.size > 1000) {
        let pruned = 0;
        const now = Date.now();
        for (const [k, v] of _memCounts) {
            if (now > v.expiresAt) { _memCounts.delete(k); if (++pruned > 100) break; }
        }
    }
}

// ── Public: AI quota gate ─────────────────────────────────────────────────

async function enforceAiQuota(event, isPro) {
    const store = getStoreSafe();
    const ipHash = hashIp(getClientIp(event));
    const t = nowParts();
    const dayKey   = `ai:${ipHash}:${t.day}`;
    const monthKey = `ai:${ipHash}:${t.month}`;

    // Pick storage backend: prefer Blobs (cross-instance, persistent), fall
    // back to in-memory (per-warm-instance) when Blobs is unavailable.
    const readKey = async (k) => store ? await readCount(store, k) : memRead(k);
    const writeKey = async (k, c, ttl) => {
        if (store) await writeCount(store, k, c);
        else memWrite(k, c, ttl);
    };

    if (!isPro) {
        const dayCount = await readKey(dayKey);
        if (dayCount >= FREE_DAILY_LIMIT) {
            return {
                allowed: false,
                limit: FREE_DAILY_LIMIT,
                remaining: 0,
                scope: 'day',
                proCapHit: null,
                retryAfterSec: secondsTillMidnightUtc()
            };
        }
        const newCount = dayCount + 1;
        await writeKey(dayKey, newCount, secondsTillMidnightUtc());
        return {
            allowed: true,
            limit: FREE_DAILY_LIMIT,
            remaining: Math.max(0, FREE_DAILY_LIMIT - newCount),
            scope: 'day',
            proCapHit: null,
            degraded: !store
        };
    }

    // Pro path: enforce both daily and monthly caps
    const [dayCount, monthCount] = await Promise.all([
        readKey(dayKey),
        readKey(monthKey)
    ]);

    if (dayCount >= PRO_DAILY_LIMIT) {
        return {
            allowed: false,
            limit: PRO_DAILY_LIMIT,
            remaining: 0,
            scope: 'day',
            proCapHit: 'daily',
            retryAfterSec: secondsTillMidnightUtc()
        };
    }
    if (monthCount >= PRO_MONTHLY_LIMIT) {
        return {
            allowed: false,
            limit: PRO_MONTHLY_LIMIT,
            remaining: 0,
            scope: 'month',
            proCapHit: 'monthly',
            retryAfterSec: secondsTillEndOfMonthUtc()
        };
    }

    const newDay = dayCount + 1;
    const newMonth = monthCount + 1;
    await Promise.all([
        writeKey(dayKey, newDay, secondsTillMidnightUtc()),
        writeKey(monthKey, newMonth, secondsTillEndOfMonthUtc())
    ]);

    return {
        allowed: true,
        limit: PRO_DAILY_LIMIT,
        remaining: Math.max(0, PRO_DAILY_LIMIT - newDay),
        scope: 'day',
        proCapHit: null,
        degraded: !store
    };
}

// ── Public: token-issue quota gate ────────────────────────────────────────

async function enforceTokenIssueQuota(event) {
    const store = getStoreSafe();
    const ipHash = hashIp(getClientIp(event));
    const t = nowParts();
    const key = `token:${ipHash}:${t.minute}`;

    const readKey = async (k) => store ? await readCount(store, k) : memRead(k);
    const writeKey = async (k, c, ttl) => {
        if (store) await writeCount(store, k, c);
        else memWrite(k, c, ttl);
    };

    const count = await readKey(key);

    if (count >= TOKEN_PER_MIN_LIMIT) {
        return {
            allowed: false,
            limit: TOKEN_PER_MIN_LIMIT,
            remaining: 0,
            scope: 'minute',
            proCapHit: null,
            retryAfterSec: secondsTillNextMinute()
        };
    }

    const newCount = count + 1;
    await writeKey(key, newCount, secondsTillNextMinute());

    return {
        allowed: true,
        limit: TOKEN_PER_MIN_LIMIT,
        remaining: Math.max(0, TOKEN_PER_MIN_LIMIT - newCount),
        scope: 'minute',
        proCapHit: null,
        degraded: !store
    };
}

// ── Public: peek (no write) for tests / debug ─────────────────────────────

async function peek(event) {
    const store = getStoreSafe();
    const ipHash = hashIp(getClientIp(event));
    const t = nowParts();
    if (!store) return { dailyCount: 0, monthlyCount: 0, degraded: true };
    const [dailyCount, monthlyCount] = await Promise.all([
        readCount(store, `ai:${ipHash}:${t.day}`),
        readCount(store, `ai:${ipHash}:${t.month}`)
    ]);
    return { dailyCount, monthlyCount };
}

// ── Public: 429 response builder ──────────────────────────────────────────

function rateLimitResponse(corsHeaders, info) {
    const retry = (info && info.retryAfterSec) || 60;
    const limit = info && typeof info.limit === 'number' ? info.limit : 0;
    const scope = (info && info.scope) || 'day';

    let message;
    if (info && info.proCapHit === 'monthly') {
        message = "You've hit your Pro monthly cap (1000 flips). Email support@flipit.app for a custom plan.";
    } else if (info && info.proCapHit === 'daily') {
        message = "You've hit your Pro daily cap (50 flips). Resets at midnight UTC.";
    } else if (scope === 'minute') {
        message = "Too many requests. Please wait a moment and try again.";
    } else {
        message = "Free tier limit reached (3 flips/day). Resets at midnight UTC, or upgrade to Pro for $57 lifetime.";
    }

    return {
        statusCode: 429,
        headers: {
            ...(corsHeaders || {}),
            'Retry-After': String(retry),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Scope': scope
        },
        body: JSON.stringify({
            error: message,
            code: 'rate_limited',
            retryAfterSec: retry
        })
    };
}

// Netlify treats every .js file in functions/ as a function endpoint.
// Provide a benign 404 handler so direct probes return cleanly instead of
// crashing with "handler is undefined" (mirrors _pro_verify.js).
async function handler() {
    return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not found' })
    };
}

module.exports = {
    getClientIp,
    enforceAiQuota,
    enforceTokenIssueQuota,
    peek,
    rateLimitResponse,
    handler
};
