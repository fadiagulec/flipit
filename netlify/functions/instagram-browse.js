// Netlify Function: /.netlify/functions/instagram-browse
//
// Browses Instagram posts inside FlipIt so users can click "Flip & Rate"
// on any post without leaving the app or installing a Chrome extension.
//
// Request:  POST { query: "@creatorname" | "#hashtag" | "https://www.instagram.com/...", limit?: 12 }
// Response: 200 { posts: [{ url, thumbnail, caption, owner, likes, comments, isVideo, isCarousel, postedAt? }, ...] }
//
// Backed by Apify's apify/instagram-scraper (same actor used by extract-and-twist.js),
// but called with a different shape: usernames, hashtags, or single-URL probes
// rather than a single direct-post URL.

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');

// MUST stay strictly under the 26s Netlify function timeout (netlify.toml
// gives this function 26s). Apify's run-sync endpoint takes ~12-20s for a
// fresh username/hashtag fetch; we cap at 22s to leave headroom for JSON
// parse + response serialization. Setting this to 60s previously caused
// every browse call to 504 in production.
const APIFY_TIMEOUT_MS = 22000;
const APIFY_TIMEOUT_SEC = Math.floor(APIFY_TIMEOUT_MS / 1000);
const MIN_LIMIT = 6;
const MAX_LIMIT = 24;
// 12 was timing out cold-start; 6 typically finishes in ~10-14s and is plenty
// for a browse grid (user can paginate if they want more).
const DEFAULT_LIMIT = 6;

exports.handler = async function (event) {
    const isPro = isProRequest(event);
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

    // Rate-limit gate (same daily/monthly caps as the rest of the AI surface).
    const quota = await enforceAiQuota(event, isPro);
    if (!quota.allowed) return rateLimitResponse(headers, quota);

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) }; }

    const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
    if (!rawQuery) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Provide a query (@username, #hashtag, or post URL).' }) };
    }
    if (rawQuery.length > 500) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query too long.' }) };
    }

    let limit = parseInt(body.limit, 10);
    if (!Number.isFinite(limit)) limit = DEFAULT_LIMIT;
    limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, limit));

    // ── Detect query type → build Apify directUrls ──
    const queryType = detectQueryType(rawQuery);
    if (!queryType) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unrecognized query. Use @creatorname, #hashtag, or an Instagram URL.' }) };
    }

    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Browse temporarily unavailable. Please try again later.' }) };
    }

    let directUrls;
    let resultsLimit = limit;
    if (queryType.kind === 'username') {
        directUrls = ['https://www.instagram.com/' + queryType.value + '/'];
    } else if (queryType.kind === 'hashtag') {
        directUrls = ['https://www.instagram.com/explore/tags/' + queryType.value + '/'];
    } else { // 'url'
        directUrls = [queryType.value];
        resultsLimit = 1;
    }

    // ── Call Apify ──
    try {
        // Token is passed via the Authorization header rather than the URL
        // so it can't land in upstream/proxy access logs. A wrong/expired
        // token still surfaces as a 401 from Apify, handled below.
        const apifyUrl = 'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=' + APIFY_TIMEOUT_SEC;
        const apifyResp = await fetch(apifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apifyToken
            },
            body: JSON.stringify({
                directUrls,
                resultsType: 'posts',
                resultsLimit,
                addParentData: false,
                enhanceUserSearchWithFacebookPage: false
            }),
            signal: AbortSignal.timeout(APIFY_TIMEOUT_MS)
        });

        if (!apifyResp.ok) {
            console.warn('Apify IG browse non-OK:', apifyResp.status);
            const upstream = apifyResp.status;
            const msg = upstream === 401 ? 'Browse auth failed.' :
                        upstream === 402 ? 'Browse temporarily over capacity. Please try again later.' :
                        upstream === 404 ? 'Browse actor not found.' :
                        upstream === 429 ? 'Browse temporarily rate-limited. Please try again in a minute.' :
                        upstream >= 400 && upstream < 500 ? 'Apify rejected the browse request.' :
                        'Browse upstream error. Please try again.';
            return { statusCode: 502, headers, body: JSON.stringify({ error: msg }) };
        }

        const raw = await apifyResp.json();
        if (!Array.isArray(raw)) {
            return { statusCode: 200, headers, body: JSON.stringify({ posts: [] }) };
        }

        const posts = raw
            .map(normalizeApifyPost)
            .filter(Boolean)
            .slice(0, MAX_LIMIT);

        return { statusCode: 200, headers, body: JSON.stringify({ posts }) };
    } catch (err) {
        const isTimeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        console.warn('Apify IG browse failed:', err && err.message);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({
                error: isTimeout
                    ? 'Browse timed out. Try a smaller limit or a different query.'
                    : 'Browse failed. Please try again.'
            })
        };
    }
};

