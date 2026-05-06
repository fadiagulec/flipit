// Netlify Function: /.netlify/functions/trending
//
// Returns the day's most-engaged TikToks for a niche/hashtag, via Apify's
// clockworks/tiktok-scraper actor. Each result is one viral post the user
// can one-click flip into their own script.
//
// Request:  POST { niche: 'fitness' | hashtag: 'fitnessmom', count?: 10 }
// Response: 200 { results: [{ url, thumbnail, author, likes, views,
//                             caption, platform: 'tiktok', cachedAt }] }
//           503 if APIFY_TOKEN missing
//           502 if Apify returns non-OK / times out
//
// Required env var:
//   APIFY_TOKEN  — from Apify Console → Settings → API & Integrations
//
// Cost shaping:
//   - Hammers Apify only when cache is stale (TTL: 1 hour per niche)
//   - Cache key: trending:tiktok:<niche-lower>:<YYYY-MM-DD-HH>
//   - Free tier (3 flips/day) and Pro daily (50/day) gates apply via _rate_limit

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');

const APIFY_ACTOR = 'clockworks~tiktok-scraper'; // tilde because Apify URL syntax replaces / with ~
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const APIFY_TIMEOUT_MS = 25000;

// niche → seed hashtag list. Anchors broad niches to known performant tags.
const NICHE_TO_HASHTAGS = {
    mommy:     ['momlife', 'momhacks', 'momsoftiktok'],
    home:      ['homehacks', 'cleantok', 'hometok'],
    food:      ['foodtok', 'recipe', 'easyrecipes'],
    fashion:   ['ootd', 'fashiontiktok', 'styletips'],
    lifestyle: ['lifestyle', 'dayinmylife', 'aestheticvibes'],
    beauty:    ['beautyhacks', 'skincaretiktok', 'makeuptutorial'],
    travel:    ['traveltips', 'traveltok', 'wanderlust'],
    fitness:   ['fitnesstips', 'gymtok', 'workoutroutine']
};

exports.handler = async function (event) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // ── Rate limit gate (counts towards daily quota) ────────
    const isPro = isProRequest(event);
    const quota = await enforceAiQuota(event, isPro);
    if (!quota.allowed) return rateLimitResponse(headers, quota);

    // ── Parse + validate input ──────────────────────────────
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }

    const niche = (typeof body.niche === 'string' ? body.niche : '').trim().toLowerCase();
    const rawHashtag = (typeof body.hashtag === 'string' ? body.hashtag : '').trim();
    const customHashtag = rawHashtag.replace(/^#/, '').replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 50);
    let count = parseInt(body.count, 10);
    if (!Number.isFinite(count)) count = 10;
    count = Math.max(3, Math.min(20, count));

    // Resolve hashtags to scrape
    let hashtags;
    if (customHashtag) {
        hashtags = [customHashtag];
    } else if (niche && NICHE_TO_HASHTAGS[niche]) {
        hashtags = NICHE_TO_HASHTAGS[niche];
    } else {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Provide either a known niche or a hashtag.' })
        };
    }

    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) {
        console.error('trending: APIFY_TOKEN not configured');
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ error: 'Trending discovery is temporarily unavailable.' })
        };
    }

    // ── Cache lookup ─────────────────────────────────────────
    const cacheKey = 'trending:tiktok:' + (customHashtag || niche) + ':' + new Date().toISOString().slice(0, 13);
    const cached = await readCache(cacheKey);
    if (cached) {
        return { statusCode: 200, headers, body: JSON.stringify({ results: cached, source: 'cache' }) };
    }

    // ── Call Apify (sync, returns dataset items) ─────────────
    let raw;
    try {
        const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=${Math.floor(APIFY_TIMEOUT_MS / 1000)}`;
        const resp = await fetch(apifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hashtags: hashtags,
                resultsPerPage: count,
                shouldDownloadVideos: false,
                shouldDownloadCovers: false,
                shouldDownloadSubtitles: false,
                shouldDownloadSlideshowImages: false
            }),
            signal: AbortSignal.timeout(APIFY_TIMEOUT_MS)
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            console.error('Apify non-OK:', resp.status, text.slice(0, 500));
            // Surface the upstream status so we can diagnose auth/quota/actor issues
            // without scraping Netlify logs. We never expose the response body
            // (which could contain partial PII or rate-limit metadata).
            const reason =
                resp.status === 401 ? 'Apify auth failed — APIFY_TOKEN may be wrong or revoked.' :
                resp.status === 402 ? 'Apify out of credit — top up your Apify account.' :
                resp.status === 404 ? 'Apify actor not found — actor name in the function may be wrong.' :
                resp.status === 429 ? 'Apify rate-limited the call — try again in a minute.' :
                'Apify upstream error: HTTP ' + resp.status;
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ error: reason, upstreamStatus: resp.status })
            };
        }
        raw = await resp.json();
    } catch (err) {
        console.error('Apify call failed:', err && err.message);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Trending feed timed out. Please try a different niche.' })
        };
    }

    if (!Array.isArray(raw)) {
        console.error('Apify returned non-array:', typeof raw);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Unexpected response from trending source.' })
        };
    }

    // ── Normalize, filter, sort by engagement ────────────────
    const normalized = raw.map(normalizeTikTok).filter(Boolean);
    normalized.sort((a, b) => (b.likes + b.views * 0.001) - (a.likes + a.views * 0.001));
    const results = normalized.slice(0, count);

    // ── Cache and return ─────────────────────────────────────
    await writeCache(cacheKey, results);

    return { statusCode: 200, headers, body: JSON.stringify({ results, source: 'apify' }) };
};

// Map Apify TikTok scraper output to our shape. Returns null if unusable.
function normalizeTikTok(item) {
    if (!item || !item.webVideoUrl) return null;
    const author = (item.authorMeta && (item.authorMeta.name || item.authorMeta.nickName)) || 'unknown';
    const thumb = (item.videoMeta && item.videoMeta.coverUrl)
        || (item.covers && item.covers[0])
        || null;
    return {
        url: String(item.webVideoUrl),
        thumbnail: thumb ? String(thumb) : null,
        author: '@' + String(author).replace(/^@/, ''),
        likes: Number(item.diggCount || 0),
        views: Number(item.playCount || 0),
        comments: Number(item.commentCount || 0),
        shares: Number(item.shareCount || 0),
        caption: String(item.text || '').slice(0, 300),
        platform: 'tiktok',
        scrapedAt: Date.now()
    };
}

// ── Cache helpers (Netlify Blobs) ────────────────────────────
async function readCache(key) {
    try {
        const { getStore } = require('@netlify/blobs');
        const store = getStore('flipit-trending');
        const raw = await store.get(key, { type: 'json' });
        if (!raw || !raw.expiresAt || Date.now() > raw.expiresAt) return null;
        return raw.results;
    } catch (err) {
        console.warn('Trending cache read failed (open):', err && err.message);
        return null;
    }
}

async function writeCache(key, results) {
    try {
        const { getStore } = require('@netlify/blobs');
        const store = getStore('flipit-trending');
        await store.setJSON(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
    } catch (err) {
        console.warn('Trending cache write failed (ignored):', err && err.message);
    }
}
