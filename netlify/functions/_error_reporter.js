// Side-effect-only error reporter. Patches console.error so every existing
// log call ALSO fires a structured POST to ERROR_WEBHOOK_URL.
//
// Lambda-aware: unawaited fetches die when the container freezes after the
// handler returns. So we (a) track every reporter Promise in a Set and
// (b) expose `wrap(handler)` which awaits pending reports before returning.
//
// Wire-up pattern:
//   require('./_error_reporter');
//   exports.handler = require('./_error_reporter').wrap(async (event) => {...});
//
// Design constraints:
//   - Never throw. Reporter failure must not affect the user response.
//   - Bounded latency: 3s fetch timeout caps worst-case delay on errors.
//   - Never log a partial secret. The webhook URL is never in the payload.
//   - Safe to require multiple times; only patches console.error once.

const WEBHOOK = process.env.ERROR_WEBHOOK_URL;
const SITE = 'flipit.earnwith-ai.com';

const pending = new Set();

if (WEBHOOK && !console.__flipitErrorReporterPatched) {
    const originalError = console.error.bind(console);
    console.error = function (...args) {
        // 1. Preserve normal stderr logging (visible in netlify logs:function)
        originalError(...args);
        // 2. Send to webhook, tracked so wrap() can await before container freeze
        try {
            const message = args
                .map((a) => {
                    if (a == null) return String(a);
                    if (a instanceof Error) return a.stack || a.message;
                    if (typeof a === 'object') {
                        try { return JSON.stringify(a); } catch { return String(a); }
                    }
                    return String(a);
                })
                .join(' ')
                .slice(0, 4000);

            const payload = {
                site: SITE,
                timestamp: new Date().toISOString(),
                function: process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown',
                message: message
            };

            const p = fetch(WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(3000)
            }).catch(() => { /* swallow network errors */ });

            pending.add(p);
            // Drop on completion so the Set doesn't grow unbounded
            p.finally(() => pending.delete(p)).catch(() => {});
        } catch {
            /* swallow reporter errors — must never affect the handler */
        }
    };
    console.__flipitErrorReporterPatched = true;
}

// Await all in-flight reports. Cheap if Set is empty (common case).
async function flushPending() {
    if (pending.size === 0) return;
    // Snapshot then clear so concurrent reports don't deadlock the flush.
    const snapshot = Array.from(pending);
    await Promise.allSettled(snapshot);
}

// Handler wrapper. Ensures any reporter Promises queued during the handler
// finish before Lambda freezes the container post-return.
function wrap(handler) {
    return async function wrappedHandler(...args) {
        let result;
        try {
            result = await handler(...args);
        } catch (err) {
            try { console.error('Unhandled handler error:', err); } catch {}
            try { await flushPending(); } catch {}
            throw err;
        }
        try { await flushPending(); } catch {}
        return result;
    };
}

// Netlify treats every .js file in functions/ as a function endpoint, even
// helpers. Give it a benign 404 handler so direct probes return cleanly.
async function handler() {
    return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not found' })
    };
}

module.exports = { handler, wrap, flushPending };
