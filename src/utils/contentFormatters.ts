/**
 * Content formatting utilities for sharing and display
 */

import { type FeedEntryWithTitle } from '../services/db';
import { formatFullDate } from './dateFormatters';

/**
 * Format an entry for sharing via clipboard or email
 */
export function formatForSharing(entry: FeedEntryWithTitle): string {
  const parts = [
    `${entry.title}`,
    entry.feedTitle ? `From: ${entry.feedTitle}` : '',
    `Published: ${formatFullDate(new Date(entry.publishDate))}`,
    `Source: ${entry.link}`,
    '',
    entry.content_aiSummary ? `\nSummary${
      entry.aiSummaryMetadata?.model
        ? ` (${entry.aiSummaryMetadata.model} - ${
            entry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'
          })`
        : ''
    }:\n\n${entry.content_aiSummary}` : '',
    '',
    '\nFull Content:\n',
    entry.content_fullArticle || entry.content_rssAbstract
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Get the text content length from HTML content
 */
export function getContentLength(content: string): number {
  const div = document.createElement('div');
  div.innerHTML = content;
  return (div.textContent || div.innerText || '').length;
}

/**
 * Get preview content, truncated if necessary
 */
export function getPreviewContent(content: string, expanded: boolean, maxChars: number = 500): string {
  if (!content) return '';
  const contentLength = getContentLength(content);
  if (contentLength <= 600) return content;
  if (expanded) return content;

  let charCount = 0;
  let result = '';
  const div = document.createElement('div');
  div.innerHTML = content;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (charCount + node.textContent!.length > maxChars) {
      const remainingChars = maxChars - charCount;
      result += node.textContent!.slice(0, remainingChars);
      break;
    }
    charCount += node.textContent!.length;
    result += node.textContent;
  }

  return content.slice(0, content.indexOf(result) + result.length) + '...';
}
