// Netlify Function: /analyze-image
// Takes an image URL, sends it to Claude Vision, and returns
// a detailed AI image prompt to recreate a similar image.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

exports.handler = async (event) => {
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Image analysis failed. Please try again.' })
    };
  }
};

async function analyzeImage(imageUrl, slideNumber) {
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
            {
              type: 'image',
              source: {
                type: 'url',
                url: imageUrl
              }
            },
            {
              type: 'text',
              text: `You are a forensic image-to-prompt engineer. Your job is to look at THIS specific image and produce an AI image prompt (for Midjourney / DALL-E / Ideogram / Leonardo) that, when run, will recreate THIS image as faithfully as possible. Not a "similar" image. THIS image.

ABSOLUTE RULES:
- Describe ONLY what you can actually see in this image. Do not invent, generalize, or use stock-photo placeholder language.
- BANNED phrases: "stylish person", "casual clothing", "modern setting", "lifestyle photo", "beautiful lighting", "vibrant colors", "aesthetic vibe", "cozy atmosphere", or anything else that could describe 10,000 different images. If you catch yourself writing one of these, replace it with the specific visible detail.
- Be concrete. "A woman with shoulder-length chestnut-brown hair, parted on the left, wearing a cream chunky cable-knit sweater" — NOT "a stylish woman in casual wear".
- If a detail is unclear, describe what you DO see (e.g. "a logo on the mug, partially obscured, appearing to read 'STAR...'") rather than guessing or omitting.

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
