export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { meals, userApiKey } = req.body || {};

    const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured. Add your Anthropic API key in Settings (⚙️).' });
    if (!meals || !Array.isArray(meals) || meals.length === 0) {
      return res.status(400).json({ error: 'No meals provided' });
    }

    const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
    const mealList = meals.map(m => `- ${m.dish}: ${m.calories} ккал (время: ${m.time})`).join('\n');

    const system = `Ты персональный нутрициолог и диетолог. Ты помогаешь конкретному человеку достичь цели по снижению веса.
Профиль пользователя:
- Возраст: 48 лет
- Пол: мужской
- Вес: 85 кг
- Рост: 172 см
- Уровень активности: средний
- Цель: сбросить 10 кг за 3 месяца

Для достижения цели пользователю нужно потреблять примерно 1500-1700 ккал в день (дефицит ~500 ккал от нормы поддержания).

Ответь на русском языке. Будь конкретным, дружелюбным и мотивирующим. Дай практичные советы.
Верни ответ ТОЛЬКО в виде валидного JSON (без markdown) в точно таком формате:
{
  "summary": "краткая оценка дня (1-2 предложения)",
  "score": 75,
  "status": "good",
  "calories_comment": "комментарий по калориям",
  "advice": ["совет 1", "совет 2", "совет 3"],
  "tomorrow_tip": "что стоит сделать завтра"
}
Где score — оценка дня от 0 до 100, status — "excellent" / "good" / "warning" / "danger".`;

    const userMessage = `Вот что я съел сегодня (суммарно ${totalCalories} ккал):\n${mealList}\n\nПроанализируй мой день питания и дай персональные рекомендации.`;

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const callWithRetry = async (body) => {
      const delays = [2000, 4000, 6000];
      for (let i = 0; i < delays.length; i++) {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.status !== 529) return r;
        await sleep(delays[i]);
      }
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    const response = await callWithRetry({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    if (response.status === 529) {
      return res.status(503).json({ error: 'Серверы ИИ сейчас перегружены. Подожди минуту и попробуй снова.' });
    }

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
