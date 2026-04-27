(function () {
    'use strict';

    var CONFIRM_ID = 'flipit-pro-confirm';

    // Idempotent: if confirmation already rendered, do nothing.
    if (document.getElementById(CONFIRM_ID)) {
        return;
    }

    var ctaLink = null;
    var links = document.getElementsByTagName('a');
    for (var i = 0; i < links.length; i++) {
        if (links[i].className && links[i].className.indexOf('btn') !== -1 &&
            links[i].className.indexOf('btn-outline') === -1) {
            ctaLink = links[i];
            break;
        }
    }
    if (!ctaLink) {
        return;
    }

    var msg = document.createElement('p');
    msg.id = CONFIRM_ID;

    var wroteOk = false;
    try {
        localStorage.setItem('flipit_pro', 'yes');
        wroteOk = (localStorage.getItem('flipit_pro') === 'yes');
    } catch (err) {
        wroteOk = false;
    }

    if (wroteOk) {
        msg.textContent = '✅ Pro access activated — unlimited flips on this device.';
        msg.style.color = '#0d6e66';
        msg.style.fontWeight = '600';
        msg.style.fontSize = '14px';
        msg.style.marginTop = '8px';
    } else {
        msg.textContent = '⚠️ Could not enable Pro automatically. Please contact support.';
        msg.style.color = '#c2185b';
        msg.style.fontWeight = '600';
        msg.style.fontSize = '14px';
        msg.style.marginTop = '8px';
    }

    if (ctaLink.nextSibling) {
        ctaLink.parentNode.insertBefore(msg, ctaLink.nextSibling);
    } else {
        ctaLink.parentNode.appendChild(msg);
    }
})();
