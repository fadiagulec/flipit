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

// Force-download a file from URL using fetch + blob + hidden anchor
async function forceDownload(mediaUrl, filename) {
    try {
        const res = await fetch(mediaUrl);
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || 'flipit-media';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        return true;
    } catch (e) {
        // Fallback: hidden anchor with download attribute
        const a = document.createElement('a');
        a.href = mediaUrl;
        a.download = filename || 'flipit-media';
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return true;
    }
}

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

        if (res.ok && data.videoData) {
            // Railway yt-dlp returned base64 video — decode and download directly
            btn.textContent = '⬇️ Downloading...';
            window._lastCarouselCount = 0;
            window._lastCarouselUrls = [];
            try {
                const byteChars = atob(data.videoData);
                const byteArr = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
                const blob = new Blob([byteArr], { type: 'video/mp4' });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = data.filename || ('flipit-video' + (data.ext || '.mp4'));
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
                showSuccess('✅ Video download started!', 'errorMessage');
            } catch (e) {
                showError('❌ Could not save video. Try again.', 'errorMessage');
            }

        } else if (res.ok && data.downloadUrl) {
            btn.textContent = '\u2B07\uFE0F Downloading...';

            // If carousel with multiple images, show download panel
            if (data.carousel && data.carousel.length > 1) {
                window._lastCarouselCount = data.carousel.length;
                window._lastCarouselUrls = data.carousel.map(item => item.url);
                showCarouselDownloads(data.carousel, data.platform);
                showSuccess(`\u{1F3A0} Found ${data.carousel.length} media items! Click each to download.`, 'errorMessage');
            } else {
                window._lastCarouselCount = 0;
                window._lastCarouselUrls = [data.downloadUrl];
                const ext = data.type === 'video' ? '.mp4' : '.jpg';
                const fname = data.filename || `flipit-${platform || 'media'}${ext}`;
                await forceDownload(data.downloadUrl, fname);
                const mediaType = data.type === 'image' ? '\u{1F5BC}\uFE0F Image' : '\u{1F3AC} Video';
                showSuccess(`\u2705 ${mediaType} download started!`, 'errorMessage');
            }
        } else {
            showError('❌ ' + (data.instruction || 'Could not download this media. Please try a different URL.'), 'errorMessage');
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

    // Download All button — uses forceDownload for each item
    const downloadAllBtn = `<button onclick="(async()=>{const btns=document.querySelectorAll('.carousel-dl-btn');for(let i=0;i<btns.length;i++){btns[i].textContent='\\u23F3...';await forceDownload(btns[i].dataset.url,btns[i].dataset.fname);btns[i].textContent='\\u2705 Done';await new Promise(r=>setTimeout(r,500))}})()" style="display:inline-flex;align-items:center;gap:8px;padding:14px 24px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:12px;width:100%;justify-content:center;">\u2B07\uFE0F Download All ${items.length} Items</button>`;

    // Individual buttons — each triggers forceDownload
    const individualBtns = items.map((item, i) => {
        const icon = item.type === 'video' ? '\u{1F3AC}' : '\u{1F5BC}\uFE0F';
        const label = item.type === 'video' ? 'Video' : 'Image';
        const ext = item.type === 'video' ? '.mp4' : '.jpg';
        const fname = `flipit-${platform || 'media'}-${i + 1}${ext}`;
        return `<button class="carousel-dl-btn" data-url="${item.url}" data-fname="${fname}" onclick="forceDownload(this.dataset.url,this.dataset.fname).then(()=>{this.textContent='\\u2705 Done';setTimeout(()=>this.textContent='${icon} ${label} ${i + 1}',2000)})" style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#fff;color:#0d6e66;border:2px solid #0d6e66;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;transition:all 0.2s;flex:1;min-width:120px;justify-content:center;" onmouseover="this.style.background='#0d6e66';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='#0d6e66'">${icon} ${label} ${i + 1}</button>`;
    }).join('');

    const section = document.createElement('div');
    section.className = 'result-section';
    section.innerHTML = `
        <h3>\u{1F3A0} Carousel — ${items.length} items found</h3>
        ${downloadAllBtn}
        <div style="display:flex;flex-wrap:wrap;gap:10px;">${individualBtns}</div>
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
        // Pass carousel count if we downloaded carousel items earlier
        const carouselCount = window._lastCarouselCount || 0;
        appendPromptButtons(container, data.twisted, data.original, platform, carouselCount);
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
    const lower = script.toLowerCase();

    // Extract the core topic from the script
    const stop = new Set(['i','you','we','they','he','she','it','the','a','an','my','your','this','that','and','or','but','so','if','to','of','in','on','at','by','for','with','as','is','am','are','was','were','be','been','have','has','had','do','does','did','will','would','should','could','can','just','really','very','not','no','dont','stop','scrolling','past','regret','nobody','tells','changes','wrong','scroll','later','sign','finally','action','send','comment','save','share','follow','dm','link','bio']);
    const words = lower.replace(/[^\w\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !stop.has(w));
    const freq = {}; words.forEach(w => freq[w] = (freq[w]||0)+1);
    const topWords = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,5).map(e => e[0]);
    const topic = topWords.slice(0,3).join(' ') || 'lifestyle content';

    // Detect niche for specific visuals
    let subject, setting, action, mood, cameraMove;

    if (/skincare|beauty|skin|serum|glow|makeup|routine/.test(lower)) {
        subject = 'a woman with glowing dewy skin, soft natural makeup, hair pulled back';
        setting = 'bright modern bathroom with white marble counter, skincare products arranged neatly, soft morning light through frosted window';
        action = 'gently applying serum to her face, looking into the camera confidently, then showing the product close-up';
        mood = 'fresh, clean, aspirational, soft warm tones';
        cameraMove = 'slow push-in starting from medium shot to extreme close-up of skin texture';
    } else if (/fitness|workout|gym|exercise|muscle|training|body/.test(lower)) {
        subject = 'an athletic person in fitted workout clothes, defined muscles, focused expression';
        setting = 'modern gym with dramatic side lighting, weight racks in background, concrete floor, industrial aesthetic';
        action = 'performing a powerful exercise movement in slow motion, sweat visible, then standing up confidently facing camera';
        mood = 'intense, powerful, motivating, high contrast with deep shadows';
        cameraMove = 'dynamic low angle tracking shot, then quick whip-pan to close-up of determined face';
    } else if (/food|recipe|cook|meal|kitchen|eat|bake/.test(lower)) {
        subject = 'hands preparing a beautiful dish, fresh colorful ingredients';
        setting = 'warm rustic kitchen, wooden cutting board, copper pots, herbs on windowsill, soft natural light from left';
        action = 'chopping fresh ingredients, tossing them in a pan with a sizzle, then revealing the final plated dish with steam rising';
        mood = 'warm, appetizing, cozy, rich golden tones';
        cameraMove = 'overhead shot of hands working, then slow cinematic tilt down to reveal the finished plate';
    } else if (/business|entrepreneur|money|income|startup|marketing|brand|freelance|client/.test(lower)) {
        subject = 'a confident professional in smart casual attire, clean groomed appearance';
        setting = 'sleek modern workspace with large monitor showing graphs, minimalist desk, city view through floor-to-ceiling windows';
        action = 'typing on laptop, then turning to camera with a knowing look, phone lights up with a notification';
        mood = 'ambitious, polished, aspirational, cool neutral tones with warm accents';
        cameraMove = 'smooth dolly shot circling the desk, then rack focus from screen to person\'s face';
    } else if (/fashion|outfit|style|wear|streetwear|clothes/.test(lower)) {
        subject = 'a stylish person in a curated outfit, accessories on point, confident posture';
        setting = 'urban street with interesting architecture, textured walls, golden hour sunlight casting long shadows';
        action = 'walking toward camera in slow motion, doing a subtle pose turn, fabric and accessories catching the light';
        mood = 'bold, editorial, effortlessly cool, warm golden tones';
        cameraMove = 'tracking shot following the walk, then freeze frame at the perfect pose moment';
    } else if (/mindset|motivation|success|growth|journal|meditat|morning|routine|habits/.test(lower)) {
        subject = 'a calm focused person in comfortable minimal clothing';
        setting = 'serene minimalist room, morning sunlight streaming through sheer curtains, journal and coffee on wooden table, green plant';
        action = 'writing in a journal thoughtfully, then looking up through the window with a peaceful confident expression';
        mood = 'peaceful, intentional, warm, soft golden morning light';
        cameraMove = 'gentle slow zoom from wide room shot to intimate close-up of hands writing, then face';
    } else if (/tech|ai|app|software|code|digital|automation|tool/.test(lower)) {
        subject = 'a person at a high-end tech setup, screen glow reflecting on their face';
        setting = 'dark modern desk setup with ultrawide monitor, RGB ambient lighting, mechanical keyboard, clean cable management';
        action = 'scrolling through code or a dashboard, then leaning back with a satisfied expression as results appear on screen';
        mood = 'futuristic, innovative, focused, cool blue and purple ambient glow';
        cameraMove = 'rack focus from glowing screen to person\'s face, then slow pull-back revealing the full setup';
    } else if (/travel|adventure|beach|mountain|explore|trip|vacation/.test(lower)) {
        subject = 'a traveler with a backpack, windswept hair, sun-kissed skin';
        setting = 'breathtaking panoramic landscape, dramatic clouds, golden hour light painting everything warm, vast open space';
        action = 'walking toward a stunning viewpoint, arms spreading slightly, taking in the view, then turning to camera with a smile';
        mood = 'epic, free, wanderlust, warm golden and teal tones';
        cameraMove = 'dramatic drone-style pull-back from close-up to wide aerial revealing the landscape';
    } else {
        subject = `a confident creator speaking about ${topic}`;
        setting = 'aesthetically pleasing modern space, clean background with subtle depth, warm natural lighting';
        action = 'speaking directly to camera with natural hand gestures, genuine expressions, then showing relevant visuals as b-roll';
        mood = 'authentic, engaging, scroll-stopping, warm balanced tones';
        cameraMove = 'smooth push-in from medium to close-up, with subtle handheld movement for energy';
    }

    // Build 3 ready-to-paste prompts for different AI video tools
    const prompt1 = `${subject}, ${setting}, ${action}. ${mood}. Vertical 9:16, cinematic shallow depth of field, ${cameraMove}. Shot on anamorphic lens, 24fps with subtle film grain. Professional color grading.`;

    const prompt2 = `Close-up b-roll sequence: hands interacting with objects related to ${topic}, beautiful detail shots with bokeh background, slow motion 60fps, ${mood}, each shot 2-3 seconds with smooth transitions. Vertical 9:16, ${setting.split(',')[0]}.`;

    const prompt3 = `Split-screen transition sequence: left side shows the "before" struggle, right side reveals the "after" transformation related to ${topic}. ${subject}. Dramatic lighting shift from cool desaturated tones to warm vibrant colors. Vertical 9:16, cinematic, modern social media pacing.`;

    return `PROMPT 1 — Main Scene (paste into Runway / Kling / Sora):\n${prompt1}\n\nPROMPT 2 — B-Roll Shots:\n${prompt2}\n\nPROMPT 3 — Transition Effect:\n${prompt3}`;
}

// ── PROMPT BUTTONS (Video + Image) ──────────────────────
function appendPromptButtons(container, flippedScript, originalCaption, platform, carouselCount) {
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

    // Image Prompt click handler — AI Vision analyzes actual downloaded images
    imageBtn.addEventListener('click', async () => {
        const existing = container.querySelector('.image-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const imageUrls = window._lastCarouselUrls || [];

        if (imageUrls.length > 0) {
            imageBtn.disabled = true;
            imageBtn.textContent = '\u23F3 Analyzing images...';

            const div = document.createElement('div');
            div.className = 'result-section image-prompt-section';
            div.style.borderLeftColor = '#c2185b';
            div.innerHTML = `
                <h3>\u{1F5BC}\uFE0F AI Image Prompts \u2014 Analyzing ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''}...</h3>
                <p style="color:#777;font-size:14px;margin-bottom:14px;">AI Vision is analyzing each image and writing a prompt to recreate it.</p>
                <div id="imagePromptsContainer"></div>
            `;
            container.appendChild(div);
            div.scrollIntoView({ behavior: 'smooth', block: 'start' });

            const promptsContainer = document.getElementById('imagePromptsContainer');
            let done = 0;

            for (let i = 0; i < imageUrls.length; i++) {
                const slideDiv = document.createElement('div');
                slideDiv.style.cssText = 'margin-bottom:16px;padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #e8e4de;';
                slideDiv.innerHTML = `
                    <p style="color:#c2185b;font-weight:700;font-size:14px;margin-bottom:6px;">\u{1F5BC}\uFE0F IMAGE ${i + 1} of ${imageUrls.length}</p>
                    <p class="result-text" style="color:#999;">\u23F3 Analyzing what\u2019s in this image...</p>
                `;
                promptsContainer.appendChild(slideDiv);

                try {
                    const res = await fetch('/.netlify/functions/analyze-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageUrl: imageUrls[i], slideNumber: i + 1 })
                    });
                    const data = await res.json();

                    if (res.ok && data.prompt) {
                        slideDiv.innerHTML = `
                            <p style="color:#c2185b;font-weight:700;font-size:14px;margin-bottom:6px;">\u{1F5BC}\uFE0F IMAGE ${i + 1} of ${imageUrls.length}</p>
                            <p class="result-text" style="margin-bottom:8px;">${escapeHtml(data.prompt)}</p>
                            <button class="copy-btn" style="background:#c2185b;color:#fff;margin-top:0;" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent);this.textContent='\u2705 Copied!';setTimeout(()=>this.textContent='\u{1F4CB} Copy',2000)">\u{1F4CB} Copy</button>
                        `;
                    } else {
                        slideDiv.querySelector('.result-text').textContent = '\u274C ' + (data.error || 'Could not analyze this image');
                        slideDiv.querySelector('.result-text').style.color = '#c2185b';
                    }
                } catch (err) {
                    slideDiv.querySelector('.result-text').textContent = '\u274C Error: ' + err.message;
                    slideDiv.querySelector('.result-text').style.color = '#c2185b';
                }

                done++;
                div.querySelector('h3').textContent = `\u{1F5BC}\uFE0F AI Image Prompts \u2014 ${done}/${imageUrls.length} done`;
            }

            div.querySelector('h3').textContent = `\u{1F5BC}\uFE0F AI Image Prompts \u2014 ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''} analyzed \u2705`;
            imageBtn.disabled = false;
            imageBtn.textContent = '\u{1F5BC}\uFE0F IMAGE PROMPT';

        } else {
            // No images downloaded — tell user to download first
            showError('Download images first, then click Image Prompt to analyze them.', 'errorMessage');
        }
    });
}

// ── HELPERS FOR PROMPT BUILDING ──────────────────────────
function stripHashtags(text) {
    return text.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
}

function guessTopic(text) {
    const firstSent = (text.split(/[.!?\n]/)[0] || text).trim();
    const clean = firstSent.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '').replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!clean) return 'this';
    const stop = new Set(['i','you','we','they','he','she','it','the','a','an','my','your','our','their','this','that','and','or','but','so','if','to','of','in','on','at','by','for','with','as','is','am','are','was','were','be','been','have','has','had','do','does','did','will','would','should','could','may','might','can','just','really','very','im','ill','its','put','get','got','go','going','went','make','made','here','there','now','then','some','all','any','me','us','them','about','into','up','down','out','over','under','off','from','than','too','free','new','step','together']);
    const words = clean.split(' ').filter(Boolean);
    let best = [], cur = [];
    for (const w of words) {
        if (w.length > 2 && !stop.has(w)) { cur.push(w); if (cur.length > best.length) best = cur.slice(); }
        else { cur = []; }
        if (best.length >= 4) break;
    }
    return best.length ? best.slice(0, 4).join(' ') : (words.slice(0, 3).join(' ') || 'this');
}

// ── IMAGE PROMPT BUILDER ────────────────────────────────
function buildImagePrompts(flippedScript, originalCaption, platform, carouselCount) {
    const caption = (originalCaption || '').trim();
    const script = (flippedScript || '').trim();
    const text = (caption + ' ' + script).toLowerCase();

    // ── Extract the real topic in detail ──
    const clean = text.replace(/#\w+/g,'').replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g,'').replace(/https?:\/\/\S+/g,'').replace(/[^\w\s'-]/g,' ').replace(/\s+/g,' ').trim();
    const stop = new Set(['i','you','we','they','he','she','it','the','a','an','my','your','our','their','this','that','and','or','but','so','if','to','of','in','on','at','by','for','with','as','is','am','are','was','were','be','been','being','have','has','had','do','does','did','will','would','should','could','may','might','can','just','really','very','im','ill','its','put','get','got','go','going','went','make','made','here','there','now','then','some','all','any','me','us','them','about','into','up','down','out','over','under','off','from','than','too','free','new','step','together','not','no','yes','also','more','most','like','want','need','know','think','thing','things','way','ways','much','many','every','each','dont','didnt','cant','wont','youre','youll','heres','thats','whats','lets','one','two','three','four','five','six','seven','eight','nine','ten','still','even','back','never','always','already','something','someone','everything','follow','share','save','comment','post','repost','tag','dm','link','bio','page','stop','scrolling','scroll','nobody','tells','changes','wrong','past','regret','later','sign','finally','action','send']);
    const meaningful = clean.split(' ').filter(w => w.length > 3 && !stop.has(w));
    const freq = {}; meaningful.forEach(w => freq[w] = (freq[w]||0)+1);
    const ranked = Object.entries(freq).sort((a,b) => b[1]-a[1]).map(e => e[0]);
    const topicWords = ranked.slice(0, 6);

    // Get hashtag words as bonus context
    const hashtags = [...new Set((text.match(/#(\w+)/g)||[]).map(h => h.slice(1)))].filter(h => h.length > 3);

    // Get real sentences from the original caption (the actual post content)
    const realSentences = caption.replace(/#\w+/g,'').replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g,'').split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 15 && !/^(follow|share|save|comment|tag|dm)/i.test(s));

    // ── Detect what this content is ACTUALLY about ──
    const scenes = [];

    // Skincare / Beauty
    if (/skincare|skin care|serum|moisturi|cleanser|routine|glow|acne|spf|retinol|toner|facial|exfoliat/.test(text)) {
        scenes.push(
            'Close-up of hands applying a clear serum from a glass dropper onto glowing skin, bathroom counter with minimalist skincare bottles lined up, soft morning light from frosted window, steam from a warm towel in background',
            'Flat lay of skincare products on white marble — glass serum bottle, jade roller, cotton pads, small succulent plant, clean minimal aesthetic, overhead shot, soft even lighting',
            'Woman touching her face gently looking at bathroom mirror, dewy fresh skin, white robe, bright clean bathroom with plants, ring light reflection in mirror',
            'Before and after skin texture close-up, left side slightly dull, right side radiant and hydrated, clinical clean background, macro lens detail showing pores and texture',
            'Nighttime skincare routine flat lay on bedside table — eye cream, sleeping mask, silk pillowcase, candle, warm dim lighting, cozy evening mood',
            'Hand holding up a skincare product bottle against a blurred bathroom background, product label visible, soft bokeh, natural light, editorial product shot'
        );
    }
    // Fitness / Workout
    else if (/fitness|workout|gym|exercise|training|muscle|weight|cardio|yoga|run|body|abs|protein|squat|deadlift|bench|hiit|stretching/.test(text)) {
        scenes.push(
            'Athletic person mid-workout in a modern gym, dramatic side lighting highlighting muscle definition, sweat visible, determination on face, weight rack blurred in background',
            'Overhead flat lay of fitness essentials — protein shaker, resistance bands, wireless earbuds, training gloves, towel, gym bag — on dark concrete floor',
            'Person stretching on yoga mat at sunrise, floor-to-ceiling windows with city skyline, warm golden light streaming in, peaceful and focused expression',
            'Close-up of hands gripping a barbell, chalk dust visible, knurling texture in sharp detail, blurred gym background with warm tungsten lights',
            'Before and after transformation — split image concept, left side slouched posture in baggy clothes, right side confident posture in fitted activewear, same person same location',
            'Post-workout scene — person sitting on gym bench drinking from shaker bottle, towel around neck, phone showing workout tracker, satisfied exhausted expression'
        );
    }
    // Food / Recipe / Cooking
    else if (/food|recipe|cook|kitchen|meal|eat|bake|ingredient|breakfast|lunch|dinner|smoothie|salad|pasta|chicken|avocado|coffee|chocolate|prep/.test(text)) {
        scenes.push(
            'Beautifully plated dish on ceramic plate, rustic wooden table, fresh herbs as garnish, steam rising, natural window light from left side, shallow depth of field on the food',
            'Overhead flat lay of fresh ingredients arranged on marble counter — colorful vegetables, olive oil bottle, wooden cutting board, chef knife, linen napkin, bright natural light',
            'Hands chopping vegetables on wooden cutting board, kitchen background softly blurred, copper pots hanging, herbs in small pots on windowsill, warm inviting atmosphere',
            'Close-up of food texture — crispy golden crust, melted cheese pull, dripping sauce, or fresh fruit cross-section — macro lens, mouth-watering detail, soft backlight for glow',
            'Cozy breakfast table scene — steaming coffee cup, toast with avocado, fresh fruit bowl, morning newspaper, sunlight through kitchen window casting warm shadows on table',
            'Person tasting from a wooden spoon over a steaming pot, kitchen apron, genuine happy expression, busy kitchen counter with ingredients, lifestyle cooking moment'
        );
    }
    // Business / Entrepreneur / Money
    else if (/business|entrepreneur|startup|money|income|hustle|career|invest|profit|client|sales|marketing|brand|freelance|agency|strategy|revenue|wealth/.test(text)) {
        scenes.push(
            'Person working on laptop in modern minimalist office, clean white desk, large monitor showing analytics dashboard, coffee cup, small plant, natural light from large window',
            'Flat lay of business essentials on dark oak desk — MacBook Pro, leather notebook with pen, smartphone, AirPods case, espresso, reading glasses — top-down professional shot',
            'Confident person in smart casual attire standing in modern co-working space, glass walls, cityscape behind, arms crossed, natural power pose, editorial portrait',
            'Close-up of hands typing on laptop keyboard, screen showing revenue graphs going up, clean desk setup, warm desk lamp glow, focus and productivity atmosphere',
            'Whiteboard covered in strategy diagrams and sticky notes, person pointing at key section, modern office background, team meeting energy, natural light',
            'Person holding smartphone showing notification of payment received, slight smile, casual modern outfit, coffee shop background blurred, authentic success moment'
        );
    }
    // Fashion / Style / Outfit
    else if (/fashion|outfit|style|wear|look|dress|shoes|sneakers|streetwear|vintage|wardrobe|closet|accessori|jewelry|watch/.test(text)) {
        scenes.push(
            'Full-body outfit shot on urban street, person walking confidently, interesting architecture background, natural daylight, street style editorial, slight motion blur on edges',
            'Flat lay of curated outfit on white bedsheet — folded clothes, shoes, accessories, sunglasses, watch, perfume bottle — styled arrangement, overhead shot, soft shadows',
            'Close-up detail shot of accessories — watch on wrist, rings on fingers, or shoe texture — shallow DOF bokeh background, luxury editorial feel, natural sidelight',
            'Person standing in front of full-length mirror in bright walk-in closet, organized clothing racks behind, trying on outfit, natural light, candid fashion moment',
            'Street style portrait — waist up, person leaning against textured wall, interesting shadows, sunglasses, effortlessly cool pose, golden hour warm tones',
            'Shoe or bag detail shot on clean surface, product photography style, soft shadows, minimalist background, one accent prop like dried flowers or coffee cup'
        );
    }
    // Mindset / Motivation / Self-care
    else if (/mindset|motivation|success|growth|manifest|discipline|focus|goals|journal|meditat|gratitude|self.?care|mental|anxiety|peace|habits?|morning|routine/.test(text)) {
        scenes.push(
            'Person journaling at a clean desk by a window, warm morning light, steaming cup of tea, candle, plant, calm and focused expression, cozy minimalist space',
            'Flat lay of morning routine items — journal with pen, gratitude list, herbal tea, crystals, essential oil bottle, small plant — on linen fabric, soft warm tones',
            'Person meditating cross-legged on floor cushion, eyes closed, serene expression, minimalist room with single plant and sunlight beam, peaceful atmosphere',
            'Close-up of hands writing in a leather journal, beautiful handwriting visible, warm desk lamp light, wooden desk texture, ink pen, intimate focused moment',
            'Sunrise view through bedroom window, silhouette of person stretching with arms up, warm golden orange light flooding the room, new day energy, hopeful mood',
            'Cozy reading corner — person wrapped in blanket on armchair, book in hands, warm lamp light, rain visible through window, hygge comfort, soft muted earth tones'
        );
    }
    // Tech / AI / Digital
    else if (/tech|app|software|ai|digital|code|program|developer|saas|automation|tool|dashboard|data|computer|laptop/.test(text)) {
        scenes.push(
            'Developer at dual monitor setup, code on screen, dark room with RGB accent lighting, mechanical keyboard, focused expression, screen glow on face, cyberpunk aesthetic',
            'Flat lay of tech workspace — laptop, smartphone, tablet, wireless charger, USB-C hub, sticker-covered laptop lid — dark desk, overhead neon glow, clean arrangement',
            'Close-up of screen showing code or analytics dashboard, reflection visible in glasses worn by person, shallow DOF, blue-green screen light, cinematic tech mood',
            'Person demonstrating app on smartphone, screen visible to camera, clean modern background, product demo pose, good lighting on both face and phone screen',
            'Futuristic workspace — ultrawide monitor, standing desk, smart home devices, ambient LED strip lighting, city night view through window, productivity setup goals',
            'Hand holding phone showing AI chat interface or app dashboard, clean minimal background, focus on screen content, natural daylight, editorial tech lifestyle'
        );
    }
    // Travel / Adventure
    else if (/travel|trip|adventure|explore|beach|mountain|flight|hotel|resort|island|vacation|backpack|ocean|forest/.test(text)) {
        scenes.push(
            'Person standing at scenic viewpoint overlooking vast landscape, backpack on, arms slightly out, golden hour light, epic cinematic wide shot, sense of freedom and scale',
            'Flat lay of travel essentials on rustic wooden surface — passport, boarding pass, camera, sunglasses, map, local currency — warm natural light, wanderlust aesthetic',
            'Candid moment at outdoor café in a foreign city, local architecture in background, person laughing with coffee, cobblestone street, warm European afternoon light',
            'Close-up of hiking boots on rocky mountain trail, blurred valley view below, dust and texture visible, adventure mood, warm earthy tones, wide angle perspective',
            'Beach sunset scene — person walking along shoreline, gentle waves, footprints in sand, dramatic orange and pink sky, silhouette shot, peaceful and cinematic',
            'Hotel room morning — person sitting on white bed looking through large window at city or ocean view, bathrobe, room service tray, luxury travel moment'
        );
    }
    // Generic — build from topic words
    else {
        const tw = topicWords.slice(0, 3).join(' ') || 'lifestyle content';
        scenes.push(
            `Person engaged with ${tw} in a modern, well-lit space, natural window light, authentic candid moment, shallow depth of field, warm inviting tones, editorial lifestyle shot`,
            `Aesthetic flat lay arrangement related to ${tw} on clean surface — 5-7 relevant items neatly styled, overhead shot, soft even lighting, Instagram-worthy composition`,
            `Close-up detail shot capturing the essence of ${tw}, macro lens, beautiful bokeh background, rich textures visible, warm natural sidelight, editorial quality`,
            `Person confidently presenting or demonstrating ${tw}, eye-level medium shot, clean modern background, professional but approachable, natural soft lighting`,
            `Atmospheric wide shot showing ${tw} in context, environmental storytelling, leading lines, golden hour warmth, cinematic 35mm composition, aspirational mood`,
            `Behind-the-scenes candid moment related to ${tw}, authentic and unpolished, natural available light, documentary style, genuine human connection`
        );
    }

    // ── Add topic-specific details to each scene ──
    const topicDetail = topicWords.length > 0 ? ` The content is specifically about ${topicWords.slice(0, 4).join(', ')}.` : '';
    const hashDetail = hashtags.length > 0 ? ` Related to: ${hashtags.slice(0, 4).join(', ')}.` : '';
    const timeDetail = /morning|sunrise|dawn/.test(text) ? ' Morning golden light.' : /evening|sunset|night/.test(text) ? ' Evening warm ambient light.' : '';

    // ── Build final prompts ──
    const slideCount = Math.max(carouselCount || 0, Math.min(scenes.length, 6));
    const slideLabels = [
        '\u{1F4F8} Slide 1 \u2014 Hook / Cover',
        '\u{1F4A1} Slide 2 \u2014 The Problem',
        '\u{2728} Slide 3 \u2014 Key Insight',
        '\u{1F4CA} Slide 4 \u2014 Proof / Detail',
        '\u{1F527} Slide 5 \u2014 How-To / Action',
        '\u{1F525} Slide 6 \u2014 Result / CTA',
        '\u{1F3AF} Slide 7 \u2014 Save This',
        '\u{1F4F1} Slide 8 \u2014 Behind the Scenes',
        '\u{1F30D} Slide 9 \u2014 Lifestyle Context',
        '\u{1F48E} Slide 10 \u2014 Premium Detail'
    ];

    const prompts = [];
    for (let i = 0; i < slideCount && i < scenes.length; i++) {
        // Weave in a real sentence from the caption if available
        const realLine = realSentences[i % Math.max(realSentences.length, 1)] || '';
        const captionContext = realLine ? ` The image should visually represent: "${realLine}".` : '';

        const prompt = scenes[i] + '.' + captionContext + topicDetail + hashDetail + timeDetail + ' Shot on Sony A7IV, 85mm f/1.4, professional editorial quality. --ar 4:5 --style raw --v 6.1';
        prompts.push({ label: slideLabels[i] || `\u{1F5BC}\uFE0F Slide ${i+1}`, prompt });
    }

    return prompts;
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

// AI Enhance — only runs when user clicks the button (per-image, on demand)
async function aiEnhancePrompt(btn) {
    const url = btn.dataset.url;
    const targetId = btn.dataset.target;
    const target = document.getElementById(targetId);
    if (!url || !target) return;

    btn.disabled = true;
    btn.textContent = '\u23F3 Analyzing...';

    try {
        const res = await fetch('/.netlify/functions/analyze-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: url, slideNumber: 1 })
        });
        const data = await res.json();

        if (res.ok && data.prompt) {
            target.textContent = data.prompt;
            btn.textContent = '\u2705 Enhanced!';
            btn.style.background = '#0d6e66';
        } else {
            btn.textContent = '\u274C Failed';
            setTimeout(() => { btn.textContent = '\u2728 AI Enhance'; btn.disabled = false; }, 2000);
        }
    } catch (err) {
        btn.textContent = '\u274C Error';
        setTimeout(() => { btn.textContent = '\u2728 AI Enhance'; btn.disabled = false; }, 2000);
    }
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

// ── TAB 4: IMAGE PROMPTS WIRING ──────────────────────────
(function wireImagePromptsTab() {
    // Niche cards — single-select
    document.querySelectorAll('#nicheGrid .niche-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('#nicheGrid .niche-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });
    });

    // Event pills — single-select toggle (only one can be selected at a time)
    document.querySelectorAll('#eventPills .event-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const wasSelected = pill.classList.contains('selected');
            document.querySelectorAll('#eventPills .event-pill').forEach(p => p.classList.remove('selected'));
            if (!wasSelected) pill.classList.add('selected');
        });
    });

    const btn = document.getElementById('generateImgPromptsBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const selectedNicheEl = document.querySelector('#nicheGrid .niche-card.selected');
        const niche = selectedNicheEl ? selectedNicheEl.getAttribute('data-niche') : '';

        if (!niche) {
            showError('Please select a niche', 'imgErrorMessage');
            return;
        }

        const selectedPillEl = document.querySelector('#eventPills .event-pill.selected');
        const pillEvent = selectedPillEl ? selectedPillEl.getAttribute('data-event') : '';
        const customEvent = (document.getElementById('imgCustomEvent').value || '').trim();
        const event = customEvent || pillEvent || '';
        const style = document.getElementById('imgStyle').value || 'Instagram feed photos';
        const imgCount = document.getElementById('imgCount').value || '5';
        const imgExtra = (document.getElementById('imgExtra').value || '').trim();

        // Build a synthetic "flipped script" describing the user's intent
        const intentSubject = event || imgExtra || niche;
        const flippedScript = `${niche} content about ${intentSubject} in ${style} style`;

        const container = document.getElementById('imgResultsContainer');
        container.innerHTML = '';

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';

        try {
            const prompts = buildImagePrompts(flippedScript, '', null, parseInt(imgCount, 10));

            if (!prompts || prompts.length === 0) {
                showError('No prompts could be generated. Try different inputs.', 'imgErrorMessage');
                return;
            }

            prompts.forEach(({ label, prompt }) => {
                // Append imgExtra as a suffix before the technical specs (which start with " Shot on")
                let finalPrompt = prompt;
                if (imgExtra) {
                    const techMarker = ' Shot on';
                    const idx = finalPrompt.indexOf(techMarker);
                    const extraSuffix = `. Extra details: ${imgExtra}`;
                    if (idx !== -1) {
                        finalPrompt = finalPrompt.slice(0, idx) + extraSuffix + finalPrompt.slice(idx);
                    } else {
                        finalPrompt = finalPrompt + extraSuffix;
                    }
                }

                const div = document.createElement('div');
                div.className = 'result-section';
                div.innerHTML = `<h3>${escapeHtml(label)}</h3><p class="result-text" style="white-space:pre-wrap;">${escapeHtml(finalPrompt)}</p>`;
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.textContent = '\u{1F4CB} Copy';
                copyBtn.onclick = () => copyToClipboard(copyBtn);
                div.appendChild(copyBtn);
                container.appendChild(div);
            });
        } catch (err) {
            showError('Something went wrong: ' + err.message, 'imgErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
})();
