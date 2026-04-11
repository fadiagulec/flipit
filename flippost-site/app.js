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

// CORS proxies tried in order. corsproxy.io is the most reliable free public
// proxy; allorigins is a backup. Both are free and require no auth.
const CORS_PROXIES = [
    (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)
];

async function fetchJsonWithProxy(targetUrl) {
    let lastErr;
    for (const buildProxy of CORS_PROXIES) {
        try {
            const res = await fetch(buildProxy(targetUrl), {
                signal: AbortSignal.timeout(15000)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('All proxies failed');
}

// Pull the Instagram shortcode out of any reel/p/tv URL
function extractInstagramShortcode(url) {
    const m = url.match(/instagram\.com\/(?:reel|p|tv|reels)\/([A-Za-z0-9_-]+)/i);
    return m ? m[1] : null;
}

async function downloadInstagram(url) {
    // Strategy 1: instavideosave.com — free public API, returns direct media URLs.
    try {
        const apiUrl = 'https://api.instavideosave.com/allinone?url=' + encodeURIComponent(url);
        const data = await fetchJsonWithProxy(apiUrl);
        const mediaList = collectInstaMedia(data);
        if (mediaList.length > 0) {
            await downloadAllMedia(mediaList, 'instagram');
            return true;
        }
    } catch (e) {
        console.warn('instavideosave failed:', e.message);
    }

    // Strategy 2: Instagram public GraphQL endpoint via CORS proxy.
    try {
        const shortcode = extractInstagramShortcode(url);
        if (shortcode) {
            const igUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
            const data = await fetchJsonWithProxy(igUrl);
            const mediaList = collectInstaMediaFromGraphql(data);
            if (mediaList.length > 0) {
                await downloadAllMedia(mediaList, 'instagram');
                return true;
            }
        }
    } catch (e) {
        console.warn('Instagram GraphQL failed:', e.message);
    }

    return false;
}

function collectInstaMedia(data) {
    // instavideosave.com response shapes vary; handle the common ones.
    const out = [];
    if (!data) return out;

    if (typeof data.video_url === 'string') {
        out.push({ url: data.video_url, type: 'video' });
    }
    if (typeof data.url === 'string' && /\.(mp4|jpg|jpeg|png)/i.test(data.url)) {
        out.push({ url: data.url, type: /\.mp4/i.test(data.url) ? 'video' : 'image' });
    }
    if (Array.isArray(data.media)) {
        data.media.forEach(m => {
            if (m && m.url) {
                out.push({
                    url: m.url,
                    type: m.type || (/\.mp4/i.test(m.url) ? 'video' : 'image')
                });
            }
        });
    }
    if (Array.isArray(data.data)) {
        data.data.forEach(m => {
            if (m && m.url) {
                out.push({
                    url: m.url,
                    type: m.type || (/\.mp4/i.test(m.url) ? 'video' : 'image')
                });
            }
        });
    }
    if (Array.isArray(data.links)) {
        data.links.forEach(m => {
            if (typeof m === 'string') {
                out.push({ url: m, type: /\.mp4/i.test(m) ? 'video' : 'image' });
            } else if (m && m.url) {
                out.push({
                    url: m.url,
                    type: m.type || (/\.mp4/i.test(m.url) ? 'video' : 'image')
                });
            }
        });
    }
    return out;
}

function collectInstaMediaFromGraphql(data) {
    const out = [];
    const item = data && (
        (data.items && data.items[0]) ||
        (data.graphql && data.graphql.shortcode_media)
    );
    if (!item) return out;

    // Carousel (private API style)
    if (Array.isArray(item.carousel_media)) {
        item.carousel_media.forEach(c => {
            const v = c.video_versions && c.video_versions[0] && c.video_versions[0].url;
            const i = c.image_versions2 &&
                c.image_versions2.candidates &&
                c.image_versions2.candidates[0] &&
                c.image_versions2.candidates[0].url;
            if (v) out.push({ url: v, type: 'video' });
            else if (i) out.push({ url: i, type: 'image' });
        });
    }

    // Carousel (graphql style)
    if (item.edge_sidecar_to_children && Array.isArray(item.edge_sidecar_to_children.edges)) {
        item.edge_sidecar_to_children.edges.forEach(({ node }) => {
            if (node.is_video && node.video_url) out.push({ url: node.video_url, type: 'video' });
            else if (node.display_url) out.push({ url: node.display_url, type: 'image' });
        });
    }

    if (out.length === 0) {
        // Single video
        const v = (item.video_versions && item.video_versions[0] && item.video_versions[0].url) ||
                  (item.is_video ? item.video_url : null);
        if (v) {
            out.push({ url: v, type: 'video' });
        } else {
            // Single image
            const i = (item.image_versions2 &&
                       item.image_versions2.candidates &&
                       item.image_versions2.candidates[0] &&
                       item.image_versions2.candidates[0].url) ||
                      item.display_url;
            if (i) out.push({ url: i, type: 'image' });
        }
    }

    return out;
}

async function downloadTiktok(url) {
    // tikwm.com — free public API, returns direct watermark-free MP4 URLs.
    try {
        const apiUrl = 'https://www.tikwm.com/api/?url=' + encodeURIComponent(url) + '&hd=1';
        const data = await fetchJsonWithProxy(apiUrl);
        if (data && data.data) {
            const mediaList = [];
            if (data.data.play) mediaList.push({ url: data.data.play, type: 'video' });
            else if (data.data.wmplay) mediaList.push({ url: data.data.wmplay, type: 'video' });
            if (mediaList.length > 0) {
                await downloadAllMedia(mediaList, 'tiktok');
                return true;
            }
        }
    } catch (e) {
        console.warn('tikwm failed:', e.message);
    }
    return false;
}

async function downloadAllMedia(mediaList, platform) {
    for (let i = 0; i < mediaList.length; i++) {
        const m = mediaList[i];
        const ext = m.type === 'video' ? 'mp4' : 'jpg';
        const filename = mediaList.length > 1
            ? `${platform}-${i + 1}.${ext}`
            : `${platform}.${ext}`;
        await downloadFromUrl(m.url, filename);
    }
}

async function downloadFromUrl(mediaUrl, filename) {
    // Fetch through CORS proxy so the browser will give us a Blob we can save.
    let lastErr;
    for (const buildProxy of CORS_PROXIES) {
        try {
            const res = await fetch(buildProxy(mediaUrl), {
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
            return;
        } catch (e) {
            lastErr = e;
        }
    }
    // Last resort: just open the raw URL in a new tab so the user can save manually.
    window.open(mediaUrl, '_blank');
    throw lastErr || new Error('Could not fetch media');
}

async function handleDownload() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }

    const platform = detectPlatform(url);
    if (!platform) { showError('URL not recognized.', 'errorMessage'); return; }

    const btn = document.getElementById('downloadBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 Downloading...';

    try {
        let succeeded = false;

        // Strategy 1: client-side public APIs (no backend needed)
        if (platform === 'instagram') {
            succeeded = await downloadInstagram(url);
        } else if (platform === 'tiktok') {
            succeeded = await downloadTiktok(url);
        }

        // Strategy 2: legacy Railway backend (kept for completeness, may be down)
        if (!succeeded) {
            try {
                const res = await fetch(`${BACKEND_URL}/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url }),
                    signal: AbortSignal.timeout(8000)
                });
                if (res.ok) {
                    const result = await res.json();
                    if (result.items && Array.isArray(result.items)) {
                        result.items.forEach((item, idx) =>
                            triggerDownload(item, `${platform}-item-${idx}`));
                        succeeded = true;
                    } else if (result.video) {
                        downloadBase64(result.video, `${platform}-video.mp4`, 'video/mp4');
                        succeeded = true;
                    } else if (result.image) {
                        downloadBase64(result.image, `${platform}-image.jpg`, 'image/jpeg');
                        succeeded = true;
                    }
                }
            } catch (backendErr) {
                console.warn('Backend download failed:', backendErr.message);
            }
        }

        if (succeeded) {
            showSuccess('\u2705 Download started!', 'errorMessage');
        } else {
            // Strategy 3 (last resort): open a free download helper site in a new tab.
            const encodedUrl = encodeURIComponent(url);
            let helperUrl;
            if (platform === 'instagram') {
                helperUrl = 'https://snapinsta.app/?url=' + encodedUrl;
            } else if (platform === 'tiktok') {
                helperUrl = 'https://snaptik.app/?url=' + encodedUrl;
            } else if (platform === 'youtube') {
                helperUrl = 'https://yt1s.com/?q=' + encodedUrl;
            } else if (platform === 'facebook') {
                helperUrl = 'https://fdown.net/?URLz=' + encodedUrl;
            } else {
                helperUrl = 'https://snapinsta.app/?url=' + encodedUrl;
            }
            window.open(helperUrl, '_blank');
            showSuccess('\u{1F517} Opening download helper...', 'errorMessage');
        }
    } catch (err) {
        showError(`Download error: ${err.message}`, 'errorMessage');
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
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
    const promptText = buildVideoPrompt(flippedScript, platform);

    const div = document.createElement('div');
    div.className = 'result-section';

    const heading = document.createElement('h3');
    heading.textContent = '\u{1F3AC} Video Creation Prompt';
    div.appendChild(heading);

    const sub = document.createElement('p');
    sub.style.cssText = 'color:#888;font-size:12px;margin-bottom:10px;text-transform:none;letter-spacing:0;';
    sub.textContent = 'Paste this into Runway, Pika Labs, Kling, Sora, or any AI video tool.';
    div.appendChild(sub);

    const textEl = document.createElement('p');
    textEl.className = 'result-text';
    textEl.textContent = promptText;
    div.appendChild(textEl);

    const btn = document.createElement('button');
    btn.className = 'btn-primary copy-btn';
    btn.style.cssText = 'background:linear-gradient(135deg,#ff6b00,#ff9500);color:#fff;width:auto;flex:none;';
    btn.textContent = '\u{1F4CB} Copy Video Prompt';
    btn.onclick = () => copyToClipboard(btn);
    div.appendChild(btn);

    container.appendChild(div);
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
