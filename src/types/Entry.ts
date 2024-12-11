export interface Entry {
  id: string;
  feedId?: number;
  title: string;
  content: string;
  feedTitle?: string;
  aiSummary?: string;
  link?: string;
  isRead?: boolean;
  isStarred?: boolean;
  publishedAt?: string;
  chatHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
} 