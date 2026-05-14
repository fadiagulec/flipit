// FlipIt content script
//
// Adds a floating "🎯 Rate with FlipIt" button to every supported social
// site. The button reads the current page URL, normalizes it to a
// canonical post URL, then opens https://flipit-app.netlify.app/?url=…
// which triggers the auto-flip handler on the FlipIt side.
//
// SAFETY: pure DOM injection, no scraping of post content (FlipIt does
// that server-side via Apify). No network calls from this script.

(function () {
    'use strict';

    const FLIPIT_URL = 'https://flipit-app.netlify.app/';
    const BUTTON_ID = 'flipit-fab-button';

    // Map of hostnames → "is this URL a single post / reel / video?" check.
    // Only show the button on actual post pages, not the home feed.
    const isPostUrl = () => {
        const u = new URL(window.location.href);
        const h = u.hostname.replace(/^www\./, '').toLowerCase();
        const p = u.pathname;
        if (h.includes('instagram.com')) return /^\/(p|reel|tv|reels)\//.test(p);
        if (h.includes('tiktok.com')) return /\/video\/\d+/.test(p) || /^\/@[^/]+\/video\//.test(p);
        if (h.includes('youtube.com')) return p.startsWith('/watch') || p.startsWith('/shorts/');
        if (h === 'youtu.be') return p.length > 1;
        if (h.includes('linkedin.com')) return /\/posts\/|\/feed\/update\//.test(p);
        if (h.includes('threads.net')) return /^\/@[^/]+\/post\//.test(p);
        if (h.includes('facebook.com')) return /\/(posts|reel|videos|watch)\//.test(p) || /\/share\/[rv]\//.test(p);
        if (h.includes('twitter.com') || h.includes('x.com')) return /\/status\/\d+/.test(p);
        return false;
    };

    const buildFlipitUrl = () => {
        return FLIPIT_URL + '?url=' + encodeURIComponent(window.location.href);
    };

    const removeButton = () => {
        const existing = document.getElementById(BUTTON_ID);
        if (existing) existing.remove();
    };

    const injectButton = () => {
        if (document.getElementById(BUTTON_ID)) return;
        if (!isPostUrl()) return;

        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.type = 'button';
        btn.textContent = '\u{1F3AF} Rate with FlipIt';
        btn.style.cssText = [
            'position:fixed',
            'bottom:24px',
            'right:24px',
            'z-index:2147483647',
            'background:linear-gradient(135deg,#ff7e5f,#feb47b)',
            'color:#fff',
            'border:none',
            'padding:12px 18px',
            'border-radius:999px',
            'font-size:14px',
            'font-weight:700',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'cursor:pointer',
            'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
            'display:inline-flex',
            'align-items:center',
            'gap:8px',
            'transition:transform 0.15s ease,box-shadow 0.15s ease'
        ].join(';');

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 12px 28px rgba(0,0,0,0.3)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(buildFlipitUrl(), '_blank', 'noopener');
        });

        // Small dismiss "×" so it doesn't get in the way forever
        const close = document.createElement('span');
        close.textContent = '×';
        close.title = 'Hide for this session';
        close.style.cssText = 'margin-left:6px;opacity:0.8;font-weight:900;padding:0 4px;border-radius:50%;';
        close.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeButton();
            sessionStorage.setItem('flipit-hidden', '1');
        });
        btn.appendChild(close);

        if (sessionStorage.getItem('flipit-hidden') === '1') return;

        document.body.appendChild(btn);
    };

    // SPA route detection: Instagram / TikTok / YouTube swap URLs without
    // full page loads, so we re-check on history changes.
    let lastUrl = window.location.href;
    const onRouteChange = () => {
        if (window.location.href === lastUrl) return;
        lastUrl = window.location.href;
        removeButton();
        setTimeout(injectButton, 400);
    };

    // Patch history methods to catch SPA navigation
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () { origPush.apply(this, arguments); onRouteChange(); };
    history.replaceState = function () { origReplace.apply(this, arguments); onRouteChange(); };
    window.addEventListener('popstate', onRouteChange);

    // Initial inject + retry once after a bit for late-loading SPAs
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectButton);
    } else {
        injectButton();
    }
    setTimeout(injectButton, 1500);
})();
