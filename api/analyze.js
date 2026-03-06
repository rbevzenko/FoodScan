export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });

  const { image_base64, media_type = 'image/jpeg' } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'You are a nutrition expert. Analyze the food in the image and return ONLY a raw JSON object with no markdown, no code fences, no extra text. Use exactly this structure: {"dish":"name","totalCalories":450,"confidence":"medium","items":[{"name":"chicken breast","amount":"150g","calories":165}],"macros":{"protein":35,"carbs":40,"fat":12},"tip":"short health tip"}',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Analyze this food image and return only the JSON.' },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const raw = data.content[0].text;

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON in response', raw });

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return res.status(500).json({ error: 'JSON parse failed', raw });
    }

    res.json({ result: parsed });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
