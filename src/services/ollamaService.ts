interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaConfig {
  serverUrl: string;
  summaryModel: string;
  chatModel: string;
  summarySystemPrompt: string;
  chatSystemPrompt: string;
  maxConcurrentRequests: number;
}

import { enqueueRequest, initializeQueue } from './requestQueueService';
import { fetchArticleContent } from './articleService';

// Check if we need to use the proxy (when served over HTTPS or accessing non-localhost)
export const shouldUseProxy = (serverUrl: string): boolean => {
  // Always use proxy when app is served over HTTPS (mixed content prevention)
  if (window.location.protocol === 'https:') {
    return true;
  }
  // Use proxy for non-localhost URLs when running locally
  try {
    const url = new URL(serverUrl);
    return url.hostname !== 'localhost' && url.hostname !== '127.0.0.1';
  } catch {
    return false;
  }
};

// Make a request through the proxy
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

export const testConnection = async (serverUrl: string): Promise<boolean> => {
  try {
    const targetUrl = `${serverUrl}/api/tags`;
    let response: Response;

    if (shouldUseProxy(serverUrl)) {
      response = await proxyFetch(targetUrl);
    } else {
      response = await fetch(targetUrl);
    }

    if (!response.ok) throw new Error('Failed to connect to Ollama server');
    return true;
  } catch (error) {
    console.error('Failed to connect to Ollama server:', error);
    return false;
  }
};

export const getAvailableModels = async (serverUrl: string): Promise<OllamaModel[]> => {
  try {
    const targetUrl = `${serverUrl}/api/tags`;
    let response: Response;

    if (shouldUseProxy(serverUrl)) {
      response = await proxyFetch(targetUrl);
    } else {
      response = await fetch(targetUrl);
    }

    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
};

export const loadOllamaConfig = (): OllamaConfig | null => {
  const saved = localStorage.getItem('ollamaConfig');
  const config = saved ? JSON.parse(saved) : null;
  return config;
};

export const saveOllamaConfig = (config: OllamaConfig): void => {
  localStorage.setItem('ollamaConfig', JSON.stringify(config));
  console.log('Saving Ollama config, updating queue concurrency:', config.maxConcurrentRequests);
  initializeQueue(config.maxConcurrentRequests);
};

export const generateSummary = async (
  content: string,
  url: string,
  config: OllamaConfig,
  onToken?: (token: string) => void,
  entryId?: number
): Promise<string> => {
  return enqueueRequest(async () => {
    try {
      // Use requestAnimationFrame for UI updates
      const safeOnToken = onToken ? (token: string) => {
        requestAnimationFrame(() => onToken(token));
      } : undefined;

      const targetUrl = `${config.serverUrl}/api/generate`;
      const requestBody = {
        model: config.summaryModel,
        prompt: content,
        system: config.summarySystemPrompt,
        stream: Boolean(safeOnToken)
      };

      let response: Response;
      const useProxy = shouldUseProxy(config.serverUrl);
      console.log('generateSummary: using proxy:', useProxy, 'stream:', requestBody.stream);

      if (useProxy) {
        response = await proxyFetch(targetUrl, 'POST', requestBody);
      } else {
        response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ollama response not ok:', response.status, errorText);
        throw new Error(`Failed to generate summary: ${errorText}`);
      }

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
          // Cancel the reader on error to prevent memory leaks
          reader.cancel().catch(() => {});
          throw e;
        }
        return summary;
      } else {
        const data = await response.json();
        console.log('generateSummary: received non-streaming response, has response:', !!data.response, 'length:', data.response?.length);
        if (data.error) {
          console.error('Ollama returned error:', data.error);
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
  config: OllamaConfig,
  onToken?: (token: string) => void
): Promise<{ summary: string; isFullContent: boolean }> => {
  // Determine which content to use
  const contentToSummarize = entry.content_fullArticle || entry.content_rssAbstract;
  const isFullContent = Boolean(entry.content_fullArticle);

  // Generate the summary
  const summary = await generateSummary(
    contentToSummarize,
    '', // URL is not needed for summarization
    config,
    onToken,
    entry.id
  );

  return {
    summary,
    isFullContent
  };
};
  