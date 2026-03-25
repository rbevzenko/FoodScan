export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { image_base64, media_type, ingredients, dish, clarification, currentResult } = req.body;

  let system, messages;

  if (clarification && currentResult) {
    system = 'You are a nutrition expert. You will be given a previous food analysis and a user clarification. Revise the analysis accordingly and return ONLY valid JSON (no markdown) in this exact format: { "dish": "name", "totalCalories": 450, "confidence": "high", "items": [{ "name": "chicken breast", "amount": "150g", "calories": 165 }], "macros": { "protein": 35, "carbs": 40, "fat": 12 }, "tip": "short health tip" }';
    messages = [{ role: 'user', content: `Previous analysis: ${JSON.stringify(currentResult)}\n\nUser clarification: "${clarification}"\n\nRevise the nutrition analysis based on the clarification. Return only JSON.` }];
  } else if (image_base64) {
    system = 'You are a nutrition expert. Analyze the food in this image and return ONLY valid JSON (no markdown) in this exact format: { "dish": "name", "totalCalories": 450, "confidence": "medium", "items": [{ "name": "chicken breast", "amount": "150g", "calories": 165 }], "macros": { "protein": 35, "carbs": 40, "fat": 12 }, "tip": "short health tip" }';
    messages = [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 } },
      { type: 'text', text: 'Analyze this food image.' },
    ]}];
  } else if (ingredients && dish) {
    const list = ingredients.map(i => `${i.name}: ${i.amount}`).join(', ');
    system = 'You are a nutrition expert. Calculate nutrition for the given ingredients and return ONLY valid JSON (no markdown) in this exact format: { "dish": "name", "totalCalories": 450, "confidence": "high", "items": [{ "name": "chicken breast", "amount": "150g", "calories": 165 }], "macros": { "protein": 35, "carbs": 40, "fat": 12 }, "tip": "short health tip" }';
    messages = [{ role: 'user', content: `Recalculate nutrition for "${dish}" with these ingredients: ${list}. Return only JSON.` }];
  } else {
    return res.status(400).json({ error: 'Invalid request' });
  }


  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, system, messages }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON in response' });
    res.json(JSON.parse(match[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
