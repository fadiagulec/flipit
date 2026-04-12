// Backend URLs — all endpoints are now Netlify Functions (no external Railway dependency).
const EXTRACT_URL = '/.netlify/functions/extract-and-twist';

// Platform detection patterns
const platformPatterns = {
    instagram: /instagram\.com|instagr\.am/i,
    tiktok: /tiktok\.com|vm\.tiktok|vt\.tiktok/i,
    youtube: /youtube\.com|youtu\.be/i,
    linkedin: /linkedin\.com/i,
    facebook: /facebook\.com|fb\.watch/i,
    x: /twitter\.com|x\.com/,
    threads: /threads\.net/i
};

const platformEmojis = {
    instagram: '\u{1F4F7}',
    tiktok: '\u{1F3B5}',
    youtube: '\u25B6\uFE0F',
    linkedin: '\u{1F4BC}',
    facebook: '\u{1F4F5}',
    x: '\u{1F426}',
    threads: '\u{1F9F5}'
};

// Initialize tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// Detect platform from URL
function detectPlatform(url) {
    for (const [platform, pattern] of Object.entries(platformPatterns)) {
        if (pattern.test(url)) {
            return platform;
        }
    }
    return null;
}

// Show platform badge
function showPlatformBadge(url) {
    const platform = detectPlatform(url);
    const badge = document.getElementById('platformBadge');

    if (platform) {
        badge.textContent = `${platformEmojis[platform]} ${platform.toUpperCase()} detected`;
        badge.style.display = 'inline-block';
        document.getElementById('actionButtons').style.display = 'flex';
        return platform;
    } else {
        badge.style.display = 'none';
        document.getElementById('actionButtons').style.display = 'none';
        return null;
    }
}

// URL Input Event Listener
document.getElementById('urlInput').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
        showPlatformBadge(url);
    } else {
        document.getElementById('platformBadge').style.display = 'none';
        document.getElementById('actionButtons').style.display = 'none';
    }
});

// ── DOWNLOAD MEDIA ──────────────────────────────────────
const DOWNLOAD_URL = '/.netlify/functions/download';

document.getElementById('downloadBtn').addEventListener('click', handleDownload);

