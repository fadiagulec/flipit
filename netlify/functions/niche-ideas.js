// Netlify Function: /.netlify/functions/niche-ideas
//
// Accepts POST { niche, description } (or falls back to parsing a `script` field
// for backwards-compat with the old app.js shape).
// Returns { twisted, prompt } — the same shape as the Railway /generate endpoint —
// so the existing app.js display logic works unchanged.
//
// No external API key required. All generation is deterministic JS.

// ── IDEA TEMPLATES ───────────────────────────────────────────────────────────
// Each niche bucket has a pool of idea blueprints. We pick 5 ideas from the
// best-matched bucket (falling back to GENERIC), vary them with the user's
// niche/description text, and format them as structured output.

const NICHE_BUCKETS = {
    finance: /financ|money|invest|stock|crypto|budget|debt|wealth|income|savings|forex|trading|real estate|realestate/i,
    fitness: /fitness|workout|gym|weight|muscle|fat|cardio|run|marathon|yoga|pilates|health|diet|nutrition|protein|keto|paleo/i,
    food: /food|cook|recipe|bake|meal|dinner|lunch|breakfast|restaurant|chef|kitchen|vegan|vegetarian/i,
    beauty: /beauty|makeup|skincare|hair|nail|fashion|style|outfit|ootd|grooming|cosmetic/i,
    business: /business|entrepreneur|startup|marketing|brand|sales|ecommerce|dropshipping|side.?hustle|freelance|agency/i,
    mindset: /mindset|motivation|productivity|habit|discipline|goal|self.?help|mental|anxiety|stress|confidence|stoic/i,
    parenting: /parent|mom|dad|baby|toddler|child|family|kid/i,
    tech: /tech|software|code|programming|app|ai|artificial intelligence|developer|saas|product/i,
    travel: /travel|trip|vacation|flight|hotel|destination|backpack|digital.?nomad/i,
    education: /learn|study|school|college|university|course|tutor|skill|career|job|interview/i
};

