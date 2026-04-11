// Netlify Function: /rewrite-script
//
// Rewrites a user-supplied script with a content-aware algorithm.
// Supports tones: viral, educational, funny, inspirational, controversial
// Returns { rewritten, hook, cta }
// No external API key required – pure JS string manipulation.

// ── HOOK TEMPLATES ───────────────────────────────────────

const HOOK_TEMPLATES = {
    howto: [
        'Stop scrolling — this is how to {topic} in under 60 seconds.',
        'Nobody tells you this about {topic}, but it changes everything.',
        'The fastest way to {topic} (most people get this wrong).'
    ],
    story: [
        "I wasn't going to share this, but someone needs to hear it.",
        'This one decision changed everything for me.',
        'What happened next completely flipped the script.'
    ],
    list: [
        'Here are {n} things nobody told you about {topic}.',
        "{n} mistakes you're making with {topic} right now.",
        'Save this: {n} moves that actually work for {topic}.'
    ],
    opinion: [
        "Unpopular opinion: {topic} isn't what you think it is.",
        "Hot take — everyone is wrong about {topic}.",
        "I'm going to say what nobody else will about {topic}."
    ],
    announce: [
        'This is the thing I wish existed a year ago.',
        'I just dropped something and I had to show you.',
        "If you've been waiting for a sign, this is it."
    ],
    generic: [
        "If you scroll past this you'll regret it later.",
        'Wait — you need to see this before it disappears.',
        'This is your sign to finally take action.'
    ]
};

// ── TONE CONFIGS ─────────────────────────────────────────

const TONE_CONFIG = {
    viral: {
        hookPrefix: '',
        bodyTransform: (s) => s,
        ctaText: 'Comment "SEND ME" and I\'ll DM you the full breakdown — save this so you don\'t lose it.',
        hookSuffix: ''
    },
    educational: {
        hookPrefix: 'Here\'s what most people miss: ',
        bodyTransform: (s) => addEducationalTransitions(s),
        ctaText: 'Follow for more evidence-based tips you can actually use. Drop a question below.',
        hookSuffix: ''
    },
    funny: {
        hookPrefix: 'Not to be dramatic, but ',
        bodyTransform: (s) => addFunnySpice(s),
        ctaText: 'Tag someone who needs to see this (you know who). Follow for more chaos.',
        hookSuffix: ' (no, seriously)'
    },
    inspirational: {
        hookPrefix: 'This changed my life and it might change yours: ',
        bodyTransform: (s) => addInspirationalLayer(s),
        ctaText: 'Save this for the days you need it most. Share it with someone who needs a win today.',
        hookSuffix: ''
    },
    controversial: {
        hookPrefix: 'Unpopular opinion — ',
        bodyTransform: (s) => addControversialEdge(s),
        ctaText: 'Agree or disagree? Drop your take below — I read every comment.',
        hookSuffix: ' (and I\'m not sorry)'
    }
};

// ── BODY TONE TRANSFORMS ─────────────────────────────────

function addEducationalTransitions(body) {
    const sentences = splitSentences(body);
    if (sentences.length <= 1) return body;
    const transitions = ['Here\'s why:', 'The data shows:', 'Most people don\'t know that', 'The key insight is:'];
    const mid = Math.floor(sentences.length / 2);
    sentences.splice(mid, 0, transitions[body.length % transitions.length]);
    return sentences.join(' ');
}

function addFunnySpice(body) {
    const sentences = splitSentences(body);
    if (sentences.length < 2) return body + ' (which, honestly, fair.)';
    const last = sentences[sentences.length - 1];
    sentences[sentences.length - 1] = last.replace(/\.$/, '') + ' — and yes, I said what I said.';
    return sentences.join(' ');
}

function addInspirationalLayer(body) {
    const sentences = splitSentences(body);
    const closer = 'You are more capable than you know. This is your moment.';
    return sentences.join(' ') + ' ' + closer;
}

