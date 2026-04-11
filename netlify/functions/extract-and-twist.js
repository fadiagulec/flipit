// Netlify Function: /extract-and-twist
//
// Scrapes the caption/title from Instagram, TikTok, YouTube etc. using
// lightweight HTTP GETs only - no ffmpeg, no video download, no audio transcription.
// Returns { original, twisted, prompt, platform } matching app.js expectations.

const https = require('https');

function get(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request(
            {
                method: 'GET',
                hostname: u.hostname,
                port: u.port || 443,
                path: u.pathname + u.search,
                headers: { 'User-Agent': 'facebookexternalhit/1.1', ...headers },
                timeout: 20000
            },
            (res) => {
                // Follow redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const next = new URL(res.headers.location, url).toString();
                    res.resume();
                    get(next, headers).then(resolve).catch(reject);
                    return;
                }
                let d = '';
                res.on('data', (c) => (d += c));
                res.on('end', () => resolve(d));
            }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

function extractShortcode(url) {
    const m = url.match(/\/(reel|p|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[2] : null;
}

async function fetchInstagramCaption(url) {
    const sc = extractShortcode(url);
    if (!sc) throw new Error('Could not parse Instagram shortcode from URL');

    const embedUrl = `https://www.instagram.com/p/${sc}/embed/`;
    const html = await get(embedUrl);

    // Strategy 1: walk-based extraction for the escaped embed blob.
    // The HTML contains: \"text\":\"VALUE\" where VALUE has \\n and \\uXXXX sequences.
    // We locate the marker, walk forward until we hit backslash-quote (the closing
    // delimiter), then reduce one escaping layer before JSON.parse so surrogate
    // pairs and emoji decode correctly.
    const decodeEscapedValue = (raw) => {
        const fixed = raw
            .replace(/\\\\u/g, '\\u')   // \\uXXXX -> \uXXXX
            .replace(/\\\\n/g, '\\n')   // \\n -> \n
            .replace(/\\\\t/g, '\\t')   // \\t -> \t
            .replace(/\\\\r/g, '\\r');
        return JSON.parse('"' + fixed + '"');
    };

    const marker = '\\"text\\":\\"';
    const mStart = html.indexOf(marker);
    if (mStart >= 0) {
        const valStart = mStart + marker.length;
        let i = valStart;
        let buf = '';
        while (i < html.length) {
            if (html[i] === '\\' && html[i + 1] === '"') break;
            buf += html[i++];
            if (buf.length > 8000) break;
        }
        if (buf.length >= 10) {
            try {
                const decoded = decodeEscapedValue(buf);
                if (decoded && decoded.length >= 10) return decoded;
            } catch (e) {}
        }
    }

    // Strategy 1b: un-escaped form (some embed responses skip the outer encoding)
    const m1plain = html.match(/"text":"([^"]{10,})"/);
    if (m1plain) {
        try { return JSON.parse('"' + m1plain[1] + '"'); } catch (e) { return m1plain[1]; }
    }

    // Strategy 2: og:description meta tag
    const m3 = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']{10,})["']/i)
               || html.match(/<meta\s+content=["']([^"']{10,})["']\s+property=["']og:description["']/i);
    if (m3) return m3[1];

    throw new Error('no-caption-found');
}

async function fetchTikTokCaption(url) {
    const data = await get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    const j = JSON.parse(data);
    const parts = [j.title, j.author_name ? `by @${j.author_name}` : ''].filter(Boolean);
    if (parts.length) return parts.join(' ');
    throw new Error('tiktok-oembed-empty');
}

async function fetchYoutubeCaption(url) {
    const data = await get(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    const j = JSON.parse(data);
    if (j.title) return j.title;
    throw new Error('youtube-oembed-empty');
}

// ── FLIP ENGINE ──────────────────────────────────────────

const HOOK_TEMPLATES = {
    howto:    [
        'Stop scrolling - this is how to {topic} in under 60 seconds.',
        'Nobody tells you this about {topic}, but it changes everything.',
        'The fastest way to {topic} (most people get this wrong).'
    ],
    story:    [
        "I wasn't going to share this, but someone needs to hear it.",
        'This one decision changed everything for me.',
        'What happened next completely flipped the script.'
    ],
    list:     [
        'Here are {n} things nobody told you about {topic}.',
        "{n} mistakes you're making with {topic} right now.",
        'Save this: {n} moves that actually work for {topic}.'
    ],
    opinion:  [
        "Unpopular opinion: {topic} isn't what you think it is.",
        "Hot take - everyone is wrong about {topic}.",
        "I'm going to say what nobody else will about {topic}."
    ],
    announce: [
        'This is the thing I wish existed a year ago.',
        'I just dropped something and I had to show you.',
        "If you've been waiting for a sign, this is it."
    ],
    generic:  [
        "If you scroll past this you'll regret it later.",
        'Wait - you need to see this before it disappears.',
        'This is your sign to finally take action.'
    ]
};

function classifyCaption(caption) {
    const t = caption.toLowerCase();
    if (/(how to|step[- ]by[- ]step|tutorial|guide|tips?)/.test(t)) return 'howto';
    if (/(story|happened|i was|when i|yesterday|last (week|year|month))/.test(t)) return 'story';
    if (/\b\d+\s+(ways|things|reasons|mistakes|steps|tips|secrets|hacks)\b/.test(t)) return 'list';
    if (/(unpopular|hot take|truth|nobody|everyone is wrong)/.test(t)) return 'opinion';
    if (/(drop(ped)?|launch(ed)?|announce|new|just released|available now|free guide)/.test(t)) return 'announce';
    return 'generic';
}

function stripHashtags(text) {
    return text.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
}

function extractHashtags(text) {
    return [...new Set(text.match(/#\w+/g) || [])];
}

function guessTopic(captionNoTags) {
    const firstSent = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags).trim();
    const clean = firstSent
        .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '')
        .replace(/[^\w\s']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    if (!clean) return 'this';
    const stop = new Set([
        'i','you','we','they','he','she','it','the','a','an','my','your','our','their','this','that',
        'these','those','and','or','but','so','if','to','of','in','on','at','by','for','with','as',
        'is','am','are','was','were','be','been','being','have','has','had','do','does','did','will',
        'would','should','could','may','might','can','just','really','very','im','ill','its','put',
        'get','got','go','going','went','make','made','here','there','now','then','some','all','any',
        'me','us','them','about','into','up','down','out','over','under','off','from','than','too',
        'free','new','step','together'
    ]);
    const words = clean.split(' ').filter(Boolean);
    let best = [], cur = [];
    for (const w of words) {
        if (w.length > 2 && !stop.has(w)) {
            cur.push(w);
            if (cur.length > best.length) best = cur.slice();
        } else {
            cur = [];
        }
        if (best.length >= 4) break;
    }
    return best.length ? best.slice(0, 4).join(' ') : (words.slice(0, 3).join(' ') || 'this');
}

function pickHook(category, topic, captionNoTags) {
    const pool = HOOK_TEMPLATES[category] || HOOK_TEMPLATES.generic;
    const hook = pool[captionNoTags.length % pool.length];
    const n = (captionNoTags.length % 4) + 3;
    return hook.replace(/\{topic\}/g, topic).replace(/\{n\}/g, n);
}

function compressBody(captionNoTags) {
    const sentences = captionNoTags
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    return sentences.slice(0, 3).join(' ');
}

function buildFlip(caption) {
    const tags = extractHashtags(caption);
    const noTags = stripHashtags(caption) || caption;
    const category = classifyCaption(noTags);
    const topic = guessTopic(noTags);
    const hook = pickHook(category, topic, noTags);
    const body = compressBody(noTags);
    const cta = 'Comment "SEND ME" and I\'ll DM you the full breakdown - save this so you don\'t lose it.';

    const flipped = [
        hook,
        '',
        body,
        '',
        cta,
        tags.length ? '\n' + tags.slice(0, 8).join(' ') : ''
    ].join('\n').trim();

    const provenHook =
        `HOOK FORMULA: "${hook}"\n\nWhy it works: pattern-interrupt first line, specificity, implicit promise, and a reason to keep watching. Pair it with a 1-second visual twist on frame 1 (zoom, whip-pan, or bold text flash) so the algorithm registers a watch-past-hook signal.`;

    return { flipped, provenHook };
}

// ── HANDLER ──────────────────────────────────────────────
exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { url } = JSON.parse(event.body || '{}');
        if (!url) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL required' }) };
        }

        let platform = 'unknown';
        if (/instagram\.com|instagr\.am/i.test(url)) platform = 'instagram';
        else if (/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url)) platform = 'tiktok';
        else if (/youtube\.com|youtu\.be/i.test(url)) platform = 'youtube';
        else if (/twitter\.com|x\.com/i.test(url)) platform = 'x';
        else if (/linkedin\.com/i.test(url)) platform = 'linkedin';
        else if (/facebook\.com|fb\.watch/i.test(url)) platform = 'facebook';
        else if (/threads\.net/i.test(url)) platform = 'threads';

        let caption = '';

        try {
            if (platform === 'instagram') caption = await fetchInstagramCaption(url);
            else if (platform === 'tiktok') caption = await fetchTikTokCaption(url);
            else if (platform === 'youtube') caption = await fetchYoutubeCaption(url);
        } catch (e) {
            // Caption extraction failed - return a graceful fallback rather than an error,
            // so the user can at least see the flip template with a generic message.
            caption = '';
        }

        if (!caption || caption.length < 5) {
            // Could not extract - return a structured error so the UI can display
            // a helpful message rather than rendering it as a real flip result.
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'caption_unavailable',
                    original: '',
                    twisted: '',
                    prompt: '',
                    platform,
                    message: 'Could not extract the caption from this post — it may be private or the platform blocked access. Try copying the caption text and pasting it in the Script Rewrite tab.'
                })
            };
        }

        const { flipped, provenHook } = buildFlip(caption);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                original: caption,
                twisted: flipped,
                prompt: provenHook,
                platform
            })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'server error' })
        };
    }
};