const IDEA_POOLS = {
    finance: [
        {
            hook: 'I made ${amount} in {timeframe} doing this one thing that nobody talks about.',
            angle: 'Personal income revelation with a relatable starting point',
            format: 'reel',
            why: 'Money + timeframe + mystery creates an irresistible scroll-stopper. The specificity ("one thing") implies insider knowledge the viewer doesn\'t have yet.'
        },
        {
            hook: 'The {number} money rules they never teach you in school.',
            angle: 'Educational counter-narrative that makes schools the villain',
            format: 'carousel',
            why: 'Anti-establishment framing triggers resentment + curiosity. Carousels get saved at 3x the rate of single posts because viewers want to revisit the list.'
        },
        {
            hook: 'Stop saving 10% of your income. Do this instead.',
            angle: 'Pattern interrupt on mainstream advice',
            format: 'reel',
            why: 'Telling people to stop something they\'re already doing creates instant cognitive dissonance. The "do this instead" promise keeps them watching.'
        },
        {
            hook: 'Every person who became wealthy in their 30s did these {number} things in their 20s.',
            angle: 'Reverse-engineering success with a specific demographic hook',
            format: 'carousel',
            why: 'Age specificity triggers identity resonance. Viewers see themselves in the story and share it with peers in the same life stage.'
        },
        {
            hook: 'How I went from broke to {milestone} - the honest version nobody posts.',
            angle: 'Authenticity-first transformation story with implied contrast to fake gurus',
            format: 'reel',
            why: '"Honest version" signals trustworthiness in an oversaturated niche full of hype. Builds a loyal audience faster than performance claims.'
        },
        {
            hook: 'A {job} making ${salary} vs a freelancer making ${salary2}: a day in the life.',
            angle: 'Day-in-the-life comparison content that validates life choices',
            format: 'reel',
            why: 'Comparison content triggers aspirational thinking and debate in comments — both signals the algorithm rewards with wider distribution.'
        },
        {
            hook: 'The {number} subscriptions quietly draining your bank account right now.',
            angle: 'Specific financial leak audit — practical and instantly actionable',
            format: 'carousel',
            why: 'Loss aversion is 2x more motivating than gain. People share "money leak" content because it helps their followers too — compounding organic reach.'
        }
    ],
    fitness: [
        {
            hook: 'I trained {timeframe} without going to the gym. Here\'s what actually changed.',
            angle: 'Accessible transformation — no gym equipment required',
            format: 'reel',
            why: 'Lowers the barrier to entry for most viewers. The "what actually changed" framing promises honesty over hype, which drives saves and shares.'
        },
        {
            hook: 'The {number}-minute workout that replaces an hour at the gym.',
            angle: 'Efficiency hack for time-poor audiences',
            format: 'reel',
            why: 'Time efficiency is the #1 objection to working out. A specific minute count feels credible and achievable, collapsing the excuse barrier.'
        },
        {
            hook: 'Nobody talks about what happens to your body when you stop working out for {timeframe}.',
            angle: 'Fear + curiosity about reversal of progress',
            format: 'carousel',
            why: 'Loss aversion and fear of "wasting" past effort makes this highly shareable. People tag friends who\'ve "been lazy" which drives viral loops.'
        },
        {
            hook: 'I ate the same {calories} every day for 30 days. This is what happened.',
            angle: 'Personal experiment with quantified inputs and surprising results',
            format: 'reel',
            why: 'Experiment-style content has built-in narrative tension (will it work?) and the specific number anchors credibility.'
        },
        {
            hook: 'The {number} exercises wasting your time at the gym (and what to do instead).',
            angle: 'Myth-busting list that challenges popular training advice',
            format: 'carousel',
            why: 'Tells people they\'ve been doing it wrong — triggering curiosity and a slight defensive reaction that drives comments and debate.'
        }
    ],
    food: [
        {
            hook: 'This {ingredient} from your pantry is a secret weapon chefs use every day.',
            angle: 'Elevation of an ordinary ingredient to professional status',
            format: 'reel',
            why: 'The "chef secret" framing implies the viewer is getting insider knowledge. People immediately check if they have the ingredient — stopping the scroll.'
        },
        {
            hook: '{number}-ingredient {meal} that tastes like you spent hours cooking.',
            angle: 'Simplicity + impressive result — the holy grail of recipe content',
            format: 'reel',
            why: 'Minimal ingredient count is searchable, shareable, and instantly bookmarked. The gap between effort and result is the main value proposition.'
        },
        {
            hook: 'I made every viral {dish} recipe on the internet. Here\'s the only one worth your time.',
            angle: 'Research-done-for-you curation content',
            format: 'reel',
            why: 'Saves the viewer time by consuming all the bad content so they don\'t have to. People share "best of" content heavily because it makes them look helpful.'
        },
        {
            hook: 'Stop throwing away {food item}. Here are {number} ways to use it.',
            angle: 'Anti-waste framing with practical payoff',
            format: 'carousel',
            why: 'Sustainability guilt + practical value = high save rate. People bookmark this to refer back to before grocery shopping.'
        },
        {
            hook: 'The {nationality} street food trick that makes everything taste 10x better.',
            angle: 'Cultural hack that implies exotic knowledge made accessible',
            format: 'reel',
            why: 'Specificity of a culture or region feels authentic and educational. The "10x better" promise creates a taste gap viewers want to close.'
        }
    ],
    beauty: [
        {
            hook: 'I stopped using {product} for {timeframe}. This is what happened to my {skin/hair}.',
            angle: 'Product elimination experiment with relatable insecurity as the hook',
            format: 'reel',
            why: 'Before/after with a removal twist is counter-intuitive (most beauty content adds products). The contrast makes it memorable and shareable.'
        },
        {
            hook: 'The {number} things I wish I knew about {topic} before I turned {age}.',
            angle: 'Regret-framed wisdom with a time-specificity hook',
            format: 'carousel',
            why: 'Age specificity triggers identity matching. People in that age bracket share it with peers; younger viewers save it as future advice.'
        },
        {
            hook: 'Dermatologists hate this {time}-second trick that {benefit}.',
            angle: 'Authority-disruption framing (classic viral formula)',
            format: 'reel',
            why: 'The "hate this trick" format signals suppressed information, which is catnip for curiosity. Very low barrier to click through.'
        },
        {
            hook: 'I spent ${amount} on {category} products so you don\'t have to. The only ones worth it:',
            angle: 'Consumer research curation with social proof by spending',
            format: 'carousel',
            why: 'The implied sacrifice ("I spent") builds credibility. Curated "best of" lists get saved at extremely high rates in beauty niches.'
        },
        {
            hook: 'The {ingredient} in your kitchen that works better than a {high-end product}.',
            angle: 'Budget hack using kitchen pantry items',
            format: 'reel',
            why: 'Saves money while delivering aspirational results. High share potential because viewers want to help their budget-conscious friends too.'
        }
    ],
    business: [
        {
            hook: 'How I got my first {number} clients without spending a dollar on ads.',
            angle: 'Zero-budget growth story with replicable tactics',
            format: 'reel',
            why: 'The zero-spend constraint is highly relatable for early-stage entrepreneurs. The specific number creates a goal post that feels achievable.'
        },
        {
            hook: 'I analyzed {number} viral brands. They all do this one thing differently.',
            angle: 'Pattern recognition research that promises a competitive edge',
            format: 'carousel',
            why: 'Data-backed insight implies authority and thoroughness. Business audiences save strategy content at very high rates to implement later.'
        },
        {
            hook: 'The email script that landed me a {result} deal in {timeframe}.',
            angle: 'Template-style content with a specific, aspirational outcome',
            format: 'post',
            why: 'Copy-paste value is maximum. Viewers save immediately because it\'s something they can use today. High comment engagement from people asking follow-ups.'
        },
        {
            hook: 'Brutal truth: here\'s why your {business type} isn\'t growing.',
            angle: 'Diagnosis content that implies the viewer is making a fixable mistake',
            format: 'reel',
            why: 'Self-diagnosis content triggers defensiveness then relief when the fix is revealed. Strong comment engagement from people who see themselves in the problem.'
        },
        {
            hook: 'I quit my {job title} job {timeframe} ago. Here\'s everything I\'d do differently.',
            angle: 'Hindsight wisdom from a relatable leap of faith',
            format: 'reel',
            why: 'The "quit job" narrative resonates with a massive latent audience. The "do differently" twist adds humility and credibility over pure success-porn.'
        }
    ],
    mindset: [
        {
            hook: 'The {timeframe} habit that {result} — and nobody is talking about it.',
            angle: 'Hidden habit with a life-changing outcome',
            format: 'reel',
            why: 'Novelty + specificity + implied exclusivity. Habit content gets extremely high save rates because viewers want to implement immediately.'
        },
        {
            hook: 'Stop trying to be motivated. Do this instead.',
            angle: 'Counter-narrative that challenges the motivation industry',
            format: 'reel',
            why: '"Stop doing X" is a pattern interrupt that immediately questions something the viewer is already doing. Creates cognitive dissonance that demands resolution.'
        },
        {
            hook: 'I read {number} books on {topic}. Here are the only {number2} ideas that actually work.',
            angle: 'Curation content — research done for you',
            format: 'carousel',
            why: 'The contrast between books read and ideas extracted implies a high signal-to-noise filter. Saves time for the viewer and feels like a gift.'
        },
        {
            hook: 'What {timeframe} of waking up at {time} actually does to your brain.',
            angle: 'Science-adjacent routine content with a quantified experiment hook',
            format: 'reel',
            why: 'Specific time + specific duration creates verifiable credibility. The "brain" framing suggests scientific backing even without citations.'
        },
        {
            hook: 'The mindset shift that made everything click after {timeframe} of struggle.',
            angle: 'Breakthrough moment storytelling with universal emotional resonance',
            format: 'reel',
            why: 'Struggle-to-breakthrough arc is the most emotionally satisfying story structure. Relatability drives shares as people tag others who "need to see this."'
        }
    ],
    tech: [
        {
            hook: '{number} AI tools that will replace {job role} by {year}.',
            angle: 'Future-of-work fear/opportunity content',
            format: 'carousel',
            why: 'Job security is a primal concern. Lists of AI tools get shared widely because people want to warn (or prepare) their professional network.'
        },
        {
            hook: 'I built a {product} in {timeframe} using only free tools. Here\'s how.',
            angle: 'Zero-budget build log with replicable steps',
            format: 'reel',
            why: 'The constraint (free tools + short time) makes the achievement feel accessible. Developers and indie hackers share build logs obsessively.'
        },
        {
            hook: 'This {tool/feature} has been hidden in plain sight. You\'ve been doing it the hard way.',
            angle: 'Hidden feature reveal that makes the viewer feel smart for watching',
            format: 'reel',
            why: 'The "hidden in plain sight" framing implies stupidity of NOT knowing — creating urgency to watch and share before others see it first.'
        },
        {
            hook: 'The {number} Chrome extensions I use daily that 99% of people don\'t know about.',
            angle: 'Productivity tool curation with exclusivity framing',
            format: 'carousel',
            why: 'Tool lists get saved at very high rates. The "99% don\'t know" framing makes the viewer feel like they\'re getting insider access.'
        },
        {
            hook: 'I automated my entire {workflow} with {tool}. {timeframe} saved per week.',
            angle: 'Workflow automation case study with quantified time savings',
            format: 'reel',
            why: 'Time saved is the most tangible value proposition in productivity content. Specific numbers (hours per week) create an immediate ROI calculation in the viewer\'s head.'
        }
    ],
    generic: [
        {
            hook: 'Everything you\'ve been told about {niche} is wrong. Here\'s the truth.',
            angle: 'Myth-busting counter-narrative that positions you as the truth-teller',
            format: 'reel',
            why: 'Challenging established beliefs creates instant curiosity and mild outrage — both strong engagement triggers. Comments from people who disagree fuel algorithmic distribution.'
        },
        {
            hook: 'I spent {timeframe} studying {niche}. Here are the {number} things that actually matter.',
            angle: 'Research synthesis — curation by time investment',
            format: 'carousel',
            why: 'The implied effort ("I spent X studying") builds credibility and frames your insight as a shortcut. People save curation content heavily.'
        },
        {
            hook: 'Why most people fail at {niche} (and the simple fix nobody mentions).',
            angle: 'Failure diagnosis with a single actionable remedy',
            format: 'reel',
            why: 'Most people fear failure more than they desire success. Diagnosing the failure first creates emotional resonance; the fix creates the save.'
        },
        {
            hook: 'The {niche} mistake I made that cost me {resource} — and how to avoid it.',
            angle: 'Personal cautionary tale with audience-protecting framing',
            format: 'reel',
            why: 'First-person mistakes feel authentic and generate sympathy. The "how to avoid it" promise makes the content feel altruistic rather than self-promotional.'
        },
        {
            hook: 'If I were starting {niche} from scratch in {year}, I\'d do these {number} things.',
            angle: 'Hindsight roadmap — time-travel advice framing',
            format: 'carousel',
            why: 'The "from scratch" reset is universally relatable. New entrants bookmark it as a guide; experienced practitioners share it to validate their own journey.'
        },
        {
            hook: '{number} {niche} hacks that took me years to learn (steal these).',
            angle: 'Generous expert sharing framed as permission to copy',
            format: 'carousel',
            why: '"Steal these" gives explicit permission to take value, which reduces social friction to saving and sharing. Years-to-learn implies high-density insight.'
        },
        {
            hook: 'The {niche} strategy nobody is copying yet — but everyone will be in {timeframe}.',
            angle: 'Trend prediction content that positions the viewer as an early adopter',
            format: 'reel',
            why: 'People love feeling like they\'re ahead of the curve. The time-bound prediction creates urgency to act NOW before the trend tips.'
        }
    ]
};

