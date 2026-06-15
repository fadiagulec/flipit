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

// Single-tier pricing: $57 lifetime (anchored against $99), one-time, no subs.
// Stripe link \u2014 still points to the $67 Stripe product. REPLACE with the
// new $57 payment link from https://dashboard.stripe.com/payment-links so
// what customers actually get charged matches the displayed price.
const STRIPE_LIFETIME_LINK = 'https://buy.stripe.com/28EcMY83I1XYd2i5r83Je0q';

// `reason`: 'flip_cap' (default \u2014 used 3/day) | 'pro_feature' (clicked
// Image Prompts / Video Prompts / Vision while on free tier) | 'pro_cap'
// (Pro user hit daily/monthly cap).
function showPaywallModal(state, reason) {
    let modal = document.getElementById('flipit-paywall');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'flipit-paywall';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;overflow-y:auto;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:36px 32px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);position:relative;';

    const isProCap = reason === 'pro_cap' || (state && state.isPro && (state.proCapHit === 'daily' || state.proCapHit === 'monthly'));
    const isProFeature = reason === 'pro_feature';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:24px;color:#1a1a2e;margin:0 0 12px;line-height:1.3;';
    const p1 = document.createElement('p');
    p1.style.cssText = 'color:#555;margin:0 0 24px;line-height:1.5;';

    if (isProCap) {
        if (state.proCapHit === 'monthly') {
            h3.textContent = '\u{1F525} You\u2019ve hit this month\u2019s 1,000-flip cap';
            p1.textContent = `You\u2019ve used ${state.proMonthlyCount} of ${state.proMonthlyLimit} flips this month \u2014 you\u2019re in the top 1% of users. Resets next month. Need a custom plan? Reply to your purchase email.`;
        } else {
            h3.textContent = '\u{1F525} You\u2019ve hit today\u2019s 50-flip Pro cap';
            p1.textContent = `You\u2019ve used ${state.proDailyCount} of ${state.proDailyLimit} flips today \u2014 thank you for being a power user! Resets at midnight. Need a higher cap? Reply to your purchase email.`;
        }
    } else if (isProFeature) {
        h3.textContent = '\u{1F512} Pro-only feature';
        p1.textContent = 'Image Prompts, Video Prompts, and AI Vision are Pro features. Free tier gets 3 flips/day with rate + rewrite. Unlock everything below \u2014 one-time payment, no subscription.';
    } else {
        h3.textContent = '\u26A1 You\u2019ve used your 3 free flips today';
        const daysSince = Math.max(0, ((state && state.daysSinceFirstUse) || 0) - 7);
        p1.textContent = daysSince > 0
            ? `Your 7-day free trial ended ${daysSince} day${daysSince === 1 ? '' : 's'} ago. Free tier resets at midnight \u2014 or unlock unlimited below.`
            : 'Free tier resets at midnight \u2014 or unlock unlimited below.';
    }

    card.appendChild(h3);
    card.appendChild(p1);

    if (isProCap) {
        // Pro user hit a cap \u2014 they already paid, don't show pricing again
        const mail = document.createElement('a');
        mail.href = 'mailto:contact@earnwith-ai.com?subject=FlipIt%20Custom%20Plan';
        mail.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px;margin-bottom:8px;';
        mail.textContent = '\u{1F4E7} Contact about a custom plan';
        card.appendChild(mail);
    } else {
        // Single CTA: $57 lifetime, one-time payment (anchored against $99)
        const a = document.createElement('a');
        a.href = STRIPE_LIFETIME_LINK;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;text-decoration:none;padding:16px 36px;border-radius:10px;font-weight:700;font-size:17px;margin-bottom:12px;';
        a.innerHTML = '\u26A1 Unlock FlipIt \u2014 <s style="opacity:0.65;font-weight:600;">$99</s> $57 Lifetime';
        card.appendChild(a);
        const trust = document.createElement('p');
        trust.style.cssText = 'color:#888;font-size:13px;margin:8px 0 0;line-height:1.5;';
        trust.textContent = 'One-time payment \u00B7 No subscription \u00B7 30-day refund \u00B7 All future updates included';
        card.appendChild(trust);
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

// Pro-feature gate: like gateOrPaywall() but ALSO rejects free users
// regardless of their daily-flip count. Used by Image Prompts, Video
// Prompts, and any other paid-tier-only feature.
function gateProFeature() {
    if (!window.FlipItAccess) return true;
    const state = window.FlipItAccess.getState();
    if (state.isPro && state.canFlip) return true;
    if (state.isPro && !state.canFlip) {
        // Pro user hit a cap \u2014 show the cap modal
        showPaywallModal(state, 'pro_cap');
        return false;
    }
    // Free user \u2014 block + show upgrade modal
    showPaywallModal(state, 'pro_feature');
    return false;
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

    const strongEl = document.createElement('strong');
    const numSpan = document.createElement('span');

    if (state.isWithinTrial) {
        const d = state.daysRemainingInTrial;
        strongEl.textContent = 'Free trial active';
        numSpan.textContent = String(d);
        banner.append(
            '\u{1F381} ',
            strongEl,
            ' \u2014 ',
            numSpan,
            ` day${d === 1 ? '' : 's'} left of unlimited access. `
        );
    } else {
        const remaining = Math.max(0, state.dailyLimit - state.dailyCount);
        strongEl.textContent = 'Free tier:';
        numSpan.textContent = `${remaining} of ${state.dailyLimit}`;
        banner.append(
            '\u{1F4CA} ',
            strongEl,
            ' ',
            numSpan,
            ` flip${state.dailyLimit === 1 ? '' : 's'} left today. `
        );
    }

    const ctaLink = document.createElement('a');
    ctaLink.href = 'https://buy.stripe.com/28EcMY83I1XYd2i5r83Je0q';
    ctaLink.target = '_blank';
    ctaLink.rel = 'noopener';
    ctaLink.style.cssText = 'color:#0d6e66;font-weight:700;text-decoration:none;border-bottom:1px solid #0d6e66;';
    ctaLink.textContent = 'Lock in $57 lifetime \u2192';
    banner.appendChild(ctaLink);

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
// IMPORTANT: never hide #actionButtons. The Flip button is the primary CTA and
// must always be visible so the user knows it exists. Validation on click in
// handleExtractAndTwist handles empty / unrecognized URLs with a friendly error.
function showPlatformBadge(url) {
    const platform = detectPlatform(url);
    const badge = document.getElementById('platformBadge');
    document.getElementById('actionButtons').style.display = 'flex';

    if (platform) {
        badge.textContent = `${platformEmojis[platform]} ${platform.toUpperCase()} detected`;
        badge.style.cssText = 'display:inline-block;background:#e8f4f3;color:#0d6e66;padding:6px 12px;border-radius:8px;font-weight:600;font-size:14px;margin-top:8px;';
        return platform;
    } else {
        // Special-case the owner-only /unlock/ link so the owner doesn't get
        // stuck trying to "Flip" their own Pro unlock URL.
        const isUnlockUrl = /^https?:\/\/[^/]*flipit\.earnwith-ai\.com\/unlock\//i.test(url)
            || url.startsWith('/unlock/');
        if (isUnlockUrl) {
            badge.innerHTML = '⚠️ That\'s your Pro <strong>unlock link</strong> — paste it into your <strong>browser\'s address bar</strong> (top of the window), not here. This box is for Instagram/TikTok/YouTube post URLs.';
            badge.style.cssText = 'display:block;background:#fff4e0;color:#8a5a00;padding:10px 14px;border-radius:8px;font-size:14px;margin-top:8px;line-height:1.5;border-left:3px solid #e0a020;';
        } else {
            badge.innerHTML = 'ℹ️ Paste a post URL from Instagram, TikTok, YouTube, LinkedIn, Facebook, X, or Threads.';
            badge.style.cssText = 'display:block;background:#f3f2ee;color:#666;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:8px;line-height:1.5;';
        }
        return null;
    }
}

// URL Input Event Listener
document.getElementById('urlInput').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    // Always keep the Flip button visible — only adjust the badge/hint.
    document.getElementById('actionButtons').style.display = 'flex';
    if (url) {
        showPlatformBadge(url);
    } else {
        document.getElementById('platformBadge').style.display = 'none';
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

// iOS Safari ignores <a download> entirely — a programmatic click on a
// download link either navigates to the blob URL (opening the video as a
// page) or silently does nothing. The only reliable way to "save" media on
// iOS is to render it inline so the user can long-press → Save to Photos
// / Save Image. Snaptik, Savefrom, etc. all use this pattern on iPhone.
function isIOS() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    // iPadOS 13+ identifies as macOS; detect by touch + platform.
    const iPadOS = /Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

// Show a modal containing the media (video or image) with explicit
// long-press-to-save instructions. Used on iOS where <a download> is broken.
function showIOSSaveModal(blobUrl, mime, suggestedFilename) {
    const isVideo = /^video\//i.test(mime);
    const isImage = /^image\//i.test(mime);

    let modal = document.getElementById('flipit-ios-save');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'flipit-ios-save';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;overflow-y:auto;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:18px;padding:20px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);position:relative;';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:18px;color:#1a1a2e;margin:0 0 6px;line-height:1.3;';
    h3.textContent = isVideo ? '🎬 Your video is ready' : '🖼️ Your image is ready';
    card.appendChild(h3);

    const tip = document.createElement('p');
    tip.style.cssText = 'color:#555;margin:0 0 16px;font-size:14px;line-height:1.5;';
    tip.innerHTML = isVideo
        ? '<strong>Long-press the video below</strong> → <strong>"Save to Photos"</strong>.<br>iOS blocks one-click downloads — this is the only way.'
        : '<strong>Long-press the image below</strong> → <strong>"Save to Photos"</strong>.';
    card.appendChild(tip);

    if (isVideo) {
        const vid = document.createElement('video');
        vid.src = blobUrl;
        vid.controls = true;
        vid.setAttribute('playsinline', '');
        vid.setAttribute('webkit-playsinline', '');
        vid.style.cssText = 'width:100%;max-width:380px;border-radius:12px;background:#000;margin-bottom:12px;';
        card.appendChild(vid);
    } else if (isImage) {
        const img = document.createElement('img');
        img.src = blobUrl;
        img.alt = 'Tap and hold to save';
        img.style.cssText = 'width:100%;max-width:380px;border-radius:12px;margin-bottom:12px;';
        card.appendChild(img);
    }

    // Fallback: a regular link in case long-press doesn't surface Save (some
    // 3rd party iOS browsers like Firefox iOS). Tapping it at least opens the
    // media so the user can use the browser's own share menu.
    const fallback = document.createElement('a');
    fallback.href = blobUrl;
    fallback.target = '_blank';
    fallback.rel = 'noopener';
    fallback.style.cssText = 'display:inline-block;color:#0d6e66;text-decoration:underline;font-size:13px;margin-bottom:8px;';
    fallback.textContent = isVideo ? 'Or tap here to open the video' : 'Or tap here to open the image';
    card.appendChild(fallback);

    const close = document.createElement('button');
    close.textContent = 'Done';
    close.style.cssText = 'display:block;width:100%;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;padding:14px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;margin-top:8px;';
    close.addEventListener('click', () => modal.remove());
    card.appendChild(close);

    modal.appendChild(card);
    document.body.appendChild(modal);
}

// Trigger a save on desktop (programmatic <a download> click) OR on iOS
// (long-press modal). Centralizes the iOS branching so callers don't repeat
// the userAgent check.
function triggerSave(blobUrl, mime, filename) {
    if (isIOS()) {
        showIOSSaveModal(blobUrl, mime, filename);
        return;
    }
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
        triggerSave(blobUrl, mime, finalName);
        // Keep blob alive long enough for iOS modal user to long-press save.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
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
        triggerSave(blobUrl, mime, finalName);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return true;
    } catch (proxyErr) {
        console.error('Proxy download failed:', proxyErr.message);
        throw proxyErr;
    }
}

document.getElementById('downloadBtn').addEventListener('click', handleDownload);

// ── ERASER TAB: upload a video file directly, no URL needed ───────────
// Same draw-to-erase modal as the post-download flow — we just feed it
// the uploaded file instead of a Railway-returned blob.
(function wireEraserTab() {
    const fileInput = document.getElementById('eraserFile');
    const drop = document.getElementById('eraserDrop');
    const status = document.getElementById('eraserStatus');
    if (!fileInput || !drop || !status) return;

    const MAX_BYTES = 18 * 1024 * 1024; // matches the Railway endpoint cap

    function setStatus(msg, ok) {
        status.textContent = msg || '';
        status.style.color = ok === false ? '#c2185b' : (ok === true ? '#0d6e66' : '#555');
    }

    // Same-origin proxy → Railway. Going through Netlify Functions avoids
    // browser-side failures ("Failed to fetch") that happen when a network
    // or extension blocks *.up.railway.app directly.
    const RAILWAY_PREPARE_URL = '/.netlify/functions/transcode-eraser-video';

    async function handleFile(file) {
        if (!file) return;
        if (!/^video\//i.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
            setStatus('That doesn\'t look like a video file. Try MP4, MOV, or WebM.', false);
            return;
        }
        if (file.size > MAX_BYTES) {
            setStatus(`File is ${(file.size/1048576).toFixed(1)} MB — please use a clip under 18 MB. (Trim it in your phone\'s Photos app, or screen-record a shorter section.)`, false);
            return;
        }
        setStatus('⏳ Reading video…', null);
        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            // Chunked base64 encode — atob/btoa choke on 18MB strings on
            // some mobile browsers, so we encode 64KB at a time.
            let binStr = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                binStr += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            }
            const rawBase64 = btoa(binStr);
            const baseName = (file.name || 'eraser-input').replace(/\.[a-z0-9]{2,4}$/i, '');

            // ALWAYS transcode through Railway before opening the modal.
            // iPhone .mov is HEVC which desktop Chrome/Firefox can't decode
            // in <video>, so without this step the preview is black on every
            // non-Safari browser. ffmpeg → H.264 MP4 plays everywhere.
            setStatus('⏳ Converting video for preview (this takes 5–15s, normal)…', null);
            let previewBase64 = rawBase64;
            let previewMime = file.type || 'video/mp4';
            let transcoded = false;
            let transcodeErr = '';
            try {
                const resp = await fetch(RAILWAY_PREPARE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoData: rawBase64 })
                });
                const data = await resp.json().catch(() => ({}));
                if (resp.ok && data.success && data.videoData) {
                    previewBase64 = data.videoData;
                    previewMime = data.mime || 'video/mp4';
                    transcoded = true;
                } else {
                    transcodeErr = data.error || ('HTTP ' + resp.status);
                    console.warn('Transcode failed, using original:', transcodeErr, data.detail || '');
                }
            } catch (xErr) {
                transcodeErr = xErr.message || 'network error';
                console.warn('Transcode request failed, using original:', transcodeErr);
            }

            window._lastDownloadedVideo = {
                base64: previewBase64,
                mime: previewMime,
                ext: '.mp4',
                filename: baseName + '.mp4'
            };
            if (transcoded) {
                setStatus(`✅ Converted to H.264 · opening eraser…`, true);
            } else {
                // Surface the transcode failure so the user knows the
                // preview-may-be-black overlay is BECAUSE we couldn't convert,
                // not because we never tried. Open the modal anyway — they
                // can still erase blind, or switch browsers.
                setStatus(`⚠️ Couldn't convert (${transcodeErr.slice(0, 80)}) — preview may be black, but erasure still works. Opening…`, false);
            }
            openEraseModal();
        } catch (err) {
            console.error('Eraser file load failed:', err);
            setStatus('❌ Could not read that file. Try a different one.', false);
        }
    }

    fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        // Reset value so picking the same file twice re-fires change.
        fileInput.value = '';
        handleFile(f);
    });

    // Drag & drop support (no-op on touch devices, harmless).
    ['dragenter', 'dragover'].forEach((ev) => {
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            drop.style.background = '#e8f4f3';
        });
    });
    ['dragleave', 'drop'].forEach((ev) => {
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            drop.style.background = '#f7fbfa';
        });
    });
    drop.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
    });
})();

