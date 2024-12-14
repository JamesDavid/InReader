import { enqueueRequest } from './requestQueueService';
import TurndownService from 'turndown';
import { db, type FeedEntry, notifyEntryUpdate } from './db';
import { loadOllamaConfig, generateSummaryWithFallback } from './ollamaService';

const API_URL = 'http://localhost:3000/api';
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

export async function fetchArticleContent(url: string, entryId?: number): Promise<ArticleContent> {
  return enqueueRequest(async () => {
    try {
      console.log('Fetching article content for:', url);
      // First try to fetch the full article content
      const response = await fetch(`${API_URL}/fetch-article`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url,
          // Add some common headers to help with article extraction
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        
        let errorMessage: string;
        if (response.status === 403) {
          errorMessage = 'Access denied - this might be a paywall or login-required article';
        } else if (response.status === 404) {
          errorMessage = 'Article not found - the URL might have changed or been removed';
        } else if (response.status === 429) {
          errorMessage = 'Too many requests - the website is limiting our access';
        } else {
          errorMessage = `Failed to fetch article: ${errorText}`;
        }
        
        const error = new Error(errorMessage) as ArticleError;
        error.code = response.status.toString();
        throw error;
      }

      const data = await response.json();
      
      // If we got empty content, throw an error
      if (!data.content || data.content.trim().length === 0) {
        const error = new Error('No article content found - the website might be blocking content extraction') as ArticleError;
        error.code = 'EMPTY_CONTENT';
        throw error;
      }

      // Convert HTML to Markdown
      const markdown = turndownService.turndown(data.content);

      // Clean up the content - remove extra whitespace, normalize line endings
      const cleanedMarkdown = markdown
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // If the content is too short, it might not be the full article
      if (cleanedMarkdown.length < 500) {
        const error = new Error('Article content seems incomplete - might be hitting a paywall or content restriction') as ArticleError;
        error.code = 'SHORT_CONTENT';
        error.details = `Content length: ${cleanedMarkdown.length} characters`;
        throw error;
      }

      console.log('Successfully fetched and converted article content, length:', cleanedMarkdown.length);
      return {
        content: cleanedMarkdown,
        isFullContent: true
      };
    } catch (error) {
      console.error('Error fetching article:', error);
      // Ensure we're always throwing an ArticleError
      if (error instanceof Error) {
        const articleError = error as ArticleError;
        if (!articleError.code) {
          articleError.code = 'UNKNOWN';
          if (error.message.includes('fetch')) {
            articleError.code = 'NETWORK';
            articleError.message = 'Network error - could not reach the article website';
          }
        }
        throw articleError;
      }
      const genericError = new Error('Unknown error while fetching article') as ArticleError;
      genericError.code = 'UNKNOWN';
      throw genericError;
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