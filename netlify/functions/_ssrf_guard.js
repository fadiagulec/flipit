// Shared SSRF guard for any function that fetches a user-supplied URL
// server-side. Without this, an attacker can post
// http://169.254.169.254/latest/meta-data/iam/security-credentials/ and have
// Netlify's worker fetch AWS instance-metadata credentials on their behalf.
//
// Two defenses:
//   1. Hostname check (cheap, catches direct IPs and localhost)
//   2. DNS resolution + IP-range check (catches DNS-rebinding attacks where
//      attacker.com resolves to 169.254.169.254)
//
// Public API:
//   await assertPublicUrl(rawUrl)  → throws Error('Blocked URL') / returns parsed URL
//   isBlockedHostname(hostname)    → boolean (string-only check)
//   isBlockedIp(ip)                → boolean

const dns = require('dns').promises;

function isBlockedHostname(hostname) {
    if (!hostname) return true;
    const h = String(hostname).toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '0.0.0.0') return true;
    // Bracketed IPv6
    if (h === '[::1]' || h === '::1') return true;
    if (h.startsWith('[fe80:') || h.startsWith('fe80:')) return true;
    if (h.startsWith('[fc') || h.startsWith('[fd')) return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true;
    return false;
}

function isBlockedIp(ip) {
    if (!ip) return true;
    const s = String(ip).toLowerCase();

    // IPv6 loopback / link-local / unique-local
    if (s === '::1') return true;
    if (s.startsWith('fe80:')) return true;
    if (s.startsWith('fc') || s.startsWith('fd')) return true;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — strip and recurse
    const v4mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mapped) return isBlockedIp(v4mapped[1]);

    const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false; // unknown format — let DNS layer decide
    const a = +m[1], b = +m[2];
    if (a === 0) return true;             // 0.0.0.0/8
    if (a === 10) return true;            // 10.0.0.0/8 private
    if (a === 127) return true;           // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + AWS IMDS
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 224) return true;           // 224.0.0.0/4 multicast
    if (a >= 240) return true;            // 240.0.0.0/4 reserved + 255.255.255.255
    return false;
}

// Resolve hostname and reject if ANY returned address is private/internal.
// Catches DNS-rebinding (attacker.com → 169.254.169.254).
async function assertPublicUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('Invalid URL');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Only http(s) URLs allowed');
    }
    if (isBlockedHostname(parsed.hostname)) {
        throw new Error('Blocked URL');
    }
    // If hostname is already an IP, the IP check happens via the same path
    let addrs;
    try {
        addrs = await dns.lookup(parsed.hostname, { all: true });
    } catch {
        throw new Error('DNS lookup failed');
    }
    if (!addrs || addrs.length === 0) throw new Error('DNS lookup empty');
    for (const a of addrs) {
        if (isBlockedIp(a.address)) throw new Error('Blocked URL');
    }
    return parsed;
}

module.exports = { assertPublicUrl, isBlockedHostname, isBlockedIp };