// ── HELPERS ──────────────────────────────────────────────────────────────────

function detectBucket(niche, description) {
    const text = `${niche} ${description}`.toLowerCase();
    for (const [bucket, pattern] of Object.entries(NICHE_BUCKETS)) {
        if (pattern.test(text)) return bucket;
    }
    return 'generic';
}

// Simple seeded pseudo-random based on string hash — deterministic per niche
// but varied across different niches.
function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function personalise(template, niche, description) {
    const topicWords = niche.trim().split(/\s+/).slice(0, 4).join(' ');
    const seed = hashCode(niche + description);

    // Replace placeholder tokens with niche-specific values
    const amounts = ['$2,000', '$5,000', '$10,000', '$25,000', '$50,000'];
    const timeframes = ['30 days', '60 days', '90 days', '6 months', 'a year'];
    const numbers = ['3', '5', '7', '9', '10', '12'];
    const milestones = ['financial freedom', '$100K', 'six figures', 'my first $10K month', 'full-time income'];
    const years = ['2025', '2026'];

    let out = template
        .replace(/\{niche\}/gi, topicWords)
        .replace(/\{topic\}/gi, topicWords)
        .replace(/\{amount\}/gi, amounts[seed % amounts.length])
        .replace(/\{salary\}/gi, amounts[seed % amounts.length])
        .replace(/\{salary2\}/gi, amounts[(seed + 2) % amounts.length])
        .replace(/\{timeframe\}/gi, timeframes[(seed + 1) % timeframes.length])
        .replace(/\{number\}/gi, numbers[seed % numbers.length])
        .replace(/\{number2\}/gi, numbers[(seed + 3) % numbers.length])
        .replace(/\{milestone\}/gi, milestones[seed % milestones.length])
        .replace(/\{year\}/gi, years[seed % years.length])
        .replace(/\{calories\}/gi, ['1,800', '2,000', '2,200'][(seed) % 3] + ' calories')
        .replace(/\{time\}/gi, ['30', '60', '90'][(seed) % 3] + '-second')
        .replace(/\{age\}/gi, ['25', '30', '35'][(seed) % 3])
        .replace(/\{ingredient\}/gi, ['olive oil', 'lemon juice', 'soy sauce', 'garlic', 'turmeric'][(seed) % 5])
        .replace(/\{meal\}/gi, niche.split(/\s+/)[0] || 'dinner')
        .replace(/\{dish\}/gi, niche.split(/\s+/)[0] || 'recipe')
        .replace(/\{food item\}/gi, ['vegetable scraps', 'overripe bananas', 'stale bread', 'leftover rice'][(seed) % 4])
        .replace(/\{nationality\}/gi, ['Japanese', 'Italian', 'Thai', 'Mexican', 'Indian'][(seed) % 5])
        .replace(/\{product\}/gi, ['moisturiser', 'toner', 'serum', 'foundation'][(seed) % 4])
        .replace(/\{skin\/hair\}/gi, ['skin', 'hair'][(seed) % 2])
        .replace(/\{high-end product\}/gi, ['$200 cream', '$150 serum', 'professional treatment'][(seed) % 3])
        .replace(/\{category\}/gi, topicWords)
        .replace(/\{job title\}/gi, ['marketing manager', 'software engineer', 'accountant', 'teacher'][(seed) % 4])
        .replace(/\{job role\}/gi, ['copywriters', 'designers', 'marketers', 'analysts'][(seed) % 4])
        .replace(/\{business type\}/gi, topicWords + ' business')
        .replace(/\{job\}/gi, ['corporate', '9-to-5', 'office', 'desk'][(seed) % 4])
        .replace(/\{tool\/feature\}/gi, topicWords + ' feature')
        .replace(/\{tool\}/gi, ['Zapier', 'Make', 'Notion AI', 'ChatGPT'][(seed) % 4])
        .replace(/\{workflow\}/gi, topicWords + ' workflow')
        .replace(/\{resource\}/gi, ['$3,000', '3 months', '6 months', 'a year of progress'][(seed) % 4]);

    return out;
}

