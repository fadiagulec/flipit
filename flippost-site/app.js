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


// ── ACCESS GATING (FlipItAccess from access.js) ─────────────
// Returns true if user can flip; otherwise shows paywall and returns false.
function gateOrPaywall() {
    if (!window.FlipItAccess) return true; // safety: lib not loaded, allow
    window.FlipItAccess.markFirstUseIfMissing();
    const state = window.FlipItAccess.getState();
    if (state.canFlip) return true;
    showPaywallModal(state);
    return false;
}

function recordFlipSuccess() {
    if (window.FlipItAccess) window.FlipItAccess.recordFlip();
    renderTrialBanner();
}

function showPaywallModal(state) {
    let modal = document.getElementById('flipit-paywall');
    if (modal) modal.remove(); // re-render so message matches current state
    modal = document.createElement('div');
    modal.id = 'flipit-paywall';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:36px 32px;max-width:480px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);position:relative;';
    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:24px;color:#1a1a2e;margin:0 0 12px;line-height:1.3;';
    const p1 = document.createElement('p');
    p1.style.cssText = 'color:#555;margin:0 0 24px;line-height:1.5;';

    const isProCap = state && state.isPro && (state.proCapHit === 'daily' || state.proCapHit === 'monthly');

    if (isProCap) {
        if (state.proCapHit === 'daily') {
            h3.textContent = '\u{1F525} You\u2019ve hit today\u2019s 50-flip Pro cap';
            p1.textContent = `You\u2019ve used ${state.proDailyCount} of ${state.proDailyLimit} flips today \u2014 thank you for being a power user! Resets at midnight. Need a higher cap? Reply to your purchase email and I\u2019ll set up a custom plan.`;
        } else {
            h3.textContent = '\u{1F525} You\u2019ve hit this month\u2019s 1,000-flip cap';
            p1.textContent = `You\u2019ve used ${state.proMonthlyCount} of ${state.proMonthlyLimit} flips this month \u2014 you\u2019re in the top 1% of users. Resets next month. Need a custom plan? Reply to your purchase email.`;
        }
    } else {
        h3.textContent = '\u26A1 You\u2019ve used your 3 free flips today';
        const daysSince = Math.max(0, (state.daysSinceFirstUse || 0) - 7);
        p1.textContent = daysSince > 0
            ? `Your 7-day free trial ended ${daysSince} day${daysSince === 1 ? '' : 's'} ago. Free tier resets at midnight \u2014 or unlock unlimited now.`
            : 'Free tier resets at midnight \u2014 or unlock unlimited now.';
    }

    card.appendChild(h3);
    card.appendChild(p1);

    if (!isProCap) {
        const a = document.createElement('a');
        a.href = 'https://buy.stripe.com/eVqaEQ4Rw5aa2nEbPw3Je0d';
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px;margin-bottom:12px;';
        a.textContent = '\u26A1 Unlock Pro \u2014 $37 Lifetime';
        card.appendChild(a);
        const p2 = document.createElement('p');
        p2.style.cssText = 'color:#888;font-size:13px;margin:8px 0 0;';
        p2.textContent = 'One-time payment \u00B7 No subscription \u00B7 30-day refund';
        card.appendChild(p2);
    } else {
        const mail = document.createElement('a');
        mail.href = 'mailto:fadiagulec@gmail.com?subject=FlipIt%20Custom%20Plan';
        mail.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px;margin-bottom:8px;';
        mail.textContent = '\u{1F4E7} Contact about a custom plan';
        card.appendChild(mail);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.cssText = 'position:absolute;top:12px;right:14px;background:none;border:none;color:#999;font-size:24px;cursor:pointer;line-height:1;padding:4px 8px;';
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    card.appendChild(closeBtn);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    modal.appendChild(card);
    document.body.appendChild(modal);
}