// ── ERASE AREAS (advanced watermark removal) ──────────────────────────
// After a Railway base64 download succeeds, surface a button that opens a
// modal where the user can drag rectangles over a video preview to mark
// watermarks / handles / logos. Selected boxes are sent to the Railway
// /erase-region endpoint which runs ffmpeg's delogo filter over each.
const RAILWAY_ERASE_URL = '/.netlify/functions/erase-region-video';

function showEraseAreasButton() {
    const host = document.getElementById('errorMessage');
    if (!host) return;
    const existing = document.getElementById('eraseAreasBtn');
    if (existing) existing.remove();
    const btn = document.createElement('button');
    btn.id = 'eraseAreasBtn';
    btn.type = 'button';
    btn.textContent = '🎯 Erase watermarks / names from this video';
    btn.style.cssText = 'display:block;margin:10px auto 0;background:#fff;color:#0d6e66;border:2px solid #0d6e66;padding:10px 18px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;';
    btn.addEventListener('mouseenter', () => { btn.style.background = '#0d6e66'; btn.style.color = '#fff'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; btn.style.color = '#0d6e66'; });
    btn.addEventListener('click', openEraseModal);
    host.parentNode.insertBefore(btn, host.nextSibling);
}

function openEraseModal() {
    const v = window._lastDownloadedVideo;
    if (!v || !v.base64) {
        showError('No video loaded — download one first.', 'errorMessage');
        return;
    }

    // Reconstruct blob URL for preview from the saved base64
    const byteChars = atob(v.base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: v.mime });
    const blobUrl = URL.createObjectURL(blob);

    let modal = document.getElementById('flipit-erase-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'flipit-erase-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:9999;padding:12px;overflow-y:auto;';

    const card = document.createElement('div');
    // Much wider card so the preview is actually usable. min(96vw, 880px)
    // gives a near-full-screen workspace on phone AND room for precise
    // drawing on desktop.
    card.style.cssText = 'background:#fff;border-radius:14px;padding:18px;width:min(96vw,1000px);max-height:96vh;overflow-y:auto;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);';

    const h3 = document.createElement('h3');
    h3.textContent = '🎯 Draw boxes over what to erase';
    h3.style.cssText = 'font-size:19px;color:#1a1a2e;margin:0 0 4px;';
    const sub = document.createElement('p');
    sub.innerHTML = 'Click and drag (or tap-drag on phone) over each watermark, handle, or burned-in name. You can draw multiple boxes. Tap <strong>Erase & Download</strong> when done.';
    sub.style.cssText = 'color:#555;font-size:14px;margin:0 0 14px;line-height:1.5;';
    card.appendChild(h3);
    card.appendChild(sub);

    // Stage: relatively positioned wrapper that holds the video AND the
    // canvas overlay aligned to the same pixel area. min(800px, 70vh, 96%)
    // keeps the stage big on desktop while never overflowing on phone.
    const stage = document.createElement('div');
    stage.style.cssText = 'position:relative;display:inline-block;width:100%;max-width:900px;max-height:82vh;background:#000;border-radius:10px;overflow:hidden;';
    const vid = document.createElement('video');
    vid.src = blobUrl;
    vid.muted = true;
    vid.controls = true;
    vid.preload = 'auto';
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.style.cssText = 'display:block;width:100%;height:auto;max-height:82vh;background:#000;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair;';
    // Hidden warning we'll surface only if the browser can't decode the
    // uploaded file (very common with iPhone HEVC .mov on desktop Chrome).
    const codecWarn = document.createElement('div');
    codecWarn.style.cssText = 'display:none;position:absolute;inset:0;background:rgba(0,0,0,0.78);color:#fff;padding:24px;text-align:left;font-size:14px;line-height:1.55;border-radius:10px;overflow-y:auto;';
    codecWarn.innerHTML = '⚠️ <strong>Preview not available for this video format</strong> '
        + '<span style="opacity:0.85;">(iPhone HEVC / unsupported codec on this browser).</span>'
        + '<br><br>You can still erase — but you\'ll need to draw boxes blind, using approximate position. '
        + 'For a better experience: open this page in <strong>Safari</strong> (which supports HEVC), or '
        + 'convert your video to <strong>MP4 H.264</strong> first.<br><br>'
        + '<span style="opacity:0.7;font-size:12px;">The erasure itself runs server-side and works with any format your browser uploaded successfully.</span>';
    stage.appendChild(vid);
    stage.appendChild(canvas);
    stage.appendChild(codecWarn);
    card.appendChild(stage);

    // Show the warning only when video genuinely failed to load a frame.
    vid.addEventListener('error', () => { codecWarn.style.display = 'block'; });
    // Force-seek to first frame so we display SOMETHING instead of black
    // — many browsers don't auto-render frame 0 from a paused video.
    vid.addEventListener('loadedmetadata', () => {
        try { vid.currentTime = 0.05; } catch (e) {}
    });

    const counter = document.createElement('div');
    counter.style.cssText = 'margin-top:8px;font-size:12px;color:#888;';
    counter.textContent = '0 boxes drawn';
    card.appendChild(counter);

    // Region store: each entry is normalized 0–1 against the video's
    // intrinsic dimensions (NOT the canvas pixel size), so the backend can
    // multiply by ffprobe-reported width/height regardless of display zoom.
    const regions = [];
    let drawing = null; // { x0, y0 } in canvas-display coords while dragging
    let dpr = window.devicePixelRatio || 1;

    function sizeCanvasToVideo() {
        const rect = stage.getBoundingClientRect();
        // Internal pixel buffer at devicePixelRatio so lines stay crisp on
        // hi-DPI mobile. Display CSS size is set via the inline style above.
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
    }

    function redraw() {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = stage.getBoundingClientRect();
        ctx.fillStyle = 'rgba(13,110,102,0.25)';
        ctx.strokeStyle = '#0d6e66';
        ctx.lineWidth = 2;
        for (const r of regions) {
            const x = r.x * rect.width;
            const y = r.y * rect.height;
            const w = r.w * rect.width;
            const h = r.h * rect.height;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
        if (drawing && drawing.cur) {
            const x = Math.min(drawing.x0, drawing.cur.x);
            const y = Math.min(drawing.y0, drawing.cur.y);
            const w = Math.abs(drawing.cur.x - drawing.x0);
            const h = Math.abs(drawing.cur.y - drawing.y0);
            ctx.fillStyle = 'rgba(194,24,91,0.30)';
            ctx.strokeStyle = '#c2185b';
            ctx.lineWidth = 2;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
    }

    function evToCanvasCoords(ev) {
        const rect = stage.getBoundingClientRect();
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        return { x: Math.max(0, Math.min(rect.width, cx)), y: Math.max(0, Math.min(rect.height, cy)) };
    }

    canvas.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        canvas.setPointerCapture(ev.pointerId);
        const p = evToCanvasCoords(ev);
        drawing = { x0: p.x, y0: p.y, cur: p };
        redraw();
    });
    canvas.addEventListener('pointermove', (ev) => {
        if (!drawing) return;
        drawing.cur = evToCanvasCoords(ev);
        redraw();
    });
    canvas.addEventListener('pointerup', (ev) => {
        if (!drawing) return;
        try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
        const rect = stage.getBoundingClientRect();
        const x = Math.min(drawing.x0, drawing.cur.x) / rect.width;
        const y = Math.min(drawing.y0, drawing.cur.y) / rect.height;
        const w = Math.abs(drawing.cur.x - drawing.x0) / rect.width;
        const h = Math.abs(drawing.cur.y - drawing.y0) / rect.height;
        drawing = null;
        // Ignore micro-taps (drag <2% of frame).
        if (w >= 0.02 && h >= 0.02) {
            regions.push({ x, y, w, h });
            counter.textContent = regions.length + ' box' + (regions.length === 1 ? '' : 'es') + ' drawn';
        }
        redraw();
    });

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '↺ Clear';
    clearBtn.style.cssText = 'flex:1;min-width:80px;padding:12px;background:#fff;color:#555;border:1px solid #ccc;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;';
    clearBtn.addEventListener('click', () => {
        regions.length = 0;
        counter.textContent = '0 boxes drawn';
        redraw();
    });
    const eraseBtn = document.createElement('button');
    eraseBtn.textContent = '✨ Erase & Download';
    eraseBtn.style.cssText = 'flex:2;min-width:140px;padding:12px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
    eraseBtn.addEventListener('click', async () => {
        if (regions.length === 0) {
            counter.textContent = 'Draw at least one box first.';
            counter.style.color = '#c2185b';
            return;
        }
        eraseBtn.disabled = true;
        eraseBtn.textContent = '⏳ Erasing…';
        try {
            const resp = await fetch(RAILWAY_ERASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoData: v.base64, regions })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success || !data.videoData) {
                throw new Error(data.error || ('Server returned ' + resp.status));
            }
            // Build a fresh blob + trigger download
            const b = atob(data.videoData);
            const arr = new Uint8Array(b.length);
            for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
            const cleanBlob = new Blob([arr], { type: 'video/mp4' });
            const cleanUrl = URL.createObjectURL(cleanBlob);
            const baseName = (v.filename || 'flipit-video').replace(/\.[a-z0-9]{2,4}$/i, '');
            triggerSave(cleanUrl, 'video/mp4', baseName + '-erased.mp4');
            setTimeout(() => URL.revokeObjectURL(cleanUrl), 60000);
            modal.remove();
            URL.revokeObjectURL(blobUrl);
            showSuccess(`✅ Erased ${data.regions_applied} area${data.regions_applied === 1 ? '' : 's'} — clean video downloading (${data.size_mb} MB)`, 'errorMessage');
        } catch (err) {
            counter.textContent = '❌ ' + (err.message || 'Erase failed');
            counter.style.color = '#c2185b';
            eraseBtn.disabled = false;
            eraseBtn.textContent = '✨ Erase & Download';
        }
    });
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancel';
    closeBtn.style.cssText = 'flex:1;min-width:80px;padding:12px;background:#fff;color:#888;border:1px solid #ddd;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;';
    closeBtn.addEventListener('click', () => { modal.remove(); URL.revokeObjectURL(blobUrl); });
    btnRow.appendChild(clearBtn);
    btnRow.appendChild(eraseBtn);
    btnRow.appendChild(closeBtn);
    card.appendChild(btnRow);

    modal.appendChild(card);
    document.body.appendChild(modal);

    // Wait for video metadata so we can size the canvas to match the
    // displayed video element (which has its own intrinsic aspect ratio).
    if (vid.readyState >= 1) {
        sizeCanvasToVideo();
    } else {
        vid.addEventListener('loadedmetadata', sizeCanvasToVideo, { once: true });
    }
    window.addEventListener('resize', sizeCanvasToVideo);
    modal.addEventListener('remove', () => window.removeEventListener('resize', sizeCanvasToVideo));
}

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
                const finalName = (data.filename || 'flipit-video').replace(/\.[a-z0-9]{2,4}$/i, '') + ext;
                triggerSave(blobUrl, mime, finalName);
                // Keep blob alive long enough for iOS modal user to long-press save.
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                if (isIOS()) {
                    showSuccess(`📱 Video ready — long-press to save (${(byteArr.length / 1048576).toFixed(1)} MB ${ext})`, 'errorMessage');
                } else {
                    showSuccess(`✅ Video download started! (${(byteArr.length / 1048576).toFixed(1)} MB ${ext})`, 'errorMessage');
                }
                // Stash the raw base64 + ext so the "Erase areas" button can
                // re-process this exact clip without re-downloading from IG.
                window._lastDownloadedVideo = { base64: data.videoData, mime, ext, filename: finalName };
                showEraseAreasButton();
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

    // Wire backend-extracted source-image URLs (og:image / Apify displayUrl)
    // into the carousel state so the Image Prompt button auto-routes to
    // /analyze-image (Vision-based recreation) instead of the text-only
    // fallback. Without this, the whole IG-extract → faithful Image Prompt
    // chain is silently broken even when extract-and-twist returns images.
    if (Array.isArray(data.sourceImages) && data.sourceImages.length > 0) {
        window._lastCarouselUrls = data.sourceImages.slice();
        window._lastCarouselCount = data.sourceImages.length;
    }

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
        const carouselCount = window._lastCarouselCount || 0;
        appendPromptButtons(container, data.twisted, data.original, platform, carouselCount);
        appendRateButton(container, {
            original: data.original || '',
            twisted: data.twisted,
            platform: platform || ''
        });
        appendShareButton(container, {
            twisted: data.twisted,
            hook: data.prompt || '',
            platform: platform || ''
        });
        appendRestartButton(container);
    }
}

