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
 * Get the visible text length from HTML/markdown content.
 * Uses DOMParser (which does not execute scripts or fetch resources) rather than
 * assigning untrusted markup to a live element's innerHTML.
 */
export function getContentLength(content: string): number {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  return (doc.body.textContent || '').length;
}

/**
 * Get preview content, truncated if necessary.
 *
 * The content here is Markdown (re-rendered by ReactMarkdown), so we truncate the
 * raw string directly. The previous implementation walked HTML text nodes and
 * then tried to map the collected plain text back onto the source with
 * content.indexOf(result); once the source had any tags/markup between text
 * nodes that indexOf returned -1 and the slice cut at an arbitrary offset,
 * producing broken output.
 */
export function getPreviewContent(content: string, expanded: boolean, maxChars: number = 500): string {
  if (!content) return '';
  if (expanded) return content;
  if (getContentLength(content) <= 600) return content;
  if (content.length <= maxChars) return content;

  // Break on a word boundary near the limit so we don't cut mid-word / mid-token.
  let truncated = content.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.6) {
    truncated = truncated.slice(0, lastSpace);
  }
  return truncated.trimEnd() + '...';
}
