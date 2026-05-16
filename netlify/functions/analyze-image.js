// Netlify Function: /analyze-image
// Takes an image URL, sends it to Claude Vision, and returns
// a detailed AI image prompt to recreate a similar image.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');
const { assertPublicUrl } = require('./_ssrf_guard');

exports.handler = async (event) => {
    const isPro = isProRequest(event);
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Rate limit gate ──
  const quota = await enforceAiQuota(event, isPro);
  if (!quota.allowed) return rateLimitResponse(headers, quota);

  if (!ANTHROPIC_API_KEY) {
    console.error('Image analysis error: ANTHROPIC_API_KEY not configured');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Image analysis failed. Please try again.' }) };
  }

  let imageUrl, slideNumber;
  try {
    const body = JSON.parse(event.body || '{}');
    imageUrl = (body.imageUrl || '').trim();
    slideNumber = body.slideNumber || 1;
  } catch (err) {
    console.error('Image analysis error: invalid request body', err);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (!imageUrl) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing imageUrl' }) };
  }

  try {
    const prompt = await analyzeImage(imageUrl, slideNumber);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ prompt, slideNumber })
    };
  } catch (err) {
    console.error('Image analysis error:', err);
    // Surface user-actionable errors (size, fetch, claude) so the UI can guide them.
    const msg = err && err.message ? err.message : '';
    let userMsg = 'Image analysis failed. Please try again.';
    // Status-code routing: client errors → 4xx, upstream/server errors → 5xx.
    // SSRF/invalid-URL is the user's fault (bad input), not a server crash.
    let statusCode = 500;
    if (/blocked url|invalid url|only http|dns lookup/i.test(msg)) {
      userMsg = 'That image URL is not allowed.';
      statusCode = 400;
    }
    else if (/too large/i.test(msg)) { userMsg = msg; statusCode = 413; }
    else if (/request too large|over.{0,5}limit/i.test(msg)) { userMsg = 'Image too large for Claude — try a smaller post.'; statusCode = 413; }
    else if (/rate.?limit/i.test(msg)) { userMsg = 'Hit the AI rate limit — wait 60 seconds and try again.'; statusCode = 429; }
    else if (/can't generate a recreate prompt/i.test(msg)) { userMsg = msg; statusCode = 422; }
    else if (/Claude API/i.test(msg)) { userMsg = 'AI service error: ' + msg.slice(0, 120); statusCode = 502; }
    else if (/Image fetch HTTP/i.test(msg)) { userMsg = 'Could not fetch this image (the source may be private or expired).'; statusCode = 502; }
    else if (/empty body/i.test(msg)) { userMsg = 'The image source returned empty data.'; statusCode = 502; }
    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: userMsg })
    };
  }
};

// Fetch the image server-side and convert to base64 so Claude Vision can
// analyze images that block hot-linking from Anthropic's servers
// (Instagram CDN, TikTok thumbnails, Twitter media). This is the fix for
// "Image analysis failed" on every carousel image.
async function fetchImageAsBase64(imageUrl) {
  // SSRF gate: reject private IPs, link-local (AWS IMDS), loopback, and
  // DNS-rebinding attacks (attacker.com → 169.254.169.254). Without this an
  // attacker could exfiltrate AWS credentials by posting a metadata URL and
  // reading the base64 back from Claude's response.
  await assertPublicUrl(imageUrl);

  const res = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': 'https://www.google.com/'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error('Image fetch HTTP ' + res.status);

  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength < 100) throw new Error('Image fetch returned empty body');

  // Sniff media type from magic bytes — header from upstream is unreliable
  const bytes = new Uint8Array(buf);
  let mediaType = 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) mediaType = 'image/png';
  else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) mediaType = 'image/gif';
  else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
           bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) mediaType = 'image/webp';
  else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) mediaType = 'image/jpeg';

  // Anthropic API has a strict per-message payload cap. Empirically images
  // bigger than ~3.5 MB binary (~4.7 MB base64) start triggering generic
  // "request too large" 400s. Cap aggressively at 3 MB binary.
  if (buf.byteLength > 3 * 1024 * 1024) {
    throw new Error('Image too large for analysis (' + Math.round(buf.byteLength / 1024) + ' KB > 3072 KB cap). Try a smaller post.');
  }

  return {
    mediaType,
    base64: Buffer.from(buf).toString('base64')
  };
}