function renderTrialBanner() {
    if (!window.FlipItAccess) return;
    const state = window.FlipItAccess.getState();
    const existing = document.getElementById('flipit-trial-banner');
    if (existing) existing.remove();
    if (state.isPro) return; // pro users skip banner
    const banner = document.createElement('div');
    banner.id = 'flipit-trial-banner';
    banner.style.cssText = 'background:linear-gradient(135deg,#fff8e1,#fff3c4);border-bottom:1px solid #e8c840;padding:10px 16px;text-align:center;font-size:14px;color:#5a4a00;line-height:1.4;';
    const cta = ' <a href="https://buy.stripe.com/eVqaEQ4Rw5aa2nEbPw3Je0d" target="_blank" rel="noopener" style="color:#0d6e66;font-weight:700;text-decoration:none;border-bottom:1px solid #0d6e66;">Lock in $37 lifetime \u2192</a>';
    if (state.isWithinTrial) {
        const d = state.daysRemainingInTrial;
        banner.innerHTML = `\u{1F381} <strong>Free trial active</strong> \u2014 ${d} day${d === 1 ? '' : 's'} left of unlimited access.${cta}`;
    } else {
        const remaining = Math.max(0, state.dailyLimit - state.dailyCount);
        banner.innerHTML = `\u{1F4CA} <strong>Free tier:</strong> ${remaining} of ${state.dailyLimit} flip${state.dailyLimit === 1 ? '' : 's'} left today.${cta}`;
    }
    document.body.insertBefore(banner, document.body.firstChild);
}

// Render banner on page load
if (typeof window !== 'undefined' && document.readyState !== 'loading') {
    renderTrialBanner();
} else if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', renderTrialBanner);
}

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

// Sniff a media file's true type from the first bytes. Returns
// { mime, ext } or null if unrecognized.
function sniffMediaType(bytes) {
    if (!bytes || bytes.length < 12) return null;
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (brand.startsWith('qt')) return { mime: 'video/quicktime', ext: '.mov' };
        return { mime: 'video/mp4', ext: '.mp4' };
    }
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        return { mime: 'video/webm', ext: '.webm' };
    }
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { mime: 'image/jpeg', ext: '.jpg' };
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { mime: 'image/png', ext: '.png' };
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return { mime: 'image/gif', ext: '.gif' };
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return { mime: 'image/webp', ext: '.webp' };
    }
    return null;
}