function pickIdeas(niche, description, count = 7) {
    const bucket = detectBucket(niche, description);
    const seed = hashCode(niche + description);

    // Pull from the matched bucket, supplement with generic if needed
    const primary = IDEA_POOLS[bucket] || [];
    const fallback = IDEA_POOLS.generic;
    const combined = [...primary, ...fallback];

    // Shuffle deterministically using seed
    const shuffled = combined.slice().sort((a, b) => {
        const ai = combined.indexOf(a);
        const bi = combined.indexOf(b);
        return ((ai * 2654435761 + seed) % 1000) - ((bi * 2654435761 + seed) % 1000);
    });

    return shuffled.slice(0, count);
}

function formatIdeas(niche, description, ideas) {
    const lines = [];

    ideas.forEach((idea, i) => {
        const hook = personalise(idea.hook, niche, description);
        lines.push(`IDEA ${i + 1}: ${hook}`);
        lines.push(`Angle: ${idea.angle}`);
        lines.push(`Format: ${idea.format.toUpperCase()}`);
        lines.push(`Why it works: ${idea.why}`);
        if (i < ideas.length - 1) lines.push('');
    });

    return lines.join('\n');
}

function buildProTips(niche, bucket) {
    const tips = {
        finance: [
            'Lead with a specific dollar amount or percentage — vague promises lose attention instantly.',
            'Show the before/after in the first 3 seconds (broke vs. comfortable, not poor vs. rich).',
            'End every video with "Save this so you don\'t forget it" — saved posts signal high value to the algorithm.'
        ],
        fitness: [
            'Film your workouts in natural lighting — gyms with harsh fluorescent light test poorly in research.',
            'Show the "ugly" rep alongside the "clean" rep — authenticity outperforms perfection in fitness content.',
            'Use on-screen captions for every key point — 85% of social video is watched on mute.'
        ],
        food: [
            'The first 3 seconds must show the finished dish — never start with raw ingredients.',
            'ASMR sound design (sizzle, crunch, pour) dramatically increases watch time on recipe content.',
            'Film top-down overhead shots for flat dishes; 45-degree angle for height and layers.'
        ],
        beauty: [
            'No-filter before/after content outperforms heavily edited content by 4x in engagement.',
            'Tag every product used — affiliate links from beauty content have industry-leading conversion.',
            'Use trending audio tracks from the beauty community — the algorithm clusters content by audio.'
        ],
        business: [
            'Specific numbers always outperform vague claims ("237 clients" beats "hundreds of clients").',
            'Show the process, not just the result — the journey is more relatable than the win.',
            'Reply to every comment in the first hour — it trains the algorithm to expect high engagement on your content.'
        ],
        mindset: [
            'Open with a statement that makes people feel seen, not impressed — empathy > authority.',
            'The simpler the framework, the more shareable — one idea, one example, one action.',
            'Speak slowly and pause deliberately — the algorithm rewards watch time, not production speed.'
        ],
        tech: [
            'Screen recordings with cursor highlighting beat talking-head videos 3:1 for tutorial content.',
            'Always show the broken/slow way first — the contrast makes the solution feel more powerful.',
            'Use "Part 2 coming tomorrow" endings — serialised content has dramatically higher follow rates.'
        ],
        generic: [
            'Post at the same time 3-5 days per week — consistency trains both the algorithm and your audience.',
            'Reply to the first 10 comments with questions — it signals high engagement velocity to the algorithm.',
            'The best performing hook formula: [Controversial statement] + [Specific proof] + [Implied benefit].'
        ]
    };

    const bucketTips = tips[bucket] || tips.generic;
    const genericTips = tips.generic;

    const allTips = [...bucketTips, ...genericTips].slice(0, 4);

    return [
        `PRO TIPS FOR ${niche.toUpperCase()} CONTENT:`,
        '',
        ...allTips.map((t, i) => `${i + 1}. ${t}`),
        '',
        'HOOK FORMULA: [Stop the scroll] + [Specific result] + [Implied shortcut]',
        '',
        'Why it works: A pattern-interrupt first line combined with a specific promised outcome gives viewers an instant reason to keep watching. Pair every hook with a visual match in frame 1 — the algorithm scores your watch-past-hook rate in the first 2 seconds.'
    ].join('\n');
}

// ── HANDLER ──────────────────────────────────────────────────────────────────

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
        const body = JSON.parse(event.body || '{}');

        // Support both the new { niche, description } shape and the legacy
        // { script } shape used by the current app.js.
        let niche = body.niche || '';
        let description = body.description || body.platform || '';

        if (!niche && body.script) {
            // Legacy: "Generate 3 viral script ideas for the niche: X\n\nDetails: Y"
            const nicheMatch = body.script.match(/for the niche:\s*(.+?)(?:\n|$)/i);
            const detailsMatch = body.script.match(/Details:\s*([\s\S]+)/i);
            niche = nicheMatch ? nicheMatch[1].trim() : body.script.slice(0, 60);
            description = detailsMatch ? detailsMatch[1].trim() : '';
        }

        if (!niche) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'niche is required' })
            };
        }

        const bucket = detectBucket(niche, description);
        const ideas = pickIdeas(niche, description, 7);
        const twisted = formatIdeas(niche, description, ideas);
        const prompt = buildProTips(niche, bucket);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ideas, twisted, prompt })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'server error' })
        };
    }
};
