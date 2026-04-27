/**
 * FlipIt — Founder's Pricing Countdown
 * Updates the days-remaining number in #countdown-days, or replaces the
 * urgency-banner copy when the launch window has closed.
 *
 * Loaded as an external file so it complies with the production CSP
 * (script-src 'self').
 */
(function () {
    'use strict';

    // Founder's pricing window ends 14 days from launch (2026-04-27).
    var LAUNCH_END = new Date('2026-05-11T23:59:59');

    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    ready(function () {
        var daysEl = document.getElementById('countdown-days');
        var banner = document.getElementById('urgency-banner');
        if (!daysEl && !banner) return;

        var now = new Date();
        var msPerDay = 1000 * 60 * 60 * 24;
        var diffMs = LAUNCH_END.getTime() - now.getTime();
        var daysLeft = Math.ceil(diffMs / msPerDay);

        if (diffMs <= 0) {
            // Launch window has passed — show final-hours messaging.
            if (banner) {
                banner.innerHTML = '🔥 <strong>Final hours of founder’s pricing!</strong> Locked in at $37 — rises to $67 soon.';
            }
            return;
        }

        if (daysEl) {
            daysEl.textContent = String(daysLeft);
        }
    });
})();
