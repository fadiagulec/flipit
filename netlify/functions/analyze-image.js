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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
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
              text: `You are an expert AI image prompt engineer. Analyze this image and create a detailed prompt to recreate a very similar image using AI image generators (Midjourney, DALL-E, Ideogram, Leonardo).

Your prompt MUST include:
- Subject description (what/who is in the image, pose, expression, clothing)
- Setting/environment (location, props, background details)
- Lighting (type, direction, quality, color temperature)
- Color palette (dominant colors, accent colors, overall tone)
- Composition (camera angle, framing, depth of field)
- Mood/atmosphere
- Photography style (editorial, lifestyle, product, etc.)
- Technical details (lens type, focal length feel)

End with: --ar 4:5 --style raw --v 6.1

Return ONLY the prompt text, nothing else. No explanations, no labels, no numbering. Just the pure prompt ready to paste.`
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
