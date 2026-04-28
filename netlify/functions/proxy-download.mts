// Netlify v2 streaming function: /proxy-download
//
// Server-side proxy for media URLs whose source CDN blocks cross-origin
// browser fetch (Instagram, Twitter twimg, LinkedIn). Streams the upstream
// bytes directly to the browser with Content-Disposition: attachment so the
// browser saves the file. No size cap — uses the streaming response body
// instead of buffering through the 6MB Lambda body limit.
//
// GET /.netlify/functions/proxy-download?url=<urlencoded>&filename=<optional>

import type { Context } from '@netlify/functions';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 25000;

const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

function isBlockedHost(hostname: string): boolean {
    if (!hostname) return true;
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '0.0.0.0') return true;
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const a = +ipv4[1], b = +ipv4[2];
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
    }
    if (h === '::1' || h === '[::1]') return true;
    if (h.startsWith('fe80:') || h.startsWith('[fe80:')) return true;
    if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('[fc') || h.startsWith('[fd')) return true;
    return false;
}

function extractFilenameFromUrl(parsed: URL): string | null {
    try {
        const path = parsed.pathname || '';
        const tail = path.split('/').filter(Boolean).pop();
        if (!tail) return null;
        return tail.split('?')[0] || null;
    } catch {
        return null;
    }
}

function sanitizeFilename(name: string | undefined): string {
    if (!name) return 'flipit-media';
    let safe = String(name).replace(/["\r\n]/g, '').replace(/[\x00-\x1F\x7F]/g, '');
    safe = safe.trim();
    if (!safe) return 'flipit-media';
    if (safe.length > 200) safe = safe.slice(0, 200);
    return safe;
}

export default async (req: Request, _context: Context): Promise<Response> => {
    if (req.method === 'OPTIONS') {
        return new Response('', { status: 200, headers: corsHeaders });
    }
    if (req.method !== 'GET') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    const reqUrl = new URL(req.url);
    const rawUrl = reqUrl.searchParams.get('url');
    if (!rawUrl) return jsonResponse(400, { error: 'Invalid URL' });

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return jsonResponse(400, { error: 'Invalid URL' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return jsonResponse(400, { error: 'Invalid URL' });
    }
    if (isBlockedHost(parsed.hostname)) {
        return jsonResponse(400, { error: 'Blocked hostname' });
    }

    let upstream: Response;
    try {
        upstream = await fetch(parsed.toString(), {
            method: 'GET',
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept': '*/*',
                // Some CDNs (e.g. Instagram) require a Referer that looks like
                // a real browser origin to serve media. Mirror that here.
                'Referer': parsed.protocol + '//' + parsed.hostname + '/'
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
    } catch (err) {
        console.error('Proxy fetch failed:', (err as Error)?.message);
        return jsonResponse(502, { error: 'Could not retrieve that file.' });
    }

    if (!upstream.ok) {
        console.error('Proxy upstream non-OK:', upstream.status);
        return jsonResponse(502, { error: 'Could not retrieve that file.' });
    }

    if (!upstream.body) {
        return jsonResponse(502, { error: 'Empty response from upstream.' });
    }

    const filename = sanitizeFilename(
        reqUrl.searchParams.get('filename') || extractFilenameFromUrl(parsed) || 'flipit-media'
    );

    const upstreamCt = upstream.headers.get('content-type') || 'application/octet-stream';
    const upstreamLen = upstream.headers.get('content-length');

    const respHeaders: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': upstreamCt,
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'public, max-age=300'
    };
    if (upstreamLen) respHeaders['Content-Length'] = upstreamLen;

    // Stream the upstream body straight through. No buffering, no size cap.
    return new Response(upstream.body, {
        status: 200,
        headers: respHeaders
    });
};

export const config = {
    path: '/.netlify/functions/proxy-download'
};
