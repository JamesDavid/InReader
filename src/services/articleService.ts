import { enqueueRequest } from './requestQueueService';
import TurndownService from 'turndown';
import { db, type FeedEntry, notifyEntryUpdate } from './db';
import { loadOllamaConfig, generateSummaryWithFallback } from './ollamaService';
import { Readability } from '@mozilla/readability';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
});

export interface ArticleContent {
  content: string;
  isFullContent: boolean;
}

interface ArticleError extends Error {
  code?: string;
  details?: string;
}

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export async function fetchArticleContent(url: string, entryId?: number): Promise<ArticleContent> {
  return enqueueRequest(async () => {
    try {
      // Fetch the article HTML through CORS proxy
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      const html = await response.text();

      // Create a DOM parser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Use Readability to parse the article
      const reader = new Readability(doc);
      const article = reader.parse();

      if (!article || !article.content) {
        throw new Error('Failed to extract article content');
      }

      // Convert HTML content to markdown
      const markdown = turndownService.turndown(article.content);

      return {
        content: markdown,
        isFullContent: true
      };
    } catch (error) {
      console.error('Failed to fetch article:', error);
      throw {
        message: 'Failed to fetch article content',
        code: 'FETCH_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      } as ArticleError;
    }
  }, entryId);
}

export async function processEntryForSummary(entryId: number): Promise<void> {
  return enqueueRequest(async () => {
    try {
      const entry = await db.entries.get(entryId);
      if (!entry) throw new Error('Entry not found');

      const config = loadOllamaConfig();
      if (!config) throw new Error('Ollama configuration not found');

      // Generate summary with automatic fallback
      const { summary, isFullContent } = await generateSummaryWithFallback(
        entry,
        config,
        undefined // No token callback needed for background processing
      );

      // Update the entry with the summary and metadata
      await db.entries.update(entryId, {
        content_aiSummary: summary,
        aiSummaryMetadata: {
          isFullContent,
          model: config.summaryModel
        },
        requestProcessingStatus: 'success'
      });
      notifyEntryUpdate(entryId);

    } catch (error) {
      console.error('Error processing entry for summary:', error);
      const errorInfo = {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any).code || 'UNKNOWN',
        details: (error as any).details
      };
      await db.entries.update(entryId, {
        requestProcessingStatus: 'failed',
        requestError: errorInfo
      });
      notifyEntryUpdate(entryId);
      throw error;
    }
  }, entryId);
} 