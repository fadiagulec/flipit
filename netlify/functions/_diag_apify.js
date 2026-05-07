// Diagnostic-only: GET /.netlify/functions/_diag_apify
// Tests whether the APIFY_TOKEN env var is set + accepted by Apify.
// Returns a SAFE summary (token length, first/last 4 chars only) so we
// can spot common issues without ever echoing the secret.
//
// Once trending is verified working, this endpoint can stay (it's
// useful for ongoing diagnosis) or be deleted.

exports.handler = async function (event) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const tok = process.env.APIFY_TOKEN || '';
    const result = {
        envVarSet: tok.length > 0,
        tokenLength: tok.length,
        prefix4: tok ? tok.slice(0, 4) : null,
        suffix4: tok ? tok.slice(-4) : null,
        looksLikeApifyFormat: tok.startsWith('apify_api_'),
        hasWhitespace: /\s/.test(tok),
        hasNewline: /\n|\r/.test(tok)
    };

    if (!tok) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ...result,
                verdict: 'APIFY_TOKEN env var is empty or missing on Netlify.'
            })
        };
    }

    // Probe Apify /v2/users/me — minimal call that auth-checks the token
    let apifyStatus = null;
    let apifyUsername = null;
    let apifyError = null;
    try {
        const resp = await fetch('https://api.apify.com/v2/users/me', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + tok },
            signal: AbortSignal.timeout(10000)
        });
        apifyStatus = resp.status;
        const data = await resp.json().catch(() => null);
        if (resp.ok && data && data.data && data.data.username) {
            apifyUsername = data.data.username;
        } else if (data && data.error) {
            apifyError = (data.error.type || '') + ': ' + (data.error.message || '');
        }
    } catch (err) {
        apifyError = 'fetch threw: ' + (err && err.message);
    }

    let verdict;
    if (apifyUsername) {
        verdict = `Token works — Apify recognizes it as user "${apifyUsername}". If trending still fails, issue is elsewhere.`;
    } else if (apifyStatus === 401) {
        verdict = 'Apify rejected the token (HTTP 401). The token in Netlify env var is wrong, revoked, or has hidden whitespace/newline.';
    } else if (apifyStatus === 402) {
        verdict = 'Token recognized but account is out of credit (HTTP 402). Top up at console.apify.com/billing.';
    } else if (apifyStatus === 403) {
        verdict = 'Token recognized but lacks permission (HTTP 403). Probably a scoped token without "all" scope.';
    } else {
        verdict = `Apify returned HTTP ${apifyStatus}. Error: ${apifyError || '(none)'}.`;
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            ...result,
            apifyStatus,
            apifyUsername,
            apifyError,
            verdict
        }, null, 2)
    };
};