async function handleDownload() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    if (!url) { showError('Please enter a URL first', 'errorMessage'); return; }

    const platform = detectPlatform(url);
    const btn = document.getElementById('downloadBtn');
    const origText = btn.textContent;

    btn.disabled = true;
    btn.textContent = '\u23F3 Finding download link...';

    try {
        const res = await fetch(DOWNLOAD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await res.json();

        if (res.ok && data.downloadUrl) {
            btn.textContent = '\u2B07\uFE0F Starting download...';

            // If carousel with multiple images, show download panel
            if (data.carousel && data.carousel.length > 1) {
                showCarouselDownloads(data.carousel, data.platform);
                showSuccess(`\u{1F3A0} Found ${data.carousel.length} media items! Click each to download.`, 'errorMessage');
            } else {
                window.open(data.downloadUrl, '_blank');
                const mediaType = data.type === 'image' ? '\u{1F5BC}\uFE0F Image' : '\u{1F3AC} Video';
                showSuccess(`\u2705 ${mediaType} download started!`, 'errorMessage');
            }
        } else if (res.ok && data.openUrl) {
            window.open(data.openUrl, '_blank');
            showSuccess(`\u{1F4F1} ${data.instruction || 'Save the media from the app directly.'}`, 'errorMessage');
        } else {
            showError(`\u274C Could not process this link. Please try again.`, 'errorMessage');
        }
    } catch (err) {
        console.error('Download error:', err);
        showError('\u274C Network error. Please try again.', 'errorMessage');
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

function showCarouselDownloads(items, platform) {
    const container = document.getElementById('resultsContainer');
    const html = items.map((item, i) => {
        const icon = item.type === 'video' ? '\u{1F3AC}' : '\u{1F5BC}\uFE0F';
        const label = item.type === 'video' ? 'Video' : 'Image';
        return `<a href="${item.url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#0d6e66;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 16px rgba(13,110,102,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow=''">${icon} ${label} ${i + 1}</a>`;
    }).join('');

    const section = document.createElement('div');
    section.className = 'result-section';
    section.innerHTML = `
        <h3>\u{1F3A0} Carousel — ${items.length} items found</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;">${html}</div>
    `;
    container.prepend(section);
}

// ── EXTRACT & FLIP ───────────────────────────────────────
document.getElementById('extractBtn').addEventListener('click', handleExtractAndTwist);

async function handleExtractAndTwist() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }

    const platform = detectPlatform(url);
    if (!platform) { showError('URL not recognized.', 'errorMessage'); return; }

    const btn = document.getElementById('extractBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 Extracting & Flipping...';

    const container = document.getElementById('resultsContainer');
    container.innerHTML = '<div class="loading">\u{1F504} Processing your content, please wait...</div>';

    try {
        const res = await fetch(EXTRACT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!res.ok) {
            let msg = 'Extraction failed';
            try { const e = await res.json(); msg = e.error || msg; } catch (_) {}
            throw new Error(msg);
        }

        const data = await res.json();

        // Handle graceful fallback when caption extraction failed
        if (data.success === false) {
            container.innerHTML = `
                <div class="result-section" style="border-left:4px solid #ff6b00;padding:16px;">
                    <h3>\u26A0\uFE0F Could Not Extract Caption</h3>
                    <p class="result-text">${escapeHtml(data.message || 'The caption could not be extracted from this post.')}</p>
                    <p style="margin-top:12px;color:#888;font-size:13px;">Tip: Copy the caption text from the post and paste it into the <strong>Script Rewrite</strong> tab for instant flipping.</p>
                </div>`;
            return;
        }

        displayResults(data, platform);
    } catch (err) {
        container.innerHTML = `
            <div class="result-section" style="border-left:4px solid #ff4444;padding:16px;">
                <h3>\u26A0\uFE0F Something went wrong</h3>
                <p class="result-text">${escapeHtml(err.message)}</p>
            </div>`;
        showError(`Error: ${err.message}`, 'errorMessage');
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

function displayResults(data, platform) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    // Carousel images preview
    if (data.carousel_images && data.carousel_images.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'carousel-preview';
        wrap.innerHTML = '<h3>\u{1F5BC} Carousel Images</h3>';
        data.carousel_images.forEach((img, i) => {
            const div = document.createElement('div');
            div.className = 'carousel-image-wrapper';
            const el = document.createElement('img');
            el.src = `data:image/jpeg;base64,${img}`;
            el.alt = `Slide ${i + 1}`;
            div.appendChild(el);
            wrap.appendChild(div);
        });
        container.appendChild(wrap);
    }

    const isCaption = data.original && !data.original.includes('\n') && data.original.length < 500;

    appendSection(container, isCaption ? 'Original Caption' : 'Original Transcript', data.original, false);
    appendSection(container, '\u2728 Flipped Version', data.twisted, true);
    if (data.prompt) appendSection(container, '\u{1F3AF} Proven Hook', data.prompt, true);

    // Prompt buttons row: Video + Image
    if (data.twisted) {
        appendPromptButtons(container, data.twisted, data.original, platform);
    }
}

function appendSection(container, title, text, copyable) {
    const div = document.createElement('div');
    div.className = 'result-section';
    div.innerHTML = `<h3>${title}</h3><p class="result-text">${escapeHtml(text || '')}</p>`;
    if (copyable) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '\u{1F4CB} Copy';
        btn.onclick = () => copyToClipboard(btn);
        div.appendChild(btn);
    }
    container.appendChild(div);
}

// ── VIDEO CREATION PROMPT ────────────────────────────────
// Build a ready-to-paste prompt for AI video tools (Runway, Pika, Kling, Sora, etc.)
// based on the flipped script content.
function buildVideoPrompt(flippedScript, platform) {
    const script = (flippedScript || '').trim();

    // Take the first sentence as the hook seed.
    const firstSentence = (script.split(/(?<=[.!?])\s+/)[0] || script).slice(0, 160);

    // Heuristic style picks based on the script content.
    const lower = script.toLowerCase();
    let style;
    if (/story|happened|i was|when i|last week|yesterday/.test(lower)) {
        style = 'Cinematic talking-head with dynamic b-roll cutaways. Shallow depth of field, warm tones, handheld energy.';
    } else if (/tip|step|how to|here.s how|hack|secret/.test(lower)) {
        style = 'Fast-cut tutorial style. Clean overhead and over-the-shoulder shots, on-screen text overlays, modern minimal aesthetic.';
    } else if (/data|study|number|research|stats|%/.test(lower)) {
        style = 'Data-driven motion graphics mixed with sleek b-roll. Cool color palette, kinetic typography, documentary feel.';
    } else {
        style = 'Cinematic vertical 9:16 with high-contrast lighting. Mix of talking-head and b-roll, modern Reel/TikTok pacing.';
    }

    // Pick a sensible scene description.
    const scene = `A creator delivers the message below in a visually engaging vertical 9:16 format optimised for ${platform || 'social media'}. Camera moves with subtle motion, environment matches the topic, and supporting b-roll reinforces every key beat.`;

    // Hook: dramatic opening visual.
    const hook = `Open on an arresting visual that physicalises this line: "${firstSentence}". Use a fast push-in or whip-pan, big bold on-screen text, and a sound design hit on frame 1 to stop the scroll.`;

    // CTA visual.
    const cta = `End on the creator looking straight into camera with bold animated text: "Follow for more" plus a thumb-stopping freeze frame. Hold 1.5s for the loop.`;

    return [
        `[SCENE]: ${scene}`,
        ``,
        `[HOOK]: ${hook}`,
        ``,
        `[STYLE]: ${style}`,
        ``,
        `[VOICEOVER]: ${script}`,
        ``,
        `[CTA]: ${cta}`,
        ``,
        `Aspect ratio: 9:16. Duration: 15-45 seconds. Pacing: fast cuts every 1-2 seconds. Audio: trending upbeat bed + clear VO mix. Subtitles: burned-in, large, high-contrast.`
    ].join('\n');
}

// ── PROMPT BUTTONS (Video + Image) ──────────────────────
function appendPromptButtons(container, flippedScript, originalCaption, platform) {
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:16px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;';

    // Video Prompt button
    const videoBtn = document.createElement('button');
    videoBtn.className = 'btn-primary';
    videoBtn.style.cssText = 'background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:10px;cursor:pointer;font-size:16px;flex:1;min-width:180px;';
    videoBtn.textContent = '\u{1F3AC} VIDEO PROMPT';
    btnRow.appendChild(videoBtn);

    // Image Prompt button
    const imageBtn = document.createElement('button');
    imageBtn.className = 'btn-secondary';
    imageBtn.style.cssText = 'background:linear-gradient(135deg,#c2185b,#e8734a);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:10px;cursor:pointer;font-size:16px;flex:1;min-width:180px;';
    imageBtn.textContent = '\u{1F5BC}\uFE0F IMAGE PROMPT';
    btnRow.appendChild(imageBtn);

    container.appendChild(btnRow);

    // Video Prompt click handler
    videoBtn.addEventListener('click', () => {
        const existing = container.querySelector('.video-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const promptText = buildVideoPrompt(flippedScript, platform);
        const div = document.createElement('div');
        div.className = 'result-section video-prompt-section';
        div.innerHTML = `
            <h3>\u{1F3AC} Video Creation Prompt</h3>
            <p style="color:#777;font-size:14px;margin-bottom:10px;">Paste into Runway, Pika, Kling, Sora, or any AI video tool.</p>
            <p class="result-text" style="white-space:pre-wrap;">${escapeHtml(promptText)}</p>
        `;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.style.cssText = 'background:#0d6e66;color:#fff;';
        copyBtn.textContent = '\u{1F4CB} Copy Prompt';
        copyBtn.onclick = () => copyToClipboard(copyBtn);
        div.appendChild(copyBtn);
        container.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Image Prompt click handler
    imageBtn.addEventListener('click', () => {
        const existing = container.querySelector('.image-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const prompts = buildImagePrompts(flippedScript, originalCaption, platform);
        const div = document.createElement('div');
        div.className = 'result-section image-prompt-section';
        div.style.borderLeftColor = '#c2185b';

        let html = '<h3>\u{1F5BC}\uFE0F Image Creation Prompts</h3>';
        html += '<p style="color:#777;font-size:14px;margin-bottom:14px;">Paste into Midjourney, DALL-E, Ideogram, Leonardo, or any AI image tool.</p>';

        prompts.forEach((p, i) => {
            html += `
                <div style="margin-bottom:16px;padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #e8e4de;">
                    <p style="color:#c2185b;font-weight:700;font-size:14px;margin-bottom:6px;text-transform:uppercase;">${p.label}</p>
                    <p class="result-text" style="margin-bottom:8px;">${escapeHtml(p.prompt)}</p>
                    <button class="copy-btn" style="background:#c2185b;color:#fff;margin-top:0;" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent);this.textContent='\u2705 Copied!';setTimeout(()=>this.textContent='\u{1F4CB} Copy',2000)">\u{1F4CB} Copy</button>
                </div>
            `;
        });

        div.innerHTML = html;
        container.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── IMAGE PROMPT BUILDER ────────────────────────────────
function buildImagePrompts(flippedScript, originalCaption, platform) {
    const script = (flippedScript || '').trim();
    const original = (originalCaption || '').trim();
    const lower = script.toLowerCase();

    // Detect content type for styling
    let style, mood, setting;
    if (/fitness|workout|gym|health|body|muscle/.test(lower)) {
        style = 'fitness lifestyle photography';
        mood = 'energetic, powerful, motivated';
        setting = 'modern gym or outdoor fitness space, golden hour lighting';
    } else if (/food|recipe|cook|kitchen|meal|eat/.test(lower)) {
        style = 'professional food photography';
        mood = 'warm, appetizing, cozy';
        setting = 'rustic kitchen counter or marble table, soft natural window light';
    } else if (/travel|trip|adventure|explore|beach|mountain/.test(lower)) {
        style = 'travel photography';
        mood = 'wanderlust, freedom, epic';
        setting = 'breathtaking landscape, vibrant colors, cinematic composition';
    } else if (/business|entrepreneur|startup|money|income|hustle/.test(lower)) {
        style = 'professional business photography';
        mood = 'confident, sleek, aspirational';
        setting = 'modern workspace or luxury office, clean minimal aesthetic';
    } else if (/beauty|skincare|makeup|glow|skin/.test(lower)) {
        style = 'beauty editorial photography';
        mood = 'glowing, elegant, fresh';
        setting = 'soft diffused lighting, clean pastel background, dewy skin texture';
    } else if (/fashion|outfit|style|wear|look/.test(lower)) {
        style = 'fashion editorial photography';
        mood = 'trendy, bold, curated';
        setting = 'urban street or minimalist studio, dramatic lighting';
    } else if (/mindset|motivation|success|growth|manifest/.test(lower)) {
        style = 'inspirational lifestyle photography';
        mood = 'calm, focused, powerful';
        setting = 'minimalist space with warm tones, sunrise or golden hour light';
    } else if (/tech|app|software|ai|digital|code/.test(lower)) {
        style = 'tech product photography';
        mood = 'futuristic, clean, innovative';
        setting = 'dark sleek desk setup, neon accent lights, shallow depth of field';
    } else if (/home|interior|decor|design|room|space/.test(lower)) {
        style = 'interior design photography';
        mood = 'warm, inviting, aesthetic';
        setting = 'beautifully styled room, natural light through windows, earth tones';
    } else {
        style = 'social media content photography';
        mood = 'engaging, authentic, scroll-stopping';
        setting = 'aesthetically pleasing environment, natural lighting, warm tones';
    }

    // Extract key topic
    const topic = guessTopic(stripHashtags(script));

    // Build 3 different prompts
    return [
        {
            label: '\u{1F4F8} Carousel Cover / Hero Image',
            prompt: `Create a ${style} image for a social media post about "${topic}". ${setting}. Mood: ${mood}. The composition should be Instagram-ready (4:5 aspect ratio), with space for bold text overlay at the top. Subject is centered and visually striking. Shot on Sony A7IV, 35mm f/1.4, natural light. High resolution, editorial quality. --ar 4:5 --style raw --v 6.1`
        },
        {
            label: '\u{1F3A8} Carousel Slide / Supporting Image',
            prompt: `Minimalist infographic-style image for a social media carousel slide about "${topic}". Light cream background (#faf8f5), clean typography area on the right side. Left side shows a ${style.replace('photography','')} visual element related to the topic. Soft shadows, modern design, warm color palette with teal (#0d6e66) and coral (#e8734a) accents. Flat lay or isometric angle. 4:5 aspect ratio. --ar 4:5 --style raw --v 6.1`
        },
        {
            label: '\u{1F525} Scroll-Stopping Hook Image',
            prompt: `Dramatic, attention-grabbing ${style} image that visualizes this concept: "${script.split(/[.!?\n]/)[0] || topic}". Ultra close-up or wide cinematic shot, ${mood} mood. Bold contrast, ${setting}. The image should make someone stop scrolling — use unusual angles, vivid colors, or visual tension. Vertical format 9:16 for Reels/TikTok. Shot on cinema camera, anamorphic lens. --ar 9:16 --style raw --v 6.1`
        }
    ];
}

function appendVideoPromptSection(container, flippedScript, platform) {
    // Kept for Script Rewrite tab which still calls this directly
    const triggerWrap = document.createElement('div');
    triggerWrap.style.cssText = 'margin-top:16px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;';

    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'btn-primary';
    triggerBtn.style.cssText = 'background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:10px;cursor:pointer;font-size:16px;';
    triggerBtn.textContent = '\u{1F3AC} VIDEO PROMPT';
    triggerWrap.appendChild(triggerBtn);
    container.appendChild(triggerWrap);

    triggerBtn.addEventListener('click', () => {
        const existing = container.querySelector('.video-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const promptText = buildVideoPrompt(flippedScript, platform);
        const div = document.createElement('div');
        div.className = 'result-section video-prompt-section';
        div.innerHTML = `
            <h3>\u{1F3AC} Video Creation Prompt</h3>
            <p style="color:#777;font-size:14px;margin-bottom:10px;">Paste into Runway, Pika, Kling, Sora, or any AI video tool.</p>
            <p class="result-text" style="white-space:pre-wrap;">${escapeHtml(promptText)}</p>
        `;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.style.cssText = 'background:#0d6e66;color:#fff;';
        copyBtn.textContent = '\u{1F4CB} Copy Prompt';
        copyBtn.onclick = () => copyToClipboard(copyBtn);
        div.appendChild(copyBtn);
        container.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── SCRIPT REWRITE ───────────────────────────────────────
const REWRITE_URL = '/.netlify/functions/rewrite-script';

document.getElementById('rewriteBtn').addEventListener('click', handleRewriteScript);

async function handleRewriteScript() {
    const script = document.getElementById('scriptInput').value.trim();
    if (!script) { showError('Please paste a script or caption', 'scriptErrorMessage'); return; }

    const btn = document.getElementById('rewriteBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 Rewriting...';

    const container = document.getElementById('scriptResultsContainer');
    container.innerHTML = '<div class="loading">\u2728 Creating your flipped version...</div>';

    try {
        const res = await fetch(REWRITE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script, tone: 'viral', platform: null })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Rewrite failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, 'Original Script', script, false);
        appendSection(container, '\u2728 Flipped Version', data.rewritten, true);
        if (data.hook) appendSection(container, '\u{1F3AF} Proven Hook', data.hook, true);
        if (data.cta) appendSection(container, '\u{1F4E3} Call to Action', data.cta, true);

        // Video + Image prompts
        if (data.rewritten) {
            appendPromptButtons(container, data.rewritten, script, null);
        }
    } catch (err) {
        showError(`Error: ${err.message}`, 'scriptErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── NICHE IDEAS ──────────────────────────────────────────
const NICHE_IDEAS_URL = '/.netlify/functions/niche-ideas';

document.getElementById('generateIdeasBtn').addEventListener('click', handleGenerateIdeas);

async function handleGenerateIdeas() {
    const niche = document.getElementById('nicheInput').value.trim();
    const description = document.getElementById('nicheDescription').value.trim();
    if (!niche || !description) { showError('Please fill in both fields', 'ideasErrorMessage'); return; }

    const btn = document.getElementById('generateIdeasBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 Generating...';

    const container = document.getElementById('ideasResultsContainer');
    container.innerHTML = '<div class="loading">\u{1F680} Creating viral script ideas...</div>';

    try {
        const res = await fetch(NICHE_IDEAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ niche, description })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Generation failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, '\u{1F4A1} Your Viral Content Ideas', data.twisted, true);
        if (data.prompt) appendSection(container, '\u{1F3AF} Pro Tips', data.prompt, true);
    } catch (err) {
        showError(`Error: ${err.message}`, 'ideasErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── UTILITIES ────────────────────────────────────────────
function copyToClipboard(button) {
    // Find the result-text element within the same parent (works regardless
    // of where the copy button is positioned within the section).
    const parent = button.parentElement;
    const target = parent.querySelector('.result-text') || button.previousElementSibling;
    const text = target ? target.textContent : '';
    navigator.clipboard.writeText(text).then(() => {
        const orig = button.textContent;
        button.textContent = '\u2705 Copied!';
        setTimeout(() => { button.textContent = orig; }, 2000);
    });
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function showError(msg, id) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = '';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function showSuccess(msg, id) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = '#4ade80';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}
