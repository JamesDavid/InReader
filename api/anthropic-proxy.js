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
    const { apiKey, model, messages, stream, system, max_tokens } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'API key is required' });
    if (!model) return res.status(400).json({ error: 'Model is required' });

    const requestBody = {
      model,
      messages,
      max_tokens: max_tokens || 4096,
      stream: Boolean(stream)
    };
    if (system) requestBody.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Anthropic error: ${errorText}` });
    }

    if (stream && response.body) {
      // Normalize Anthropic SSE to NDJSON {"response":"token"} format
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);

            try {
              const json = JSON.parse(data);
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                res.write(JSON.stringify({ response: json.delta.text }) + '\n');
              }
            } catch (e) {
              // ignore partial JSON
            }
          }
        }
        res.end();
      } catch (error) {
        reader.cancel();
        if (!res.headersSent) {
          res.status(500).json({ error: 'Streaming error' });
        }
      }
    } else {
      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      res.json({ response: content });
    }
  } catch (error) {
    console.error('Anthropic proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to Anthropic' });
  }
}
