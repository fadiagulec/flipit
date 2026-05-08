/* Thank-you page: verify the Stripe checkout session server-side and
 * issue an HMAC-signed Pro token. The old "blindly set localStorage.flipit_pro
 * = yes" flow let anyone visit /thank-you.html directly to unlock Pro for free.
 * Now Pro is only granted if Stripe confirms the session was paid.
 */
(function () {
    'use strict';

    var CONFIRM_ID = 'flipit-pro-confirm';
    if (document.getElementById(CONFIRM_ID)) return;

    var ctaLink = null;
    var links = document.getElementsByTagName('a');
    for (var i = 0; i < links.length; i++) {
        if (links[i].className && links[i].className.indexOf('btn') !== -1 &&
            links[i].className.indexOf('btn-outline') === -1) {
            ctaLink = links[i];
            break;
        }
    }
    if (!ctaLink) return;

    var msg = document.createElement('p');
    msg.id = CONFIRM_ID;
    msg.style.fontSize = '14px';
    msg.style.fontWeight = '600';
    msg.style.marginTop = '8px';

    function setMsg(text, color) {
        msg.textContent = text;
        msg.style.color = color;
        if (!msg.parentNode) {
            if (ctaLink.nextSibling) {
                ctaLink.parentNode.insertBefore(msg, ctaLink.nextSibling);
            } else {
                ctaLink.parentNode.appendChild(msg);
            }
        }
    }

    // ── 1. Read session_id from URL ───────────────────────────
    var params = new URLSearchParams(window.location.search || '');
    var sessionId = params.get('session_id') || '';

    if (!sessionId) {
        // No session_id → user navigated directly without paying. Don't grant Pro.
        setMsg(
            '⚠️ Pro access could not be activated automatically. ' +
            'If you just paid, please contact support with your Stripe receipt.',
            '#c2185b'
        );
        return;
    }

    // ── 2. Verify with our backend (which calls Stripe API) ───
    setMsg('⏳ Verifying your purchase…', '#888');

    fetch('/.netlify/functions/issue-pro-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    })
        .then(function (res) {
            return res.json().then(function (data) {
                return { status: res.status, data: data };
            });
        })
        .then(function (result) {
            if (result.status === 200 && result.data && result.data.token) {
                try {
                    localStorage.setItem('flipit_pro', result.data.token);
                    setMsg('✅ Pro access activated — unlimited flips on this device.', '#0d6e66');
                } catch (e) {
                    setMsg(
                        '⚠️ Could not save Pro access on this browser (private mode?). ' +
                        'Try in a regular window or contact support.',
                        '#c2185b'
                    );
                }
            } else if (result.status === 402) {
                setMsg(
                    '⚠️ Your payment is not yet confirmed. Please refresh this page in a moment, ' +
                    'or contact support with your Stripe receipt.',
                    '#c2185b'
                );
            } else {
                setMsg(
                    '⚠️ Pro activation failed: ' + ((result.data && result.data.error) || 'unknown error') + '. ' +
                    'Please contact support with your Stripe receipt.',
                    '#c2185b'
                );
            }
        })
        .catch(function () {
            setMsg(
                '⚠️ Network error verifying your purchase. ' +
                'Please refresh the page or contact support.',
                '#c2185b'
            );
        });
})();

// CSP-safe wiring for the affiliate-link Copy button. The previous inline
// onclick was silently blocked by `script-src 'self'` so the button did
// nothing — that breaks the post-purchase share moment.
(function wireAffiliateCopy() {
    var btn = document.getElementById('flipit-copy-affiliate');
    if (!btn) return;
    var url = 'https://flipit-app.netlify.app/flipit-landing-page.html';
    btn.addEventListener('click', function () {
        function done(label) { btn.textContent = label; setTimeout(function () { btn.textContent = 'Copy'; }, 2000); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () { done('✅ Copied!'); }).catch(function () { fallback(); });
        } else {
            fallback();
        }
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = url;
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand && document.execCommand('copy');
                document.body.removeChild(ta);
                done(ok ? '✅ Copied!' : '❌ Copy failed');
            } catch (e) {
                done('❌ Copy failed');
            }
        }
    });
})();