// Force-download a file from URL. Tries direct fetch first (works for
// CORS-friendly sources like Cobalt tunnels). If that fails (LinkedIn /
// Twitter CDN block CORS), falls back to a same-origin server-side proxy
// that forces Content-Disposition: attachment so the browser actually
// downloads instead of opening the file in a new tab.
async function forceDownload(mediaUrl, filename) {
    // Attempt 1: direct fetch + blob (CORS-friendly URLs)
    try {
        const res = await fetch(mediaUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const buf = await res.arrayBuffer();
        if (!buf || buf.byteLength < 1024) throw new Error('response too small');

        const bytes = new Uint8Array(buf);
        const sniffed = sniffMediaType(bytes);
        const headerType = (res.headers.get('Content-Type') || '').toLowerCase();

        if (!sniffed && (headerType.startsWith('text/') || headerType.includes('json'))) {
            throw new Error('server returned ' + headerType + ' instead of media');
        }

        const mime = sniffed ? sniffed.mime : (headerType.split(';')[0] || 'application/octet-stream');
        let finalName = filename || 'flipit-media';
        if (sniffed) finalName = finalName.replace(/\.[a-z0-9]{2,4}$/i, '') + sniffed.ext;

        const blob = new Blob([bytes], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = finalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        return true;
    } catch (directErr) {
        console.warn('Direct fetch failed:', directErr.message, '— trying server proxy');
    }

    // Attempt 2: same-origin proxy (forces Content-Disposition: attachment).
    // The proxy fetches the URL server-side and streams it back, so CORS
    // doesn't block us and the browser is forced to download.
    try {
        const proxyUrl = '/.netlify/functions/proxy-download?url=' + encodeURIComponent(mediaUrl) +
                         (filename ? '&filename=' + encodeURIComponent(filename) : '');
        const res = await fetch(proxyUrl);
        if (res.status === 413) throw new Error('File too large to proxy — try a shorter clip');
        if (!res.ok) throw new Error('proxy HTTP ' + res.status);

        const buf = await res.arrayBuffer();
        if (!buf || buf.byteLength < 1024) throw new Error('proxy response too small');

        const bytes = new Uint8Array(buf);
        const sniffed = sniffMediaType(bytes);
        const headerType = (res.headers.get('Content-Type') || '').toLowerCase();
        const mime = sniffed ? sniffed.mime : (headerType.split(';')[0] || 'application/octet-stream');

        let finalName = filename || 'flipit-media';
        if (sniffed) finalName = finalName.replace(/\.[a-z0-9]{2,4}$/i, '') + sniffed.ext;

        const blob = new Blob([bytes], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = finalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        return true;
    } catch (proxyErr) {
        console.error('Proxy download failed:', proxyErr.message);
        throw proxyErr;
    }
}

document.getElementById('downloadBtn').addEventListener('click', handleDownload);

async function handleDownload() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    if (!url) { showError('Please enter a URL first', 'errorMessage'); return; }
    if (!gateOrPaywall()) return;

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

                // Sniff actual format from magic bytes — yt-dlp sometimes returns
                // .webm even when it claims .mp4, and the wrong MIME breaks playback.
                const sniffed = sniffMediaType(byteArr);
                const mime = sniffed ? sniffed.mime : 'video/mp4';
                const ext = sniffed ? sniffed.ext : (data.ext || '.mp4');

                const blob = new Blob([byteArr], { type: mime });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = (data.filename || 'flipit-video').replace(/\.[a-z0-9]{2,4}$/i, '') + ext;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
                showSuccess(`✅ Video download started! (${(byteArr.length / 1048576).toFixed(1)} MB ${ext})`, 'errorMessage');
            } catch (e) {
                console.error('Video decode failed:', e);
                showError('❌ Could not save video. The file may be corrupted — try a shorter clip.', 'errorMessage');
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
                try {
                    await forceDownload(data.downloadUrl, fname);
                    const mediaType = data.type === 'image' ? '\u{1F5BC}\uFE0F Image' : '\u{1F3AC} Video';
                    showSuccess(`\u2705 ${mediaType} download started!`, 'errorMessage');
                } catch (dlErr) {
                    showError('\u274C ' + (dlErr.message || 'Download failed') + '. The file may be too large \u2014 try a shorter clip.', 'errorMessage');
                }
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

    const section = document.createElement('div');
    section.className = 'result-section';

    const heading = document.createElement('h3');
    heading.textContent = `\u{1F3A0} Carousel — ${items.length} items found`;
    section.appendChild(heading);

    // Download All button — wired with addEventListener (CSP-safe)
    const downloadAllBtn = document.createElement('button');
    downloadAllBtn.textContent = `\u2B07\uFE0F Download All ${items.length} Items`;
    downloadAllBtn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:14px 24px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:12px;width:100%;justify-content:center;';
    section.appendChild(downloadAllBtn);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
    section.appendChild(grid);

    const individualButtons = [];
    items.forEach((item, i) => {
        const icon = item.type === 'video' ? '\u{1F3AC}' : '\u{1F5BC}\uFE0F';
        const label = item.type === 'video' ? 'Video' : 'Image';
        const ext = item.type === 'video' ? '.mp4' : '.jpg';
        const fname = `flipit-${platform || 'media'}-${i + 1}${ext}`;
        const baseLabel = `${icon} ${label} ${i + 1}`;

        const btn = document.createElement('button');
        btn.className = 'carousel-dl-btn';
        btn.textContent = baseLabel;
        btn.dataset.url = item.url;
        btn.dataset.fname = fname;
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#fff;color:#0d6e66;border:2px solid #0d6e66;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;transition:all 0.2s;flex:1;min-width:120px;justify-content:center;';
        btn.addEventListener('mouseover', () => { btn.style.background = '#0d6e66'; btn.style.color = '#fff'; });
        btn.addEventListener('mouseout', () => { btn.style.background = '#fff'; btn.style.color = '#0d6e66'; });
        btn.addEventListener('click', () => {
            forceDownload(item.url, fname).then(() => {
                btn.textContent = '\u2705 Done';
                setTimeout(() => { btn.textContent = baseLabel; }, 2000);
            }).catch((err) => {
                btn.textContent = '\u274C Failed';
                btn.title = (err && err.message) || '';
                setTimeout(() => { btn.textContent = baseLabel; }, 2500);
            });
        });
        individualButtons.push(btn);
        grid.appendChild(btn);
    });

    downloadAllBtn.addEventListener('click', async () => {
        for (const btn of individualButtons) {
            const baseLabel = btn.textContent;
            btn.textContent = '\u23F3...';
            try {
                await forceDownload(btn.dataset.url, btn.dataset.fname);
                btn.textContent = '\u2705 Done';
            } catch (err) {
                btn.textContent = '\u274C Failed';
                btn.title = (err && err.message) || '';
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    });

    container.prepend(section);
}

// ── PROMPT CARD HELPER (CSP-safe) ────────────────────────
// Renders an array of {label, prompt} as cards with copy buttons.
// Uses createElement + addEventListener so it works under
// `script-src 'self'` (which blocks inline onclick).
function renderPromptCards(target, prompts, accentColor) {
    if (!target || !Array.isArray(prompts)) return;
    target.innerHTML = '';
    prompts.forEach((p) => {
        const card = document.createElement('div');
        card.style.cssText = 'margin-bottom:14px;padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #e8e4de;';

        const lbl = document.createElement('p');
        lbl.style.cssText = `color:${accentColor};font-weight:700;font-size:14px;margin-bottom:6px;`;
        lbl.textContent = p.label || 'Prompt';
        card.appendChild(lbl);

        const txt = document.createElement('p');
        txt.className = 'result-text';
        txt.style.cssText = 'margin-bottom:8px;white-space:pre-wrap;';
        txt.textContent = p.prompt || '';
        card.appendChild(txt);

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.style.cssText = `background:${accentColor};color:#fff;margin-top:0;`;
        btn.textContent = '\u{1F4CB} Copy';
        btn.addEventListener('click', () => {
            const text = p.prompt || '';
            const restore = () => setTimeout(() => { btn.textContent = '\u{1F4CB} Copy'; }, 2000);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    btn.textContent = '\u2705 Copied!';
                    restore();
                }).catch(() => {
                    fallbackCopy(text, btn, restore);
                });
            } else {
                fallbackCopy(text, btn, restore);
            }
        });
        card.appendChild(btn);

        target.appendChild(card);
    });
}

// Legacy clipboard fallback for browsers / contexts where the
// modern API is unavailable (older Safari, non-secure context).
function fallbackCopy(text, btn, restore) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = ok ? '\u2705 Copied!' : '\u274C Copy failed';
        restore();
    } catch (e) {
        btn.textContent = '\u274C Copy failed';
        restore();
    }
}

