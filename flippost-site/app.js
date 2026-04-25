// Backend URL — uses Netlify Functions (same domain, no CORS issues)
const BACKEND_URL = '/api';

// Platform detection patterns
const platformPatterns = {
    instagram: /instagram\.com|instagr\.am/i,
    tiktok: /tiktok\.com|vm\.tiktok|vt\.tiktok/i,
    youtube: /youtube\.com|youtu\.be/i,
    vimeo: /vimeo\.com/i,
    linkedin: /linkedin\.com/i,
    facebook: /facebook\.com|fb\.watch/i,
    x: /twitter\.com|x\.com/,
    threads: /threads\.net/i,
    mp4: /\.mp4(\?|$)/i
};

const platformEmojis = {
    instagram: '📷',
    tiktok: '🎵',
    youtube: '▶️',
    vimeo: '▶️',
    linkedin: '💼',
    facebook: '👥',
    x: '𝕏',
    threads: '🧵',
    mp4: '🎬'
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

// ── VIDEO PLAYER (rebuilt from scratch) ───────────────────

// STEP 1: Detect video type from URL
function detectVideoType(url) {
    if (!url || typeof url !== 'string') return null;
    try { new URL(url); } catch { return null; }

    if (/youtube\.com\/watch/i.test(url)) return 'youtube';
    if (/youtu\.be\//i.test(url)) return 'youtube';
    if (/youtube\.com\/shorts\//i.test(url)) return 'youtube';
    if (/vimeo\.com\/\d+/i.test(url)) return 'vimeo';
    if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram';
    if (/tiktok\.com/i.test(url)) return 'tiktok';
    if (/facebook\.com|fb\.com|fb\.watch/i.test(url)) return 'facebook';
    if (/\.(mp4|webm)(\?|#|$)/i.test(url)) return 'direct';

    return null;
}

// STEP 2: Convert URLs to embed format
function getVideoEmbedUrl(url, type) {
    if (!url || !type) return null;

    switch (type) {
        case 'youtube': {
            let videoId = null;
            if (url.includes('youtu.be/')) {
                videoId = url.split('youtu.be/')[1]?.split(/[?&#]/)[0];
            } else if (url.includes('/shorts/')) {
                videoId = url.split('/shorts/')[1]?.split(/[?&#]/)[0];
            } else {
                const match = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
                videoId = match?.[1];
            }
            if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
                return 'https://www.youtube.com/embed/' + videoId;
            }
            return null;
        }
        case 'vimeo': {
            const match = url.match(/vimeo\.com\/(\d+)/);
            if (match) {
                return 'https://player.vimeo.com/video/' + match[1];
            }
            return null;
        }
        case 'instagram': {
            const match = url.match(/\/(reel|p|tv)\/([A-Za-z0-9_-]+)/);
            if (match) {
                return 'https://www.instagram.com/' + match[1] + '/' + match[2] + '/embed/';
            }
            return null;
        }
        case 'tiktok': {
            const match = url.match(/\/video\/(\d+)/) || url.match(/\/(\d{15,})/);
            if (match) {
                return 'https://www.tiktok.com/embed/v2/' + match[1];
            }
            return null;
        }
        case 'facebook': {
            return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url) + '&show_text=false&width=476';
        }
        case 'direct':
            return url;
        default:
            return null;
    }
}

// STEP 3: Render the player into a container
function renderVideoPlayer(container, url) {
    const type = detectVideoType(url);
    const embedUrl = getVideoEmbedUrl(url, type);

    // STEP 5: Debug logs
    console.log('[FlipIt Video] Original URL:', url);
    console.log('[FlipIt Video] Detected type:', type);
    console.log('[FlipIt Video] Embed URL:', embedUrl);

    const section = document.createElement('div');
    section.className = 'video-embed-section';
    section.innerHTML = '<h3>🎬 Video Preview</h3>';

    const wrapper = document.createElement('div');
    wrapper.className = 'video-embed-wrapper';

    // STEP 4: Validate — don't render broken URLs
    if (!type || !embedUrl) {
        console.log('[FlipIt Video] Invalid or unsupported video URL');
        wrapper.innerHTML = `<div class="video-embed-fallback">
            <p style="font-size:40px; margin-bottom:10px;">🎬</p>
            <p style="color:#888; font-size:16px;">Invalid video link — could not detect video type.</p>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open link directly ↗</a>
        </div>`;
        section.appendChild(wrapper);
        container.prepend(section);
        return;
    }

    // Render based on type
    if (type === 'direct') {
        const ext = url.match(/\.(mp4|webm)/i)?.[1] || 'mp4';
        wrapper.innerHTML = `<video controls width="100%" style="max-height:500px; border-radius:8px;">
            <source src="${escapeHtml(embedUrl)}" type="video/${ext}">
            Your browser does not support the video tag.
        </video>`;
        console.log('[FlipIt Video] Rendered <video> tag for', ext);
    } else if (type === 'instagram') {
        wrapper.innerHTML = `<iframe
            src="${escapeHtml(embedUrl)}"
            width="100%"
            height="550"
            frameborder="0"
            scrolling="no"
            allowtransparency="true"
            allowfullscreen
            loading="lazy"
        ></iframe>`;
        console.log('[FlipIt Video] Rendered Instagram embed');
    } else if (type === 'tiktok') {
        wrapper.innerHTML = `<iframe
            src="${escapeHtml(embedUrl)}"
            width="100%"
            height="600"
            frameborder="0"
            allowfullscreen
            loading="lazy"
        ></iframe>`;
        console.log('[FlipIt Video] Rendered TikTok embed');
    } else {
        wrapper.innerHTML = `<iframe
            src="${escapeHtml(embedUrl)}"
            width="100%"
            height="400"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
        ></iframe>`;
        console.log('[FlipIt Video] Rendered iframe for', type);
    }

    section.appendChild(wrapper);
    container.prepend(section);
}

// ── DOWNLOAD ──────────────────────────────────────────────
document.getElementById('downloadBtn').addEventListener('click', handleDownload);

async function handleDownload() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }

    const platform = detectPlatform(url);
    if (!platform) { showError('URL not recognized.', 'errorMessage'); return; }

    // LinkedIn download warning
    if (platform === 'linkedin') {
        showError('LinkedIn posts cannot be downloaded directly due to LinkedIn restrictions. Try using Extract & Flip instead to get the text content.', 'errorMessage');
        return;
    }

    const btn = document.getElementById('downloadBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Downloading...';

    try {
        const res = await fetch(`${BACKEND_URL}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Download failed'); }

        const data = await res.json();

        if (data.items && Array.isArray(data.items)) {
            data.items.forEach((item, idx) => triggerDownload(item, `${platform}-item-${idx}`));
        } else if (data.video) {
            downloadBase64(data.video, `${platform}-video.mp4`, 'video/mp4');
        } else if (data.image) {
            downloadBase64(data.image, `${platform}-image.jpg`, 'image/jpeg');
        } else {
            throw new Error('No downloadable content found');
        }

        showSuccess('✅ Download started!', 'errorMessage');
    } catch (err) {
        console.error('Download error:', err);
        showError('Download failed. Try using the Extract & Flip button instead.', 'errorMessage');
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

// ── EXTRACT & FLIP ─────────────────────────────────────────
document.getElementById('extractBtn').addEventListener('click', handleExtractAndTwist);

async function handleExtractAndTwist() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }

    const platform = detectPlatform(url);
    if (!platform) { showError('URL not recognized. Supported: Instagram, TikTok, YouTube, Vimeo, LinkedIn, Facebook, X, Threads, or direct .mp4 links.', 'errorMessage'); return; }

    console.log('[FlipIt] Raw URL:', url);
    console.log('[FlipIt] Detected platform:', platform);

    const btn = document.getElementById('extractBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Extracting & Flipping...';

    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    // Show video player FIRST — this works independently of the API
    renderVideoPlayer(container, url);

    // Add loading indicator AFTER the embed
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.textContent = '🔄 Extracting text & flipping script...';
    container.appendChild(loadingDiv);

    // Fetch with a 20-second timeout so the page never hangs forever
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(`${BACKEND_URL}/extract-and-twist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('[FlipIt] API response status:', res.status);

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Extraction failed'); }

        const data = await res.json();
        console.log('[FlipIt] API data keys:', Object.keys(data).join(', '));

        // Remove the loading indicator
        loadingDiv.remove();

        // Show warning if there is one
        if (data.warning) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'result-section';
            warningDiv.style.borderLeftColor = '#e8734a';
            warningDiv.innerHTML = `<h3 style="color:#e8734a;">⚠️ Note</h3><p class="result-text" style="background:#fff8f0;">${escapeHtml(data.warning)}</p>`;
            container.appendChild(warningDiv);
        }

        // Show extracted text and flipped version if available
        if (data.original || data.twisted) {
            displayResultsContent(container, data, platform);
        } else if (!data.warning) {
            const tipDiv = document.createElement('div');
            tipDiv.className = 'result-section';
            tipDiv.innerHTML = `<h3>💡 Tip</h3><p class="result-text">No text could be extracted. Copy the caption from the post above and use the <strong>Script Rewrite</strong> tab to flip it.</p>`;
            container.appendChild(tipDiv);
        }
    } catch (err) {
        console.error('[FlipIt] Extract error:', err.message);
        // Remove loading indicator
        loadingDiv.remove();

        // Show helpful message instead of just an error
        const msgDiv = document.createElement('div');
        msgDiv.className = 'result-section';
        msgDiv.style.borderLeftColor = '#e8734a';

        if (err.name === 'AbortError') {
            msgDiv.innerHTML = `<h3 style="color:#e8734a;">⏱️ Request Timed Out</h3><p class="result-text" style="background:#fff8f0;">Text extraction took too long. You can still watch the video above — copy the caption and use the <strong>Script Rewrite</strong> tab to flip it.</p>`;
        } else {
            msgDiv.innerHTML = `<h3 style="color:#e8734a;">⚠️ Extraction Issue</h3><p class="result-text" style="background:#fff8f0;">Could not extract text from this URL. You can still watch the video above — copy the caption and use the <strong>Script Rewrite</strong> tab to flip it.</p>`;
        }
        container.appendChild(msgDiv);
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
        wrap.innerHTML = '<h3>📸 Carousel Images</h3>';
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
    appendSection(container, '✨ Flipped Version', data.twisted, true);
    if (data.prompt) appendSection(container, '🎯 Proven Hook', data.prompt, true);
}

function displayResultsContent(container, data, platform) {
    const isCaption = data.original && !data.original.includes('\n') && data.original.length < 500;

    if (data.original) {
        appendSection(container, isCaption ? 'Original Caption' : 'Original Transcript', data.original, false);
    }
    if (data.twisted) {
        appendSection(container, '✨ Flipped Version', data.twisted, true);
    }
    if (data.prompt) {
        appendSection(container, '🎯 Proven Hook', data.prompt, true);
    }
}

function appendSection(container, title, text, copyable) {
    const div = document.createElement('div');
    div.className = 'result-section';
    div.innerHTML = `<h3>${title}</h3><p class="result-text">${escapeHtml(text || '')}</p>`;
    if (copyable) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '📋 Copy';
        btn.onclick = () => copyToClipboard(btn);
        div.appendChild(btn);
    }
    container.appendChild(div);
}

// ── SCRIPT REWRITE ─────────────────────────────────────────
document.getElementById('rewriteBtn').addEventListener('click', handleRewriteScript);

async function handleRewriteScript() {
    const script = document.getElementById('scriptInput').value.trim();
    if (!script) { showError('Please paste a script or caption', 'scriptErrorMessage'); return; }

    const btn = document.getElementById('rewriteBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Rewriting...';

    const container = document.getElementById('scriptResultsContainer');
    container.innerHTML = '<div class="loading">✨ Creating your flipped version...</div>';

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
        appendSection(container, '✨ Flipped Version', data.twisted, true);
        if (data.prompt) appendSection(container, '🎯 Proven Hook', data.prompt, true);
    } catch (err) {
        console.error('Rewrite error:', err);
        showError('Something went wrong. Please try again.', 'scriptErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── NICHE IDEAS ─────────────────────────────────────────────
document.getElementById('generateIdeasBtn').addEventListener('click', handleGenerateIdeas);

async function handleGenerateIdeas() {
    const niche = document.getElementById('nicheInput').value.trim();
    const description = document.getElementById('nicheDescription').value.trim();
    if (!niche || !description) { showError('Please fill in both fields', 'ideasErrorMessage'); return; }

    const btn = document.getElementById('generateIdeasBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    const container = document.getElementById('ideasResultsContainer');
    container.innerHTML = '<div class="loading">🚀 Creating viral script ideas...</div>';

    try {
        const res = await fetch(`${BACKEND_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                script: `You are a viral content strategist. Generate 3 highly specific, ready-to-film viral video script ideas for the niche: ${niche}

Topic/Details: ${description}

For EACH of the 3 ideas, provide:
1. VIDEO TITLE — a scroll-stopping, curiosity-driven title
2. HOOK — the exact first 1-2 sentences to say on camera that stops the scroll
3. SCRIPT OUTLINE — 5-6 bullet points covering what to say, in order
4. CALL TO ACTION — what to tell viewers at the end
5. WHY IT WORKS — 1 sentence explaining the psychology behind why this will go viral

Number each idea clearly (1, 2, 3). Make them specific and actionable — not generic. Mix formats: one educational, one storytelling, one trend/controversial take.`
            })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Generation failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, '💡 Your 3 Viral Script Ideas', data.twisted, true);
        if (data.prompt) appendSection(container, '🎯 Pro Tips', data.prompt, true);
    } catch (err) {
        console.error('Ideas error:', err);
        showError('Something went wrong. Please try again.', 'ideasErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── IMAGE PROMPTS ──────────────────────────────────────────
var selectedImgNiche = 'mommy';
var selectedEvent = '';

// Niche card selection
document.querySelectorAll('.niche-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.niche-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedImgNiche = card.getAttribute('data-niche');
    });
});

// Event pill selection
document.querySelectorAll('.event-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        if (pill.classList.contains('selected')) {
            pill.classList.remove('selected');
            selectedEvent = '';
        } else {
            document.querySelectorAll('.event-pill').forEach(p => p.classList.remove('selected'));
            pill.classList.add('selected');
            selectedEvent = pill.getAttribute('data-event');
            document.getElementById('imgCustomEvent').value = '';
        }
    });
});

// Custom event clears pills
document.getElementById('imgCustomEvent').addEventListener('input', function() {
    if (this.value.trim()) {
        document.querySelectorAll('.event-pill').forEach(p => p.classList.remove('selected'));
        selectedEvent = '';
    }
});

const nicheDescriptions = {
    mommy: 'mommy influencer / mom life — daily routines, kids activities, parenting moments, mom fashion, family outings, nursery setups, school runs, playdates, baby milestones',
    home: 'home & interior — home decor, room makeovers, organized spaces, cozy corners, kitchen setups, living room aesthetics, DIY decor, seasonal decorating',
    food: 'food influencer — recipe prep, plated dishes, kitchen moments, grocery hauls, meal prep, restaurant visits, baking, cooking aesthetics, table settings',
    fashion: 'fashion influencer — outfit of the day, styling tips, wardrobe organization, shopping hauls, street style, accessories, seasonal fashion, trend showcases',
    lifestyle: 'lifestyle influencer — daily routines, self-care, journaling, coffee moments, aesthetic flat lays, productivity setups, wellness rituals, day-in-my-life',
    beauty: 'beauty influencer — makeup looks, skincare routines, product flat lays, vanity setups, before/after transformations, GRWM moments, beauty hauls',
    travel: 'travel influencer — destinations, hotel rooms, beach scenes, cityscapes, airport outfits, luggage flat lays, local food, scenic viewpoints',
    fitness: 'fitness influencer — workout outfits, gym setups, healthy meals, progress photos, workout poses, yoga moments, morning routines, active lifestyle'
};

document.getElementById('generateImgPromptsBtn').addEventListener('click', handleGenerateImgPrompts);

async function handleGenerateImgPrompts() {
    const nicheDesc = nicheDescriptions[selectedImgNiche] || selectedImgNiche;
    const eventText = document.getElementById('imgCustomEvent').value.trim() || selectedEvent || '';
    const style = document.getElementById('imgStyle').value;
    const count = document.getElementById('imgCount').value;
    const extra = document.getElementById('imgExtra').value.trim();

    const btn = document.getElementById('generateImgPromptsBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    const container = document.getElementById('imgResultsContainer');
    container.innerHTML = '<div class="loading">📸 Creating your image prompts...</div>';

    const prompt = `You are an expert AI image prompt engineer for social media influencers. Generate exactly ${count} detailed, high-quality image prompts.

Influencer niche: ${nicheDesc}
Image style: ${style}
${eventText ? 'Event / vibe / theme: ' + eventText : ''}
${extra ? 'Additional details: ' + extra : ''}

Rules for each prompt:
- Write each prompt as a detailed, ready-to-use AI image generation prompt (for Midjourney, DALL-E, or similar)
- Include specific details: lighting (golden hour, soft natural light, studio), composition (close-up, wide shot, flat lay, overhead), colors, mood, styling details
- Make prompts Instagram/Pinterest-worthy — aspirational, aesthetic, on-brand
- Each prompt should be 2-4 sentences of vivid description
- Number each prompt
- After each prompt, add a one-line "CAPTION IDEA:" that pairs with the image
- At the end, add a "POSTING TIPS" section with 3 tips for this niche

Make each prompt unique — vary the setting, angle, mood, and composition.`;

    try {
        const res = await fetch(`${BACKEND_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: prompt })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Generation failed'); }

        const data = await res.json();
        container.innerHTML = '';

        const nicheLabel = selectedImgNiche.charAt(0).toUpperCase() + selectedImgNiche.slice(1);
        const title = `📸 ${nicheLabel} Image Prompts${eventText ? ' — ' + eventText : ''}`;
        appendSection(container, title, data.twisted, true);
        if (data.prompt) appendSection(container, '🎯 Posting Tips', data.prompt, true);
    } catch (err) {
        console.error('Image prompts error:', err);
        showError('Something went wrong. Please try again.', 'imgErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── UTILITIES ───────────────────────────────────────────────
function copyToClipboard(button) {
    const text = button.previousElementSibling.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const orig = button.textContent;
        button.textContent = '✅ Copied!';
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
    el.style.color = '#0d6e66';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}
