export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });

  const { image_base64, media_type = 'image/jpeg' } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are a nutrition expert. Analyze the food in this image and return ONLY valid JSON (no markdown) in this exact format: { "dish": "name", "totalCalories": 450, "confidence": "medium", "items": [{ "name": "chicken breast", "amount": "150g", "calories": 165 }], "macros": { "protein": 35, "carbs": 40, "fat": 12 }, "tip": "short health tip" }',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
          { type: 'text', text: 'Analyze this food image.' },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(response.status).send(err);
  }

  const data = await response.json();
  res.json({ result: data.content[0].text });
}