// ── EXTRACT & FLIP ───────────────────────────────────────
document.getElementById('extractBtn').addEventListener('click', handleExtractAndTwist);

async function handleExtractAndTwist() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }
    if (!gateOrPaywall()) return;

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
        recordFlipSuccess();
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
        appendShareButton(container, {
            twisted: data.twisted,
            hook: data.prompt || '',
            platform: platform || ''
        });
    }
}

// ── SHAREABLE FLIP URL ────────────────────────────────────
// Encode the flip into a URL-safe base64 ?d= param so any flip becomes
// a self-contained shareable page at /share.html?d=...
// No server, no DB — every recipient who clicks lands on a page that
// shows the flip + a "Make your own free" CTA.
function encodeSharePayload(payload) {
    const json = JSON.stringify(payload);
    // utf-8 bytes → base64 → url-safe
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildShareUrl(payload) {
    const trimmed = {
        twisted: (payload.twisted || '').slice(0, 4000),
        hook: (payload.hook || '').slice(0, 500),
        platform: payload.platform || ''
    };
    const data = encodeSharePayload(trimmed);
    return window.location.origin + '/share.html?d=' + data;
}

function appendShareButton(container, payload) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;align-items:center;';

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn-tertiary';
    shareBtn.style.cssText = 'background:#fff;color:#0d6e66;border:2px solid #0d6e66;padding:12px 24px;font-weight:700;border-radius:10px;cursor:pointer;font-size:15px;';
    shareBtn.textContent = '\u{1F517} Share this Flip';

    const note = document.createElement('span');
    note.style.cssText = 'color:#888;font-size:13px;';
    note.textContent = 'Anyone you send the link to lands on a page showing this flip.';

    wrap.appendChild(shareBtn);
    container.appendChild(wrap);
    const noteWrap = document.createElement('div');
    noteWrap.style.cssText = 'text-align:center;margin-top:6px;';
    noteWrap.appendChild(note);
    container.appendChild(noteWrap);

    shareBtn.addEventListener('click', () => {
        const url = buildShareUrl(payload);
        // Try Web Share API first (mobile), fallback to clipboard
        if (navigator.share) {
            navigator.share({
                title: 'A viral flip — Made with FlipIt',
                text: payload.hook || 'See this flipped script',
                url: url
            }).catch(() => copyShareLink(url, shareBtn));
        } else {
            copyShareLink(url, shareBtn);
        }
    });
}

