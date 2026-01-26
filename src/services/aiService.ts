interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface AIConfig {
  provider: 'ollama' | 'openai' | 'anthropic';
  // Ollama
  serverUrl: string;
  // OpenAI / Anthropic
  openaiApiKey?: string;
  anthropicApiKey?: string;
  // Models (per-task)
  summaryModel: string;
  chatModel: string;
  // Prompts
  summarySystemPrompt: string;
  chatSystemPrompt: string;
  // Queue
  maxConcurrentRequests: number;
}

// Backward-compatible alias
export type OllamaConfig = AIConfig;

import { enqueueRequest, initializeQueue } from './requestQueueService';

// --- Ollama helpers (unchanged from ollamaService.ts) ---

const isPrivateUrl = (serverUrl: string): boolean => {
  try {
    const url = new URL(serverUrl);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const shouldUseProxy = (serverUrl: string): boolean => {
  if (window.location.protocol === 'https:') {
    const host = window.location.hostname;
    if (host.endsWith('.vercel.app') || host.endsWith('.netlify.app')) {
      return false;
    }
    return true;
  }
  return false;
};

export const proxyFetch = async (
  targetUrl: string,
  method: string = 'GET',
  body?: object
): Promise<Response> => {
  return fetch('/api/ollama/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl, method, body })
  });
};

export const ollamaFetch = async (
  serverUrl: string,
  targetUrl: string,
  method: string = 'GET',
  body?: object
): Promise<Response> => {
  if (shouldUseProxy(serverUrl)) {
    return proxyFetch(targetUrl, method, body);
  }
  const fetchOptions: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }
  return fetch(targetUrl, fetchOptions);
};

// --- Provider-specific connection testing ---

export const testOllamaConnection = async (serverUrl: string): Promise<boolean> => {
  try {
    const response = await ollamaFetch(serverUrl, `${serverUrl}/api/tags`);
    if (!response.ok) throw new Error('Failed to connect to Ollama server');
    return true;
  } catch (error) {
    console.error('Failed to connect to Ollama server:', error);
    return false;
  }
};

export const testOpenAIConnection = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/openai/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      })
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const testAnthropicConnection = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/anthropic/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        model: 'claude-haiku-35-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      })
    });
    return response.ok;
  } catch {
    return false;
  }
};

// Backward-compatible wrapper
export const testConnection = async (serverUrl: string): Promise<boolean> => {
  return testOllamaConnection(serverUrl);
};

// --- Model listing ---

const OPENAI_MODELS = [
  { name: 'gpt-4o' },
  { name: 'gpt-4o-mini' },
  { name: 'gpt-4-turbo' },
  { name: 'gpt-3.5-turbo' }
];

const ANTHROPIC_MODELS = [
  { name: 'claude-sonnet-4-20250514' },
  { name: 'claude-haiku-35-20241022' },
  { name: 'claude-opus-4-20250514' }
];

export const getOllamaModels = async (serverUrl: string): Promise<{ name: string }[]> => {
  try {
    const response = await ollamaFetch(serverUrl, `${serverUrl}/api/tags`);
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
};

export const getAvailableModels = async (provider: AIConfig['provider'], serverUrl?: string): Promise<{ name: string }[]> => {
  switch (provider) {
    case 'openai':
      return OPENAI_MODELS;
    case 'anthropic':
      return ANTHROPIC_MODELS;
    case 'ollama':
    default:
      return getOllamaModels(serverUrl || '');
  }
};

// --- Config persistence ---

export const loadAIConfig = (): AIConfig | null => {
  const saved = localStorage.getItem('aiConfig');
  if (saved) return JSON.parse(saved);

  // Backward compat: migrate old ollamaConfig
  const oldSaved = localStorage.getItem('ollamaConfig');
  if (oldSaved) {
    const old = JSON.parse(oldSaved);
    const migrated: AIConfig = {
      provider: 'ollama',
      serverUrl: old.serverUrl || '',
      summaryModel: old.summaryModel || '',
      chatModel: old.chatModel || '',
      summarySystemPrompt: old.summarySystemPrompt || '',
      chatSystemPrompt: old.chatSystemPrompt || '',
      maxConcurrentRequests: old.maxConcurrentRequests || 2
    };
    saveAIConfig(migrated);
    return migrated;
  }

  return null;
};

// Backward-compatible alias
export const loadOllamaConfig = loadAIConfig;

export const saveAIConfig = (config: AIConfig): void => {
  localStorage.setItem('aiConfig', JSON.stringify(config));
  console.log('Saving AI config, provider:', config.provider, 'queue concurrency:', config.maxConcurrentRequests);
  initializeQueue(config.maxConcurrentRequests);
};

export const saveOllamaConfig = saveAIConfig;

// --- Chat fetch (used by ChatModal) ---

export const chatFetch = async (
  config: AIConfig,
  messages: Array<{ role: string; content: string }>,
  stream: boolean = true
): Promise<Response> => {
  switch (config.provider) {
    case 'openai':
      return fetch('/api/openai/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: config.openaiApiKey,
          model: config.chatModel,
          messages,
          stream
        })
      });

    case 'anthropic': {
      const systemMsg = messages.find(m => m.role === 'system');
      const nonSystemMessages = messages.filter(m => m.role !== 'system');
      return fetch('/api/anthropic/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: config.anthropicApiKey,
          model: config.chatModel,
          messages: nonSystemMessages,
          stream,
          system: systemMsg?.content
        })
      });
    }

    case 'ollama':
    default:
      return ollamaFetch(config.serverUrl, `${config.serverUrl}/api/chat`, 'POST', {
        model: config.chatModel,
        messages,
        stream
      });
  }
};

