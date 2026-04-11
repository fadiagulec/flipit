// Backend URL
const BACKEND_URL = 'https://web-production-8afc3.up.railway.app';

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

// ── DOWNLOAD ─────────────────────────────────────────────
document.getElementById('downloadBtn').addEventListener('click', handleDownload);

// cobalt.tools is an open-source media downloader that works from the browser.
// It's the most reliable free API for Instagram, TikTok, YouTube, etc.
// https://github.com/imputnet/cobalt
const COBALT_API = 'https://api.cobalt.tools/api/json';

// Trigger a browser download by creating a hidden anchor tag and clicking it.
function triggerAnchorDownload(fileUrl, filename) {
    const a = document.createElement('a');
    a.href = fileUrl;
    if (filename) a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        if (a.parentNode) document.body.removeChild(a);
    }, 1000);
}

// Open the snapinsta.app fallback helper in a new tab when cobalt fails.
function openSnapinstaFallback(url) {
    const helperUrl = 'https://snapinsta.app/?url=' + encodeURIComponent(url);
    window.open(helperUrl, '_blank', 'noopener,noreferrer');
}

async function handleDownload() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    if (!url) { showError('Please enter a URL first', 'errorMessage'); return; }

    const downloadBtn = document.getElementById('downloadBtn');
    const orig = downloadBtn.innerHTML;
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '\u23F3 Downloading...';

    const platform = detectPlatform(url);
    const helpers = {
        instagram: 'https://snapinsta.app/',
        tiktok: 'https://snaptik.app/',
        youtube: 'https://yt1s.com/',
        x: 'https://twittervideodownloader.com/',
        facebook: 'https://fdown.net/'
    };
    const helperUrl = helpers[platform] || `https://savefrom.net/#url=${encodeURIComponent(url)}`;

    try {
        const resp = await fetch('/.netlify/functions/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await resp.json();

        if (data.status === 'redirect' || data.status === 'stream' || data.status === 'tunnel') {
            const a = document.createElement('a');
            a.href = data.url; a.target = '_blank'; a.download = 'flipit-media';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            showSuccess('\u2705 Download started!', 'errorMessage');
        } else if (data.status === 'picker' && data.picker && data.picker.length > 0) {
            data.picker.forEach((item, i) => setTimeout(() => {
                const a = document.createElement('a');
                a.href = item.url; a.target = '_blank'; a.download = `flipit-${i + 1}`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }, i * 700));
            showSuccess(`\u2705 Downloading ${data.picker.length} files!`, 'errorMessage');
        } else {
            // use-helper or any unexpected response — open helper and copy URL
            window.open(helperUrl, '_blank');
            try { await navigator.clipboard.writeText(url); } catch(e) {}
            showSuccess('\u{1F4CB} URL copied! Paste it on the download page that just opened.', 'errorMessage');
        }
    } catch(e) {
        window.open(helperUrl, '_blank');
        try { await navigator.clipboard.writeText(url); } catch(e2) {}
        showSuccess('\u{1F4CB} URL copied! Paste it on the download page that just opened.', 'errorMessage');
    }

    downloadBtn.disabled = false;
    downloadBtn.innerHTML = orig;
}


function triggerDownload(item, filename) {
    if (item.video) downloadBase64(item.video, `${filename}.mp4`, 'video/mp4');
    else if (item.image) downloadBase64(item.image, `${filename}.jpg`, 'image/jpeg');
}

function downloadBase64(base64Data, filename, mimeType = 'application/octet-stream') {
    try {
        const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { console.error('Download error:', e); }
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
        const res = await fetch(`${BACKEND_URL}/extract-and-twist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Extraction failed'); }

        const data = await res.json();
        displayResults(data, platform);
    } catch (err) {
        showError(`Error: ${err.message}`, 'errorMessage');
        container.innerHTML = '';
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

    // New: video creation prompt for AI video tools
    if (data.twisted) {
        appendVideoPromptSection(container, data.twisted, platform);
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

function appendVideoPromptSection(container, flippedScript, platform) {
    // Trigger button — the actual prompt section is revealed on click.
    const triggerWrap = document.createElement('div');
    triggerWrap.className = 'video-prompt-trigger';
    triggerWrap.style.cssText = 'margin-top:16px;display:flex;justify-content:center;';

    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'btn-primary';
    triggerBtn.style.cssText = 'background:linear-gradient(135deg,#ff6b00,#ff9500);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:8px;cursor:pointer;font-size:14px;';
    triggerBtn.textContent = '\u{1F3AC} VIDEO PROMPT';
    triggerWrap.appendChild(triggerBtn);
    container.appendChild(triggerWrap);

    // The revealed section — built once on first click.
    triggerBtn.addEventListener('click', () => {
        // If already built, just toggle visibility.
        const existing = container.querySelector('.video-prompt-section');
        if (existing) {
            existing.style.display = existing.style.display === 'none' ? '' : 'none';
            return;
        }

        const promptText = buildVideoPrompt(flippedScript, platform);

        const div = document.createElement('div');
        div.className = 'result-section video-prompt-section';

        const heading = document.createElement('h3');
        heading.textContent = '\u{1F3AC} Video Creation Prompt';
        div.appendChild(heading);

        const sub = document.createElement('p');
        sub.style.cssText = 'color:#888;font-size:12px;margin-bottom:10px;text-transform:none;letter-spacing:0;';
        sub.textContent = 'Paste this into Runway, Pika Labs, Kling, Sora, or any AI video tool.';
        div.appendChild(sub);

        const textEl = document.createElement('p');
        textEl.className = 'result-text';
        textEl.style.whiteSpace = 'pre-wrap';
        textEl.textContent = promptText;
        div.appendChild(textEl);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-primary copy-btn';
        copyBtn.style.cssText = 'background:linear-gradient(135deg,#ff6b00,#ff9500);color:#fff;width:auto;flex:none;';
        copyBtn.textContent = '\u{1F4CB} Copy Prompt';
        copyBtn.onclick = () => copyToClipboard(copyBtn);
        div.appendChild(copyBtn);

        container.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── SCRIPT REWRITE ───────────────────────────────────────
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
        const res = await fetch(`${BACKEND_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Rewrite failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, 'Original Script', script, false);
        appendSection(container, '\u2728 Flipped Version', data.twisted, true);
        if (data.prompt) appendSection(container, '\u{1F3AF} Proven Hook', data.prompt, true);

        // New: video creation prompt for AI video tools
        if (data.twisted) {
            appendVideoPromptSection(container, data.twisted, null);
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
        const res = await fetch(`${BACKEND_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: `Generate 3 viral script ideas for the niche: ${niche}\n\nDetails: ${description}` })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Generation failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, '\u{1F4A1} Your 3 Viral Script Ideas', data.twisted, true);
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