function copyShareLink(url, btn) {
    const restore = () => setTimeout(() => { btn.textContent = '\u{1F517} Share this Flip'; }, 2500);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            btn.textContent = '✅ Link copied! Paste anywhere.';
            restore();
        }).catch(() => {
            // Fallback via textarea
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                btn.textContent = '✅ Link copied!';
            } catch (e) {
                btn.textContent = '❌ Copy failed';
            }
            document.body.removeChild(ta);
            restore();
        });
    } else {
        btn.textContent = url;
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

    // Video Prompt click handler — calls Claude via /video-prompts
    videoBtn.addEventListener('click', async () => {
        if (!gateOrPaywall()) return;
        const existing = container.querySelector('.video-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const wrap = document.createElement('div');
        wrap.className = 'result-section video-prompt-section';
        wrap.innerHTML = `<h3>\u{1F3AC} Video Creation Prompts</h3><p style="color:#777;font-size:14px;margin-bottom:10px;">AI is writing prompts that match your script. Paste into Runway, Pika, Kling, Sora, or Luma.</p><p class="result-text" style="color:#999;">⏳ Generating prompts…</p>`;
        container.appendChild(wrap);
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            const res = await fetch('/.netlify/functions/video-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flippedScript, platform })
            });
            const data = await res.json();
            if (!res.ok || !data.prompts) throw new Error(data.error || 'Failed to generate');

            wrap.innerHTML = `<h3>\u{1F3AC} Video Creation Prompts</h3><p style="color:#777;font-size:14px;margin-bottom:10px;">Paste each into Runway, Pika, Kling, Sora, or Luma.</p><div data-cards></div>`;
            renderPromptCards(wrap.querySelector('[data-cards]'), data.prompts, '#0d6e66');
            recordFlipSuccess();
        } catch (err) {
            console.error('Video prompt error:', err);
            wrap.querySelector('.result-text').textContent = '❌ ' + (err.message || 'Could not generate video prompts');
            wrap.querySelector('.result-text').style.color = '#c2185b';
        }
    });

    // Image Prompt click handler — AI Vision analyzes actual downloaded images
    imageBtn.addEventListener('click', async () => {
        if (!gateOrPaywall()) return;
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
                        slideDiv.innerHTML = '';
                        const lbl = document.createElement('p');
                        lbl.style.cssText = 'color:#c2185b;font-weight:700;font-size:14px;margin-bottom:6px;';
                        lbl.textContent = `\u{1F5BC}\uFE0F IMAGE ${i + 1} of ${imageUrls.length}`;
                        const txt = document.createElement('p');
                        txt.className = 'result-text';
                        txt.style.cssText = 'margin-bottom:8px;';
                        txt.textContent = data.prompt;
                        const cBtn = document.createElement('button');
                        cBtn.className = 'copy-btn';
                        cBtn.style.cssText = 'background:#c2185b;color:#fff;margin-top:0;';
                        cBtn.textContent = '\u{1F4CB} Copy';
                        cBtn.addEventListener('click', () => {
                            const t = data.prompt || '';
                            const restore = () => setTimeout(() => { cBtn.textContent = '\u{1F4CB} Copy'; }, 2000);
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(t).then(() => { cBtn.textContent = '\u2705 Copied!'; restore(); })
                                    .catch(() => fallbackCopy(t, cBtn, restore));
                            } else { fallbackCopy(t, cBtn, restore); }
                        });
                        slideDiv.appendChild(lbl);
                        slideDiv.appendChild(txt);
                        slideDiv.appendChild(cBtn);
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
            // No images downloaded — generate prompts FROM THE SCRIPT via Claude
            imageBtn.disabled = true;
            imageBtn.textContent = '⏳ Generating prompts...';

            const div = document.createElement('div');
            div.className = 'result-section image-prompt-section';
            div.style.borderLeftColor = '#c2185b';
            div.innerHTML = `<h3>\u{1F5BC}️ AI Image Prompts</h3><p style="color:#777;font-size:14px;margin-bottom:14px;">Generating prompts that illustrate your script…</p><p class="result-text" style="color:#999;">⏳ Working on it…</p>`;
            container.appendChild(div);
            div.scrollIntoView({ behavior: 'smooth', block: 'start' });

            try {
                const res = await fetch('/.netlify/functions/image-prompts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ flippedScript, platform, count: 5 })
                });
                const data = await res.json();
                if (!res.ok || !data.prompts) throw new Error(data.error || 'Failed to generate');

                div.innerHTML = `<h3>\u{1F5BC}️ AI Image Prompts — ${data.prompts.length} ideas</h3><p style="color:#777;font-size:14px;margin-bottom:14px;">Paste each into Midjourney, DALL-E, Ideogram, or Leonardo.</p><div data-cards></div>`;


                renderPromptCards(div.querySelector('[data-cards]'), data.prompts, '#c2185b');
            recordFlipSuccess();
            } catch (err) {
                console.error('Image prompt error:', err);
                div.querySelector('.result-text').textContent = '❌ ' + (err.message || 'Could not generate image prompts');
                div.querySelector('.result-text').style.color = '#c2185b';
            } finally {
                imageBtn.disabled = false;
                imageBtn.textContent = '\u{1F5BC}️ IMAGE PROMPT';
            }
        }
    });
}