// ── 📊 RATE THIS POST ─────────────────────────────────────
// Scores the flipped post on 6 dimensions (hook, scroll-stop, niche clarity,
// emotional resonance, CTA, originality) via /rate-post and renders a
// score card with verdict + per-dimension breakdown + improvements.
function appendRateButton(container, payload) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;align-items:center;';

    const rateBtn = document.createElement('button');
    rateBtn.className = 'btn-secondary';
    rateBtn.style.cssText = 'background:linear-gradient(135deg,#ffb347,#ff7e5f);color:#fff;border:none;padding:12px 24px;font-weight:700;border-radius:10px;cursor:pointer;font-size:15px;';
    rateBtn.textContent = '\u{1F4CA} Rate This Post';
    wrap.appendChild(rateBtn);
    container.appendChild(wrap);

    // Result card lives below the button, populated on click.
    const cardHolder = document.createElement('div');
    cardHolder.style.cssText = 'margin-top:16px;';
    container.appendChild(cardHolder);

    rateBtn.addEventListener('click', async () => {
        const originalLabel = rateBtn.textContent;
        rateBtn.disabled = true;
        rateBtn.style.opacity = '0.7';
        rateBtn.textContent = '⏳ Analyzing…';
        cardHolder.innerHTML = '';

        try {
            const resp = await fetch('/.netlify/functions/rate-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    original: payload.original,
                    twisted: payload.twisted,
                    platform: payload.platform
                })
            });
            if (resp.status === 429) {
                const data = await resp.json().catch(() => ({}));
                const warn = document.createElement('div');
                warn.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;padding:14px;border-radius:10px;color:#664d03;';
                warn.textContent = data.message || 'You’ve hit today’s rate limit.';
                cardHolder.innerHTML = '';
                cardHolder.appendChild(warn);
                return;
            }
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                const errBox = document.createElement('div');
                errBox.style.cssText = 'background:#f8d7da;border:1px solid #f5c2c7;padding:14px;border-radius:10px;color:#842029;';
                errBox.textContent = data.error || 'Rating failed. Try again.';
                cardHolder.innerHTML = '';
                cardHolder.appendChild(errBox);
                return;
            }
            const rating = await resp.json();
            renderRatingCard(cardHolder, rating);
        } catch (err) {
            console.error('rate-post error', err);
            const errBox = document.createElement('div');
            errBox.style.cssText = 'background:#f8d7da;border:1px solid #f5c2c7;padding:14px;border-radius:10px;color:#842029;';
            errBox.textContent = 'Couldn’t reach the rater. Check your connection and try again.';
            cardHolder.innerHTML = '';
            cardHolder.appendChild(errBox);
        } finally {
            rateBtn.disabled = false;
            rateBtn.style.opacity = '1';
            rateBtn.textContent = originalLabel;
        }
    });
}