// ── Helpers ──────────────────────────────────────────────────────────

// Returns { kind: 'username'|'hashtag'|'url', value: string } or null.
function detectQueryType(raw) {
    const q = raw.trim();
    if (!q) return null;

    // URL form
    if (/^https?:\/\//i.test(q)) {
        try {
            const u = new URL(q);
            if (u.username || u.password) {
                // URLs with embedded basic-auth creds (https://www.instagram.com@evil.com/)
                // are a classic SSRF / open-redirect smuggling vector — reject
                // BEFORE the hostname allowlist check so the credentials in
                // the URL don't get a chance to confuse the parser.
                return null;
            }
            if (!/(?:^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname)) return null;
            return { kind: 'url', value: u.toString() };
        } catch { return null; }
    }

    // Hashtag form: leading # or just letters/digits/underscores
    if (q.startsWith('#')) {
        const tag = q.slice(1).replace(/[^A-Za-z0-9_]/g, '').toLowerCase().slice(0, 100);
        if (!tag) return null;
        return { kind: 'hashtag', value: tag };
    }

    // Username form: leading @ (preferred) or bare alphanumeric+._
    if (q.startsWith('@')) {
        const user = q.slice(1).replace(/[^A-Za-z0-9._]/g, '').slice(0, 100);
        if (!user) return null;
        return { kind: 'username', value: user };
    }

    // Bare token — heuristic: if it looks like an IG username/handle, treat as username
    if (/^[A-Za-z0-9._]{1,100}$/.test(q)) {
        return { kind: 'username', value: q };
    }

    return null;
}

function normalizeApifyPost(item) {
    if (!item || typeof item !== 'object') return null;

    // Apify's apify/instagram-scraper returns posts with these shapes:
    //   url, shortCode, type ('Image'|'Video'|'Sidecar'),
    //   caption, ownerUsername, likesCount, commentsCount,
    //   displayUrl, videoUrl, images[], childPosts[], timestamp/takenAt...
    const url = typeof item.url === 'string' && item.url.startsWith('http')
        ? item.url
        : (typeof item.shortCode === 'string' ? 'https://www.instagram.com/p/' + item.shortCode + '/' : null);
    if (!url) return null;

    const thumbnail = typeof item.displayUrl === 'string' && item.displayUrl.startsWith('http')
        ? item.displayUrl
        : (Array.isArray(item.images) && typeof item.images[0] === 'string' && item.images[0].startsWith('http')
            ? item.images[0]
            : null);

    const rawCaption = typeof item.caption === 'string' ? item.caption : (typeof item.text === 'string' ? item.text : '');
    const caption = rawCaption.slice(0, 200);

    const owner = item.ownerUsername || item.owner || '';
    const ownerHandle = owner ? '@' + String(owner).replace(/^@/, '') : '';

    const likes = Number(item.likesCount || item.likes || 0) || 0;
    const comments = Number(item.commentsCount || item.comments || 0) || 0;

    const type = String(item.type || '').toLowerCase();
    const isVideo = type === 'video' || !!item.videoUrl;
    const isCarousel = type === 'sidecar' || (Array.isArray(item.childPosts) && item.childPosts.length > 0);

    // Timestamp is best-effort; Apify returns ISO strings on `timestamp` for most actors.
    let postedAt = null;
    if (typeof item.timestamp === 'string') {
        postedAt = item.timestamp;
    } else if (typeof item.takenAt === 'string') {
        postedAt = item.takenAt;
    } else if (typeof item.takenAtTimestamp === 'number' && item.takenAtTimestamp > 0) {
        postedAt = new Date(item.takenAtTimestamp * 1000).toISOString();
    }

    return {
        url,
        thumbnail,
        caption,
        owner: ownerHandle,
        likes,
        comments,
        isVideo,
        isCarousel,
        ...(postedAt ? { postedAt } : {})
    };
}