// ── SCRIPT REWRITE ───────────────────────────────────────
const REWRITE_URL = '/.netlify/functions/rewrite-script';

document.getElementById('rewriteBtn').addEventListener('click', handleRewriteScript);

async function handleRewriteScript() {
    const script = document.getElementById('scriptInput').value.trim();
    if (!script) { showError('Please paste a script or caption', 'scriptErrorMessage'); return; }
    if (!gateOrPaywall()) return;

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
        recordFlipSuccess();

        // Video + Image prompts
        if (data.rewritten) {
            appendPromptButtons(container, data.rewritten, script, null);
            appendShareButton(container, {
                twisted: data.rewritten,
                hook: data.hook || '',
                platform: ''
            });
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
    if (!gateOrPaywall()) return;

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
        recordFlipSuccess();
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
    // Niche cards — single-select. aria-pressed mirrors the .selected class
    // so screen readers announce the toggle state.
    document.querySelectorAll('#nicheGrid .niche-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('#nicheGrid .niche-card').forEach(c => {
                c.classList.remove('selected');
                c.setAttribute('aria-pressed', 'false');
            });
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');
        });
    });

    // Event pills — single-select toggle (clicking a selected pill deselects).
    document.querySelectorAll('#eventPills .event-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const wasSelected = pill.classList.contains('selected');
            document.querySelectorAll('#eventPills .event-pill').forEach(p => {
                p.classList.remove('selected');
                p.setAttribute('aria-pressed', 'false');
            });
            if (!wasSelected) {
                pill.classList.add('selected');
                pill.setAttribute('aria-pressed', 'true');
            }
        });
    });

    const btn = document.getElementById('generateImgPromptsBtn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        if (!gateOrPaywall()) return;
        const selectedNicheEl = document.querySelector('#nicheGrid .niche-card.selected');
        const niche = selectedNicheEl ? selectedNicheEl.getAttribute('data-niche') : '';

        if (!niche) {
            showError('Please select a niche', 'imgErrorMessage');
            return;
        }

        const selectedPillEl = document.querySelector('#eventPills .event-pill.selected');
        const pillEvent = selectedPillEl ? selectedPillEl.getAttribute('data-event') : '';
        const customEvent = (document.getElementById('imgCustomEvent').value || '').trim();
        const style = document.getElementById('imgStyle').value || 'Instagram feed photos';
        const count = parseInt(document.getElementById('imgCount').value || '5', 10);
        const extra = (document.getElementById('imgExtra').value || '').trim();

        const container = document.getElementById('imgResultsContainer');
        container.innerHTML = '<div class="loading">⏳ AI is writing prompts specifically for your niche…</div>';

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';

        try {
            const res = await fetch('/.netlify/functions/image-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ niche, event: pillEvent, customEvent, style, count, extra })
            });
            const data = await res.json();
            if (!res.ok || !data.prompts || data.prompts.length === 0) {
                throw new Error(data.error || 'No prompts generated');
            }

            container.innerHTML = '';
            data.prompts.forEach(({ label, prompt }) => {
                const div = document.createElement('div');
                div.className = 'result-section';
                div.innerHTML = `<h3>${escapeHtml(label || 'Prompt')}</h3><p class="result-text" style="white-space:pre-wrap;">${escapeHtml(prompt)}</p>`;
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.textContent = '\u{1F4CB} Copy';
                copyBtn.onclick = () => copyToClipboard(copyBtn);
                div.appendChild(copyBtn);
                container.appendChild(div);
            });
        } catch (err) {
            console.error('Image prompts error:', err);
            container.innerHTML = '';
            showError('❌ ' + (err.message || 'Could not generate image prompts. Please try again.'), 'imgErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
})();