// --- Summary generation ---

export const generateSummary = async (
  content: string,
  url: string,
  config: AIConfig,
  onToken?: (token: string) => void,
  entryId?: number
): Promise<string> => {
  return enqueueRequest(async () => {
    try {
      const safeOnToken = onToken ? (token: string) => {
        requestAnimationFrame(() => onToken(token));
      } : undefined;

      let response: Response;

      switch (config.provider) {
        case 'openai':
          response = await fetch('/api/openai/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: config.openaiApiKey,
              model: config.summaryModel,
              messages: [
                { role: 'system', content: config.summarySystemPrompt },
                { role: 'user', content: content }
              ],
              stream: Boolean(safeOnToken)
            })
          });
          break;

        case 'anthropic':
          response = await fetch('/api/anthropic/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: config.anthropicApiKey,
              model: config.summaryModel,
              messages: [
                { role: 'user', content: content }
              ],
              system: config.summarySystemPrompt,
              stream: Boolean(safeOnToken)
            })
          });
          break;

        case 'ollama':
        default:
          response = await ollamaFetch(config.serverUrl, `${config.serverUrl}/api/generate`, 'POST', {
            model: config.summaryModel,
            prompt: content,
            system: config.summarySystemPrompt,
            stream: Boolean(safeOnToken)
          });
          break;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI response not ok:', response.status, errorText);
        throw new Error(`Failed to generate summary: ${errorText}`);
      }

      // All providers return normalized NDJSON {"response":"token"} format
      // (Ollama natively via /api/generate, OpenAI/Anthropic via proxy normalization)
      if (safeOnToken && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let summary = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            try {
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (!line.trim()) continue;
                const data = JSON.parse(line);
                if (data.response) {
                  summary += data.response;
                  safeOnToken(data.response);
                }
              }
            } catch (e) {
              console.error('Error parsing streaming response:', e);
            }
          }
        } catch (e) {
          reader.cancel().catch(() => {});
          throw e;
        }
        return summary;
      } else {
        const data = await response.json();
        console.log('generateSummary: received non-streaming response, has response:', !!data.response, 'length:', data.response?.length);
        if (data.error) {
          console.error('AI returned error:', data.error);
          throw new Error(data.error);
        }
        return data.response || '';
      }
    } catch (error) {
      console.error('Failed to generate summary:', error);
      throw error;
    }
  }, entryId);
};

export const generateSummaryWithFallback = async (
  entry: {
    content_fullArticle?: string;
    content_rssAbstract: string;
    id?: number;
  },
  config: AIConfig,
  onToken?: (token: string) => void
): Promise<{ summary: string; isFullContent: boolean }> => {
  const contentToSummarize = entry.content_fullArticle || entry.content_rssAbstract;
  const isFullContent = Boolean(entry.content_fullArticle);

  const summary = await generateSummary(
    contentToSummarize,
    '',
    config,
    onToken,
    entry.id
  );

  return { summary, isFullContent };
};
