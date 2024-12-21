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

// Helper function to determine if we're in development mode
const isDevelopment = () => {
  return window.location.protocol === 'http:' || 
         window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1';
};

// Helper function to check if URL is internal
const isInternalUrl = (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.startsWith('192.168.') || 
           hostname.startsWith('10.') || 
           hostname.startsWith('172.') ||
           hostname === 'localhost' ||
           hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

// Helper function to handle Ollama requests with protocol check
const fetchOllama = async (url: string, options: RequestInit = {}) => {
  try {
    // In production (HTTPS), require HTTPS endpoints
    if (!isDevelopment() && url.startsWith('http://')) {
      throw new Error('Insecure HTTP endpoint not allowed in production. Please use HTTPS.');
    }

    // For internal URLs, we'll allow self-signed certificates
    if (isInternalUrl(url)) {
      options = {
        ...options,
        mode: 'cors',
        credentials: 'include',
        headers: {
          ...options.headers,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };
    }
    
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('Failed to connect to Ollama server');
    return response;
  } catch (error) {
    console.error('Ollama request failed:', error);
    throw error;
  }
};

export const testConnection = async (serverUrl: string): Promise<boolean> => {
  try {
    await fetchOllama(`${serverUrl}/api/tags`);
    return true;
  } catch (error) {
    console.error('Failed to connect to Ollama server:', error);
    return false;
  }
};

export const getAvailableModels = async (serverUrl: string): Promise<OllamaModel[]> => {
  try {
    const response = await fetchOllama(`${serverUrl}/api/tags`);
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

      const response = await fetchOllama(`${config.serverUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.summaryModel,
          prompt: content,
          system: config.summarySystemPrompt,
          stream: Boolean(safeOnToken)
        })
      });

      if (safeOnToken && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let summary = '';

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
        return summary;
      } else {
        const data = await response.json();
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
  