async function analyzeImage(imageUrl, slideNumber) {
  // Fetch first, send as base64 — works even when Anthropic can't reach
  // the source URL (Instagram CDN tokens, expired Twitter URLs, etc.).
  let imagePayload;
  try {
    const fetched = await fetchImageAsBase64(imageUrl);
    imagePayload = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: fetched.mediaType,
        data: fetched.base64
      }
    };
  } catch (fetchErr) {
    console.warn('Server-side fetch failed, falling back to URL source:', fetchErr.message);
    imagePayload = {
      type: 'image',
      source: { type: 'url', url: imageUrl }
    };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            imagePayload,
            {
              type: 'text',
              text: `You are a forensic image-to-prompt engineer. Your job is to look at THIS specific image and produce an AI image prompt (for Midjourney / DALL-E / Ideogram / Leonardo) that, when run, will recreate THIS image as faithfully as possible. Not a "similar" image. THIS image.

ABSOLUTE RULES:
- Describe ONLY what you can actually see in this image. Do not invent, generalize, or use stock-photo placeholder language.
- BANNED phrases: "stylish person", "casual clothing", "modern setting", "lifestyle photo", "beautiful lighting", "vibrant colors", "aesthetic vibe", "cozy atmosphere", or anything else that could describe 10,000 different images. If you catch yourself writing one of these, replace it with the specific visible detail.
- Be concrete. "A woman with shoulder-length chestnut-brown hair, parted on the left, wearing a cream chunky cable-knit sweater" — NOT "a stylish woman in casual wear".
- If a detail is unclear, describe what you DO see (e.g. "a logo on the mug, partially obscured, appearing to read 'STAR...'") rather than guessing or omitting.

SAFETY (the recreate prompt is going to social media — keep it appropriate):
- If the source image contains scars, wounds, blood, self-harm marks, medication, IV drips, or other clinical/distressing content, DO NOT include those details. Describe the rest of the scene and SKIP the harmful element entirely (don't mention scars/wrists/blood). The recreated image must be social-media-safe even if the source isn't.
- If the source image shows a person in visible emotional distress (crying, hunched, contracted, self-isolating posture), describe them in a NEUTRAL/CALM frame — "seated upright, expression composed, hands resting in lap" — not the distress.
- If the source has explicit nudity or sexually suggestive imagery, refuse with: "Image contains content I can't generate a recreate prompt for. Try a different post." (output literally that string and nothing else, no --ar tags).
- Otherwise: full forensic detail.

YOU MUST DESCRIBE, IN ORDER, AS ONE FLOWING PARAGRAPH:

1. SUBJECT: exact appearance — for people: gender presentation, approximate age range, hair (length, color, style, parting), skin tone, facial expression, eye direction, body pose, hand positions; for objects/products: exact item, brand if readable, color, material, condition. Count visible items.

2. WARDROBE / SURFACE DETAIL: every garment or material visible — fabric type (knit, denim, satin, matte plastic, brushed metal), color (specific: "dusty sage" not "green"), fit, any logos/text/patterns.

3. SETTING & PROPS: location type, every visible prop with its color and position, what is in the foreground, midground, and background. Describe leading lines, surfaces, walls, floor, windows.

4. COMPOSITION: subject placement in frame (e.g. "centered, occupying lower two-thirds", "rule-of-thirds right intersection"), camera angle (eye-level, low-angle 15° up, overhead 90° flat-lay, three-quarter), framing (close-up, medium, wide), and any visible leading lines or symmetry.

5. LIGHTING: direction expressed as a clock position relative to subject (e.g. "key light from 10 o'clock high"), quality (hard / soft / diffused / dappled), apparent color temperature (e.g. "warm 3000K tungsten", "neutral 5500K daylight", "cool 7000K overcast"), presence of fill, rim, or backlight, and visible shadow direction and softness.

6. COLOR PALETTE: 3-5 dominant colors with hex-approximate values, e.g. "#E8DCC4 cream, #6B4423 walnut brown, #2D2A26 charcoal, #C9A876 muted gold". Note overall tonal range (high-key, low-key, muted, saturated).

7. CAMERA / LENS INFERENCE: focal length and aperture inferred from depth-of-field, perspective compression, and distortion — e.g. "85mm portrait compression, f/1.8 shallow DOF with creamy bokeh", or "24mm wide-angle slight edge distortion, f/8 deep focus", or "100mm macro, f/2.8 razor-thin focal plane".

8. ANY VISIBLE TEXT: transcribe it exactly as it appears, and note its placement, font style (serif / sans / script / handwritten), color, and size relative to frame.

9. PHOTOGRAPHIC STYLE: editorial, lifestyle, product-on-white, flat-lay, candid documentary, fashion campaign, etc. — pick the one that actually matches.

10. ASPECT RATIO: look at the actual image and pick the closest of 1:1, 4:5, 9:16, 16:9, 3:2, 2:3.

OUTPUT FORMAT:
- ONE long descriptive paragraph (no line breaks, no bullets, no headers, no labels like "Subject:" or "Lighting:").
- Followed by a single space and then the technical recipe: \`--ar [the actual ratio you observed] --style raw --v 6.1\`
- NO preamble. Do NOT start with "Here's the prompt", "This image shows", "The image depicts", "A photo of", or any meta-commentary. Start directly with the subject description.
- NO closing remarks after the --ar flags.

Begin.`
            }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || 'Claude API error');
  }

  if (data.content && data.content[0] && data.content[0].text) {
    return data.content[0].text.trim();
  }

  throw new Error('No response from Claude');
}