function addControversialEdge(body) {
    const sentences = splitSentences(body);
    if (sentences.length < 2) return 'The real truth? ' + body;
    sentences[0] = 'The real truth? ' + sentences[0].replace(/^[A-Z]/, (c) => c.toLowerCase());
    return sentences.join(' ');
}

// ── UTILITIES ────────────────────────────────────────────

function splitSentences(text) {
    return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function stripHashtags(text) {
    return text.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
}

function extractHashtags(text) {
    return [...new Set(text.match(/#\w+/g) || [])];
}

function classifyScript(text) {
    const t = text.toLowerCase();
    if (/(how to|step[- ]by[- ]step|tutorial|guide|tips?)/.test(t)) return 'howto';
    if (/(story|happened|i was|when i|yesterday|last (week|year|month))/.test(t)) return 'story';
    if (/\b\d+\s+(ways|things|reasons|mistakes|steps|tips|secrets|hacks)\b/.test(t)) return 'list';
    if (/(unpopular|hot take|truth|nobody|everyone is wrong)/.test(t)) return 'opinion';
    if (/(drop(ped)?|launch(ed)?|announce|new|just released|available now|free guide)/.test(t)) return 'announce';
    return 'generic';
}

function guessTopic(textNoTags) {
    const firstSent = (textNoTags.split(/[.!?\n]/)[0] || textNoTags).trim();
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

function pickHook(category, topic, textNoTags) {
    const pool = HOOK_TEMPLATES[category] || HOOK_TEMPLATES.generic;
    const hook = pool[textNoTags.length % pool.length];
    const n = (textNoTags.length % 4) + 3;
    return hook.replace(/\{topic\}/g, topic).replace(/\{n\}/g, n);
}

function compressBody(textNoTags) {
    const sentences = textNoTags
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    // Keep up to 4 sentences for body richness
    return sentences.slice(0, 4).join(' ');
}

// ── PLATFORM CTA VARIANTS ────────────────────────────────

function platformCta(platform, baseCta) {
    const p = (platform || '').toLowerCase();
    if (p === 'tiktok') return baseCta + ' Like for Part 2.';
    if (p === 'instagram') return baseCta + ' Double-tap if this helped.';
    if (p === 'youtube') return baseCta + ' Subscribe so you don\'t miss the next one.';
    if (p === 'linkedin') return baseCta + ' Repost to help someone in your network.';
    return baseCta;
}

// ── MAIN REWRITE ENGINE ──────────────────────────────────

function rewriteScript(script, tone, platform) {
    const safeScript = (script || '').trim();
    const safeTone = TONE_CONFIG[tone] ? tone : 'viral';
    const config = TONE_CONFIG[safeTone];

    const tags = extractHashtags(safeScript);
    const noTags = stripHashtags(safeScript) || safeScript;

    const category = classifyScript(noTags);
    const topic = guessTopic(noTags);

    // Build hook
    const baseHook = pickHook(category, topic, noTags);
    const hook = config.hookPrefix + baseHook + config.hookSuffix;

    // Build body
    const rawBody = compressBody(noTags);
    const body = config.bodyTransform(rawBody);

    // Build CTA
    const cta = platformCta(platform, config.ctaText);

    // Assemble rewritten script
    const parts = [hook, '', body, '', cta];
    if (tags.length) parts.push('\n' + tags.slice(0, 8).join(' '));
    const rewritten = parts.join('\n').trim();

    // Hook explanation
    const hookExplanation =
        `HOOK FORMULA: "${hook}"\n\nTone: ${safeTone.toUpperCase()}. Why it works: pattern-interrupt first line, specificity, implicit promise, and a reason to keep watching. Pair it with a 1-second visual twist on frame 1 (zoom, whip-pan, or bold text flash) so the algorithm registers a watch-past-hook signal.`;

    return { rewritten, hook: hookExplanation, cta };
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

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { script, tone, platform } = JSON.parse(event.body || '{}');

        if (!script || !script.trim()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing fields: script is required' })
            };
        }

        const result = rewriteScript(script, tone, platform);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'Server error' })
        };
    }
};
