/**
 * FlipIt — Creator unlock page logic.
 * Pulled out of an inline <script> so it complies with the production CSP
 * (script-src 'self'). Powers /creator.html: reads ?code=… from the URL,
 * POSTs to /.netlify/functions/redeem-creator, stores the returned token
 * in localStorage.flipit_pro, and redirects to /.
 */
(function () {
    'use strict';

    function init() {
        var form = document.getElementById('redeem-form');
        var input = document.getElementById('code-input');
        var btn = document.getElementById('redeem-btn');
        var statusEl = document.getElementById('status');
        if (!form || !input || !btn || !statusEl) return;

        function setStatus(msg, ok) {
            statusEl.textContent = msg || '';
            statusEl.className = 'status ' + (ok ? 'ok' : 'err');
        }

        function redeem(code) {
            if (!code) { setStatus('Enter your creator code first.', false); return; }
            btn.disabled = true;
            setStatus('Verifying…', true);
            fetch('/.netlify/functions/redeem-creator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            }).then(function (resp) {
                return resp.json().catch(function () { return {}; }).then(function (data) {
                    return { resp: resp, data: data };
                });
            }).then(function (result) {
                var resp = result.resp;
                var data = result.data || {};
                if (!resp.ok || !data.token) {
                    setStatus(data.error || ('Failed (' + resp.status + ').'), false);
                    btn.disabled = false;
                    return;
                }
                try { localStorage.setItem('flipit_pro', data.token); } catch (e) {}
                setStatus('Pro unlocked on this browser. Redirecting…', true);
                setTimeout(function () { window.location.replace('/'); }, 1200);
            }).catch(function () {
                setStatus('Network error. Try again.', false);
                btn.disabled = false;
            });
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            redeem(input.value.trim());
        });

        // Auto-redeem when ?code=… is present in the URL.
        try {
            var params = new URLSearchParams(window.location.search);
            var preset = params.get('code');
            if (preset) {
                input.value = preset;
                history.replaceState(null, '', window.location.pathname);
                redeem(preset);
            }
        } catch (e) { /* ignore */ }
    }

    if (document.readyState !== 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
