import { fetchWithTimeout, pipeStream, readCappedText } from './_lib/streamProxy.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, model, messages, stream, max_tokens } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'API key is required' });
    if (!model) return res.status(400).json({ error: 'Model is required' });

    const requestBody = { model, messages, stream: Boolean(stream) };
    if (max_tokens) requestBody.max_tokens = max_tokens;

    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await readCappedText(response);
      return res.status(response.status).json({ error: `OpenAI error: ${errorText}` });
    }

    if (stream && response.body) {
      // Normalize OpenAI SSE to NDJSON {"response":"token"} format
      await pipeStream(response, res, (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) return null;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return null;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          return content ? JSON.stringify({ response: content }) + '\n' : null;
        } catch {
          return null;
        }
      });
    } else {
      const text = await readCappedText(response);
      const data = JSON.parse(text);
      const content = data.choices?.[0]?.message?.content || '';
      res.json({ response: content });
    }
  } catch (error) {
    console.error('OpenAI proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to OpenAI' });
  }
}
