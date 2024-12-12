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

export const testConnection = async (serverUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${serverUrl}/api/tags`);
    if (!response.ok) throw new Error('Failed to connect to Ollama server');
    return true;
  } catch (error) {
    console.error('Failed to connect to Ollama server:', error);
    return false;
  }
};

export const getAvailableModels = async (serverUrl: string): Promise<OllamaModel[]> => {
  try {
    const response = await fetch(`${serverUrl}/api/tags`);
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

      const response = await fetch(`${config.serverUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.summaryModel,
          prompt: content,
          system: config.summarySystemPrompt,
          stream: Boolean(safeOnToken)
        })
      });

      if (!response.ok) throw new Error('Failed to generate summary');

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