function renderRatingCard(host, rating) {
    host.innerHTML = '';
    if (!rating || typeof rating.overall !== 'number') {
        host.innerHTML = '<div style="color:#842029;">Rating response was malformed.</div>';
        return;
    }

    // Overall + verdict header
    const card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(135deg,#fff8f0,#fffaf3);border:2px solid #ffb347;border-radius:14px;padding:20px;box-shadow:0 4px 16px rgba(0,0,0,0.06);';

    const scoreColor = rating.overall >= 75 ? '#0a9b8e' : rating.overall >= 60 ? '#c79100' : rating.overall >= 40 ? '#cc7a00' : '#b91c1c';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px;';
    header.innerHTML = `
        <div style="font-size:48px;font-weight:900;color:${scoreColor};line-height:1;">${rating.overall}<span style="font-size:18px;color:#999;font-weight:600;">/100</span></div>
        <div style="font-size:20px;font-weight:700;color:#1a1a2e;">${escapeHtml(rating.verdict || '')}</div>
    `;
    card.appendChild(header);

    // 6 dimensions
    if (Array.isArray(rating.dimensions) && rating.dimensions.length) {
        const dimsWrap = document.createElement('div');
        dimsWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:18px;';
        for (const d of rating.dimensions) {
            const dColor = d.score >= 75 ? '#0a9b8e' : d.score >= 60 ? '#c79100' : d.score >= 40 ? '#cc7a00' : '#b91c1c';
            const dim = document.createElement('div');
            dim.style.cssText = 'background:#fff;border:1px solid #f0e0c8;padding:12px;border-radius:10px;';
            dim.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                    <strong style="color:#1a1a2e;font-size:14px;">${escapeHtml(d.name)}</strong>
                    <span style="font-weight:800;color:${dColor};font-size:16px;">${d.score}</span>
                </div>
                <div style="margin-top:6px;font-size:13px;color:#555;line-height:1.4;">${escapeHtml(d.why)}</div>
                <div style="margin-top:6px;font-size:12px;color:#0d6e66;line-height:1.4;"><strong>Fix:</strong> ${escapeHtml(d.improve)}</div>
            `;
            dimsWrap.appendChild(dim);
        }
        card.appendChild(dimsWrap);
    }

    // Working / Fix bullets
    const twoCol = document.createElement('div');
    twoCol.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;';
    if (Array.isArray(rating.working) && rating.working.length) {
        const working = document.createElement('div');
        working.innerHTML = `<h4 style="margin:0 0 8px;color:#0a9b8e;font-size:14px;">✅ What’s working</h4><ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.5;">${rating.working.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
        twoCol.appendChild(working);
    }
    if (Array.isArray(rating.fix) && rating.fix.length) {
        const fix = document.createElement('div');
        fix.innerHTML = `<h4 style="margin:0 0 8px;color:#cc7a00;font-size:14px;">\u{1F527} Fix first</h4><ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.5;">${rating.fix.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
        twoCol.appendChild(fix);
    }
    card.appendChild(twoCol);

    // Copy-paste hook
    if (rating.copy_paste_hook) {
        const hookWrap = document.createElement('div');
        hookWrap.style.cssText = 'margin-top:16px;background:#fff;border:1px dashed #0d6e66;border-radius:10px;padding:12px;';
        hookWrap.innerHTML = `<div style="font-size:12px;color:#0d6e66;font-weight:700;margin-bottom:4px;">\u{1F3AF} Stronger hook (tap to copy)</div><div id="rateCopyHook" style="font-size:14px;color:#1a1a2e;cursor:pointer;line-height:1.4;">${escapeHtml(rating.copy_paste_hook)}</div>`;
        card.appendChild(hookWrap);
        // wire copy on the dynamically inserted element
        setTimeout(() => {
            const el = document.getElementById('rateCopyHook');
            if (!el) return;
            el.addEventListener('click', () => {
                navigator.clipboard.writeText(rating.copy_paste_hook).then(() => {
                    const prev = el.textContent;
                    el.textContent = '✅ Copied!';
                    setTimeout(() => { el.textContent = prev; }, 1400);
                });
            });
        }, 0);
    }

    host.appendChild(card);
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── 🔄 NEW FLIP / RESTART ────────────────────────────────
// Appears at the bottom of every results card. One click clears the
// results, the URL input, and any carousel state, then scrolls back to
// the URL input so the user can paste a new link without manually
// clearing anything. Works from any tab — switches to URL Extract by
// default since that is the most common entry point.
function appendRestartButton(container) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:24px;padding-top:20px;border-top:1px dashed #ddd;display:flex;flex-direction:column;align-items:center;gap:8px;';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-tertiary';
    btn.style.cssText = 'background:#fff;color:#0d6e66;border:2px solid #0d6e66;padding:12px 28px;font-weight:700;border-radius:10px;cursor:pointer;font-size:15px;display:inline-flex;align-items:center;gap:8px;';
    btn.textContent = '\u{1F504} New Flip';

    const hint = document.createElement('span');
    hint.textContent = 'Clear this result and start a fresh flip.';
    hint.style.cssText = 'font-size:12px;color:#888;';

    btn.addEventListener('click', () => {
        // Clear all globals that earlier flows may have populated
        window._lastCarouselUrls = [];
        window._lastCarouselCount = 0;

        // Clear the main results container
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) resultsContainer.innerHTML = '';

        // Clear the URL input + any platform badge / error caption
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = '';
            urlInput.dispatchEvent(new Event('input'));
        }
        const platformBadge = document.getElementById('platformBadge');
        if (platformBadge) platformBadge.innerHTML = '';
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) errorMessage.innerHTML = '';

        // Switch back to URL Extract so the user lands ready to paste
        if (typeof switchTab === 'function') switchTab('url-tab');

        // Scroll the URL input into view, give focus
        setTimeout(() => {
            if (urlInput) {
                urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                urlInput.focus({ preventScroll: true });
            }
        }, 80);
    });

    wrap.appendChild(btn);
    wrap.appendChild(hint);
    container.appendChild(wrap);
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

    // Both Image and Video Prompt are Pro-only \u2014 show \uD83D\uDD12 badge for free users
    // so the upgrade prompt isn't a surprise when they click.
    const isPro = !!(window.FlipItAccess && window.FlipItAccess.getState && window.FlipItAccess.getState().isPro);
    const lockBadge = isPro ? '' : ' \u{1F512}';

    // Video Prompt button
    const videoBtn = document.createElement('button');
    videoBtn.className = 'btn-primary';
    videoBtn.style.cssText = 'background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:10px;cursor:pointer;font-size:16px;flex:1;min-width:180px;';
    videoBtn.textContent = '\u{1F3AC} VIDEO PROMPT' + lockBadge;
    if (!isPro) videoBtn.title = 'Pro feature \u2014 unlock with any paid plan';
    btnRow.appendChild(videoBtn);

    // Image Prompt button
    const imageBtn = document.createElement('button');
    imageBtn.className = 'btn-secondary';
    imageBtn.style.cssText = 'background:linear-gradient(135deg,#c2185b,#e8734a);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:10px;cursor:pointer;font-size:16px;flex:1;min-width:180px;';
    imageBtn.textContent = '\u{1F5BC}\uFE0F IMAGE PROMPT' + lockBadge;
    if (!isPro) imageBtn.title = 'Pro feature \u2014 unlock with any paid plan';
    btnRow.appendChild(imageBtn);

    container.appendChild(btnRow);

    // Video Prompt click handler — calls Claude via /video-prompts
    videoBtn.addEventListener('click', async () => {
        if (!gateProFeature()) return;
        const existing = container.querySelector('.video-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const wrap = document.createElement('div');
        wrap.className = 'result-section video-prompt-section';
        wrap.innerHTML = `<h3>\u{1F3AC} Video Creation Prompts</h3><p style="color:#777;font-size:14px;margin-bottom:10px;">AI is writing prompts that match your script. Paste into Runway, Pika, Kling, Sora, or Luma.</p><p class="result-text" style="color:#999;">⏳ Generating prompts…</p>`;
        container.appendChild(wrap);
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            // Pass the cover frame from the source post as a visual anchor.
            // Without this, Claude defaults to generic "creator at desk" scenes
            // that ignore what's literally in the source video.
            const referenceImageUrl = (window._lastCarouselUrls && window._lastCarouselUrls[0]) || '';
            const res = await fetch('/.netlify/functions/video-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flippedScript, platform, referenceImageUrl })
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
        if (!gateProFeature()) return;
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

// ── TAB: TRENDING VIRAL FEED (Apify-backed) ───────────────────
// Show top-engagement TikToks for the selected niche/hashtag.
// One-click on a card pastes the URL into Tab 1 (URL Extract) and runs the flip.
(function wireTrendingTab() {
    const btn = document.getElementById('findTrendingBtn');
    if (!btn) return;
    const nicheSelect = document.getElementById('trendingNiche');
    const hashtagInput = document.getElementById('trendingHashtag');
    const container = document.getElementById('trendingResultsContainer');

    function fmtNum(n) {
        if (!Number.isFinite(n)) return '0';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(n);
    }

    function renderCards(results) {
        container.innerHTML = '';
        if (!results || results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'result-section';
            empty.innerHTML = '<h3>\u{1F50D} No trending posts found</h3><p class="result-text">Try a different niche or hashtag.</p>';
            container.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:10px;';
        results.forEach((r, i) => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#fff;border-radius:14px;padding:14px;border:1px solid #e8e4de;display:flex;flex-direction:column;gap:8px;';

            // Thumbnail (proxied to bypass CDN hot-link blocks)
            if (r.thumbnail) {
                const thumb = document.createElement('img');
                thumb.src = '/.netlify/functions/proxy-download?url=' + encodeURIComponent(r.thumbnail);
                thumb.alt = 'Top post by ' + r.author;
                thumb.loading = 'lazy';
                thumb.style.cssText = 'width:100%;height:200px;object-fit:cover;border-radius:10px;background:#f0eee9;';
                thumb.addEventListener('error', () => { thumb.style.display = 'none'; });
                card.appendChild(thumb);
            }

            // Author + rank
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#0d6e66;font-weight:700;';
            const author = document.createElement('span');
            author.textContent = r.author || '@unknown';
            const rank = document.createElement('span');
            rank.style.cssText = 'background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;';
            rank.textContent = '#' + (i + 1) + ' viral';
            head.appendChild(author);
            head.appendChild(rank);
            card.appendChild(head);

            // Caption snippet
            const cap = document.createElement('p');
            cap.style.cssText = 'color:#444;font-size:14px;line-height:1.4;margin:0;max-height:4.2em;overflow:hidden;';
            cap.textContent = r.caption || '(no caption)';
            card.appendChild(cap);

            // Engagement stats
            const stats = document.createElement('div');
            stats.style.cssText = 'display:flex;gap:14px;font-size:12px;color:#888;flex-wrap:wrap;';
            stats.innerHTML =
                '<span>❤️ ' + fmtNum(r.likes) + '</span>' +
                '<span>\u{1F441}️ ' + fmtNum(r.views) + '</span>' +
                '<span>\u{1F4AC} ' + fmtNum(r.comments) + '</span>' +
                '<span>\u{1F501} ' + fmtNum(r.shares) + '</span>';
            card.appendChild(stats);

            // "Example" badge for curated/fallback items so users know
            // this isn't live trending and the URL is illustrative only.
            if (r.curated) {
                const badge = document.createElement('div');
                badge.style.cssText = 'display:inline-block;background:#fff8e1;color:#5a4a00;border:1px solid #e8c840;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;align-self:flex-start;';
                badge.textContent = '💡 Example (curated)';
                card.appendChild(badge);
            }

            // Actions
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;margin-top:auto;';
            const flipBtn = document.createElement('button');
            flipBtn.textContent = '⚡ Flip This';
            flipBtn.style.cssText = 'flex:1;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;padding:10px 14px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
            flipBtn.addEventListener('click', () => flipFromTrendingCard(r));
            const openBtn = document.createElement('a');
            openBtn.textContent = '↗ Open';
            openBtn.href = r.url;
            openBtn.target = '_blank';
            openBtn.rel = 'noopener';
            // Hide the Open button on curated items — their URLs don't resolve.
            if (r.curated) openBtn.style.display = 'none';
            openBtn.style.cssText = (r.curated ? 'display:none;' : '') + 'background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;padding:10px 14px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;text-align:center;';
            actions.appendChild(flipBtn);
            actions.appendChild(openBtn);
            card.appendChild(actions);

            grid.appendChild(card);
        });
        container.appendChild(grid);
    }

    function flipFromTrendingCard(item) {
        // Curated fallback items have placeholder URLs that don't resolve —
        // sending them through URL Extract produces empty/garbage output.
        // Route those to Script Rewrite using the caption directly.
        if (item && item.curated) {
            if (typeof switchTab === 'function') switchTab('script-tab');
            const scriptInput = document.getElementById('scriptInput');
            if (scriptInput) {
                scriptInput.value = item.caption || '';
                scriptInput.dispatchEvent(new Event('input'));
            }
            const rewriteBtn = document.getElementById('rewriteBtn');
            if (rewriteBtn) {
                rewriteBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => rewriteBtn.click(), 250);
            }
            return;
        }
        // Live trending result: paste URL, run extract+flip.
        if (typeof switchTab === 'function') switchTab('url-tab');
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = (item && item.url) || '';
            urlInput.dispatchEvent(new Event('input'));
        }
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => extractBtn.click(), 250);
        }
    }

    btn.addEventListener('click', async () => {
        const niche = (nicheSelect && nicheSelect.value) || '';
        const hashtag = (hashtagInput && hashtagInput.value.trim()) || '';
        if (!niche && !hashtag) {
            showError('Pick a niche or type a hashtag first.', 'trendingErrorMessage');
            return;
        }
        if (!gateOrPaywall()) return;

        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Fetching trending posts…';
        container.innerHTML = '<div class="loading">\u{1F525} Pulling the day’s top viral posts…</div>';

        try {
            const res = await fetch('/.netlify/functions/trending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ niche, hashtag, count: 10 })
            });
            const data = await res.json();

            if (res.status === 429) {
                container.innerHTML = '';
                showError('⚠️ ' + (data.error || 'Daily flip limit reached.'), 'trendingErrorMessage');
                return;
            }
            if (!res.ok || !Array.isArray(data.results)) {
                throw new Error(data.error || 'Trending fetch failed');
            }

            renderCards(data.results);
            recordFlipSuccess();
        } catch (err) {
            container.innerHTML = '';
            console.error('Trending error:', err);
            showError('❌ ' + (err.message || 'Could not fetch trending posts. Please try again.'), 'trendingErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    });
})();

// ── TAB: 📱 INSTAGRAM BROWSE (Apify-backed) ─────────────────
// Browse posts by @creator, #hashtag, or a direct post URL — and
// one-click "Flip & Rate" any of them without leaving FlipIt.
(function wireInstagramBrowseTab() {
    const btn = document.getElementById('instagramBrowseBtn');
    if (!btn) return;
    const queryInput = document.getElementById('instagramQuery');
    const container = document.getElementById('instagramResults');

    function fmtNum(n) {
        n = Number(n) || 0;
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(n);
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diffDays = Math.floor((now - d) / 86400000);
        if (diffDays < 1) return 'today';
        if (diffDays === 1) return '1d ago';
        if (diffDays < 7) return diffDays + 'd ago';
        if (diffDays < 30) return Math.floor(diffDays / 7) + 'w ago';
        if (diffDays < 365) return Math.floor(diffDays / 30) + 'mo ago';
        return Math.floor(diffDays / 365) + 'y ago';
    }

    function renderPosts(posts) {
        container.innerHTML = '';
        if (!posts || posts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'result-section';
            empty.innerHTML = '<h3>🔍 No posts found</h3><p class="result-text">No posts found. Try a different name, @handle, or #hashtag.</p>';
            container.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:10px;';

        posts.forEach((p) => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#fff;border-radius:14px;border:1px solid #e8e4de;display:flex;flex-direction:column;gap:8px;overflow:hidden;';

            // Thumbnail
            if (p.thumbnail) {
                const thumb = document.createElement('img');
                thumb.src = '/.netlify/functions/proxy-download?url=' + encodeURIComponent(p.thumbnail);
                thumb.alt = 'Instagram post by ' + (p.owner || 'unknown');
                thumb.loading = 'lazy';
                thumb.style.cssText = 'width:100%;max-height:280px;height:280px;object-fit:cover;background:#f0eee9;display:block;';
                thumb.addEventListener('error', () => { thumb.style.display = 'none'; });
                card.appendChild(thumb);
            }

            const padded = document.createElement('div');
            padded.style.cssText = 'padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px;flex:1;';

            // Owner + date row
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#0d6e66;font-weight:700;gap:8px;';
            const owner = document.createElement('span');
            owner.textContent = p.owner || '@unknown';
            owner.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const dateEl = document.createElement('span');
            dateEl.style.cssText = 'color:#888;font-weight:500;font-size:12px;flex-shrink:0;';
            dateEl.textContent = fmtDate(p.postedAt);
            head.appendChild(owner);
            head.appendChild(dateEl);
            padded.appendChild(head);

            // Type badges (carousel / video)
            if (p.isCarousel || p.isVideo) {
                const badges = document.createElement('div');
                badges.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
                if (p.isVideo) {
                    const b = document.createElement('span');
                    b.style.cssText = 'background:#eef9f7;color:#0a9b8e;border:1px solid #c8ecea;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;';
                    b.textContent = '▶ Video';
                    badges.appendChild(b);
                }
                if (p.isCarousel) {
                    const b = document.createElement('span');
                    b.style.cssText = 'background:#fff4e6;color:#a85b00;border:1px solid #f0d8b5;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;';
                    b.textContent = '🖼 Carousel';
                    badges.appendChild(b);
                }
                padded.appendChild(badges);
            }

            // Caption preview (first 120 chars)
            const rawCap = (p.caption || '').toString();
            const capText = rawCap.length > 120 ? rawCap.slice(0, 120) + '…' : rawCap;
            const cap = document.createElement('p');
            cap.style.cssText = 'color:#444;font-size:14px;line-height:1.4;margin:0;';
            cap.textContent = capText || '(no caption)';
            padded.appendChild(cap);

            // Engagement
            const stats = document.createElement('div');
            stats.style.cssText = 'display:flex;gap:14px;font-size:12px;color:#888;flex-wrap:wrap;';
            stats.innerHTML =
                '<span>❤️ ' + fmtNum(p.likes) + '</span>' +
                '<span>💬 ' + fmtNum(p.comments) + '</span>';
            padded.appendChild(stats);

            // Actions row
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;margin-top:auto;padding-top:6px;';

            const flipBtn = document.createElement('button');
            flipBtn.textContent = '🎯 Flip & Rate';
            flipBtn.style.cssText = 'flex:1;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;padding:10px 12px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
            flipBtn.addEventListener('click', () => flipAndRate(p));

            const openBtn = document.createElement('a');
            openBtn.textContent = '🔗 Open Post';
            openBtn.href = p.url;
            openBtn.target = '_blank';
            openBtn.rel = 'noopener';
            openBtn.style.cssText = 'background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;padding:10px 12px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;text-align:center;flex:1;';

            actions.appendChild(flipBtn);
            actions.appendChild(openBtn);
            padded.appendChild(actions);

            card.appendChild(padded);
            grid.appendChild(card);
        });

        container.appendChild(grid);
    }

    // Switch to URL Extract tab, drop the post URL in, click Extract, then
    // wait for the rendered flip output and auto-click "Rate This Post".
    function flipAndRate(post) {
        if (!post || !post.url) return;
        if (typeof switchTab === 'function') switchTab('url-tab');
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = post.url;
            urlInput.dispatchEvent(new Event('input'));
        }
        const extractBtn = document.getElementById('extractBtn');
        const resultsContainer = document.getElementById('resultsContainer');
        if (!extractBtn) return;
        extractBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Click Extract. The Trending tab uses a 250ms delay so the tab swap
        // settles before the click — mirror that.
        setTimeout(() => extractBtn.click(), 250);

        // Poll for the "Rate This Post" button to appear in the results, then
        // auto-click it. Bail after ~90s so we don't poll forever on errors.
        const startedAt = Date.now();
        const TIMEOUT_MS = 90000;
        const tick = () => {
            if (Date.now() - startedAt > TIMEOUT_MS) return;
            // Find the rate button by its visible text (it's appended to the
            // results container after a successful flip).
            const candidates = resultsContainer
                ? resultsContainer.querySelectorAll('button')
                : document.querySelectorAll('button');
            for (const b of candidates) {
                const t = (b.textContent || '').trim();
                if (t.indexOf('Rate This Post') !== -1) {
                    if (!b.dataset.flipitAutoRated) {
                        b.dataset.flipitAutoRated = '1';
                        b.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => b.click(), 200);
                    }
                    return;
                }
            }
            setTimeout(tick, 500);
        };
        setTimeout(tick, 1500);
    }

    btn.addEventListener('click', async () => {
        const query = (queryInput && queryInput.value.trim()) || '';
        if (!query) {
            showError('Enter a creator name, @handle, #hashtag, or Instagram post URL.', 'instagramErrorMessage');
            return;
        }
        if (!gateOrPaywall()) return;

        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Searching Instagram…';
        container.innerHTML = '<div class="loading">⏳ Searching Instagram…</div>';

        try {
            const res = await fetch('/.netlify/functions/instagram-browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, limit: 12 })
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 429) {
                container.innerHTML = '';
                showError('⚠️ ' + (data.error || 'Daily flip limit reached.'), 'instagramErrorMessage');
                return;
            }
            if (!res.ok || !Array.isArray(data.posts)) {
                container.innerHTML = '';
                showError('❌ ' + (data.error || 'Browse failed. Please try again.'), 'instagramErrorMessage');
                return;
            }

            renderPosts(data.posts);
            if (data.posts.length > 0 && typeof recordFlipSuccess === 'function') {
                recordFlipSuccess();
            }
        } catch (err) {
            console.error('Instagram browse error:', err);
            container.innerHTML = '';
            showError('❌ ' + (err.message || 'Could not browse Instagram. Please try again.'), 'instagramErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    });
})();

// ── 🔗 AUTO-FLIP FROM URL PARAM ───────────────────────────
// Honors ?url= or ?u= in the page URL so the Chrome extension /
// bookmarklet / share buttons / any external referrer can deep-link
// directly into a flip. Example:
//   https://flipit.earnwith-ai.com/?url=https%3A%2F%2Finstagram.com%2Fp%2FXYZ
// Validates the inbound URL (must be http(s) and on a known social
// platform) before auto-clicking Extract — prevents abuse where a
// random page redirects users into running flips on attacker URLs.
(function autoFlipFromQuery() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const raw = (params.get('url') || params.get('u') || '').trim();
        if (!raw) return;
        let parsed;
        try { parsed = new URL(raw); } catch { return; }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
        const allowedHosts = /(?:^|\.)(instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|threads\.net)$/i;
        if (!allowedHosts.test(parsed.hostname)) return;

        const fire = () => {
            if (typeof switchTab === 'function') switchTab('url-tab');
            const urlInput = document.getElementById('urlInput');
            if (urlInput) {
                urlInput.value = raw;
                urlInput.dispatchEvent(new Event('input'));
            }
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => extractBtn.click(), 300);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fire);
        } else {
            fire();
        }
    } catch (e) {
        console.warn('autoFlipFromQuery failed:', e);
    }
})();
