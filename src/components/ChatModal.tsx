import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadOllamaConfig } from '../services/ollamaService';
import { fetchArticleContent } from '../services/articleService';
import { saveChatHistory, getChatHistory, type ChatMessage } from '../services/db';
import TurndownService from 'turndown';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  articleTitle: string;
  articleContent: string;
  articleUrl: string;
  entryId: number;
  onChatUpdate?: () => void;
}

interface ArticleError extends Error {
  code?: string;
  details?: string;
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  bulletListMarker: '-',
  hr: '---'
});

// Configure turndown to handle more HTML elements
turndownService.addRule('subscript', {
  filter: ['sub'],
  replacement: content => `~${content}~`
});

turndownService.addRule('superscript', {
  filter: ['sup'],
  replacement: content => `^${content}`
});

turndownService.addRule('underline', {
  filter: ['u'],
  replacement: content => `__${content}__`
});

const convertHtmlToMarkdown = (html: string): string => {
  try {
    // Pre-process the HTML to handle common issues
    const processedHtml = html
      .replace(/<(p|div|section)>\s*<br\s*\/?>\s*<\/\1>/gi, '') // Remove empty paragraphs with just <br>
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>') // Reduce multiple breaks to max two
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Convert to markdown
    const markdown = turndownService.turndown(processedHtml);

    // Post-process the markdown
    return markdown
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines to max two
      .replace(/\[([^\]]+)\]\(javascript:[^)]+\)/g, '$1') // Remove javascript: links
      .trim();
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    // Fallback to basic text extraction if conversion fails
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }
};

const ChatModal: React.FC<ChatModalProps> = ({ 
  isOpen, 
  onClose, 
  isDarkMode,
  articleTitle,
  articleContent,
  articleUrl,
  entryId,
  onChatUpdate
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingArticle, setIsFetchingArticle] = useState(false);
  const [fullArticleContent, setFullArticleContent] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>('');
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUsingFallbackContent, setIsUsingFallbackContent] = useState(false);
  const [streamingMessageId] = useState(() => Math.random().toString(36).substring(7));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeError, setIframeError] = useState<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior
      });
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      // Use a short delay to ensure content is rendered
      const timeoutId = setTimeout(() => {
        scrollToBottom('smooth');
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, scrollToBottom]);

  // Load chat history when modal opens
  useEffect(() => {
    if (isOpen && entryId) {
      const loadHistory = async () => {
        try {
          const history = await getChatHistory(entryId);
          if (history && history.length > 0) {
            setMessages(history);
            // Set active model from the last assistant message
            const lastAssistantMessage = history
              .filter(msg => msg.role === 'assistant')
              .pop();
            if (lastAssistantMessage?.model) {
              setActiveModel(lastAssistantMessage.model);
            }
          }
        } catch (err) {
          console.error('Failed to load chat history:', err);
        }
      };
      loadHistory();
    }
  }, [isOpen, entryId]);

  // Ensure scroll position after initial load and content fetch
  useEffect(() => {
    if (isOpen && !isFetchingArticle && messages.length > 0) {
      const timeoutId = setTimeout(() => {
        scrollToBottom('auto');
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, isFetchingArticle, messages.length, scrollToBottom]);

  // Save chat history when messages change
  useEffect(() => {
    if (entryId && messages.length > 0) {
      saveChatHistory(entryId, messages);
    }
  }, [messages, entryId]);

  // Function to extract content from iframe
  const extractIframeContent = useCallback(() => {
    if (!iframeRef.current) return false;
    
    try {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (!iframeDoc) {
        console.warn('Could not access iframe document');
        return false;
      }

      // Remove script tags and hidden elements
      const scripts = iframeDoc.getElementsByTagName('script');
      const hiddenElements = iframeDoc.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden]');
      [...scripts, ...hiddenElements].forEach(el => el.remove());

      // Try multiple selectors to find the main content
      const selectors = [
        'article',
        'main',
        '[role="main"]',
        '.article-content',
        '.post-content',
        '.entry-content',
        '#content',
        '.content'
      ];

      let content: Element | null = null;
      for (const selector of selectors) {
        content = iframeDoc.querySelector(selector);
        if (content && content.textContent && content.textContent.length > 200) {
          break;
        }
      }

      // If no content found through selectors, try the body
      if (!content || !content.textContent || content.textContent.length < 200) {
        content = iframeDoc.body;
      }

      if (content) {
        // Get the text content directly, which automatically strips HTML
        const extractedText = content.textContent || '';
        const cleanedText = stripHtml(extractedText);

        if (cleanedText.length > 500) { // Only use if we got substantial content
          console.log('Successfully extracted content from iframe');
          setFullArticleContent(cleanedText);
          setIsUsingFallbackContent(false);
          return true;
        }
      }
      
      console.warn('Could not find substantial content in iframe');
      return false;
    } catch (err) {
      console.error('Error extracting content from iframe:', err);
      return false;
    }
  }, []);

  // Reset state when article changes
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setIsLoading(false);
      setIsFetchingArticle(false);
      setFullArticleContent(null);
      setError(null);
      setIsUsingFallbackContent(false);
      setIframeError(null);
      
      // Set initial content from RSS feed
      setFullArticleContent(convertHtmlToMarkdown(articleContent));
    }
  }, [isOpen, articleUrl, articleTitle, articleContent]);

  // Handle successful article content fetch
  const handleArticleContentUpdate = useCallback((content: string, isFullContent: boolean) => {
    const markdown = convertHtmlToMarkdown(content);
    setFullArticleContent(markdown);
    setIsUsingFallbackContent(!isFullContent);
    
    // Re-initialize chat with new content if we already have messages
    if (messages.length > 0) {
      const systemMessage = messages.find(m => m.role === 'system');
      const articleMessage = messages.find(m => m.role === 'article');
      
      if (systemMessage && articleMessage) {
        const updatedMessages = messages.map(msg => {
          if (msg.role === 'article') {
            return {
              ...msg,
              content: `Article content:\n\n${markdown}`
            };
          }
          return msg;
        });
        setMessages(updatedMessages);
        saveChatHistory(entryId, updatedMessages);
      }
    }
  }, [messages, entryId]);

  // Handle iframe load with the new content handler
  const handleIframeLoad = useCallback(() => {
    setIsFetchingArticle(true);
    
    // First try to fetch the full article content
    fetchArticleContent(articleUrl).then(article => {
      if (article && article.content.length > articleContent.length * 1.5) {
        console.log('Successfully fetched longer article content');
        handleArticleContentUpdate(article.content, true);
      } else {
        console.log('Fetched content was not substantially longer than RSS content');
        // Try iframe extraction as backup
        if (!extractIframeContent()) {
          console.log('Using RSS preview content');
          handleArticleContentUpdate(articleContent, false);
        }
      }
    }).catch(err => {
      console.error('Failed to fetch article:', err);
      // Try iframe extraction as backup
      if (!extractIframeContent()) {
        console.log('Using RSS preview content');
        handleArticleContentUpdate(articleContent, false);
      }
    }).finally(() => {
      setIsFetchingArticle(false);
    });
  }, [articleUrl, articleContent, extractIframeContent, handleArticleContentUpdate]);

  // Handle iframe error with the new content handler
  const handleIframeError = useCallback(() => {
    setIframeError("This website doesn't allow embedding. You can open it in a new tab instead.");
    // Try direct content fetch immediately
    setIsFetchingArticle(true);
    fetchArticleContent(articleUrl).then(article => {
      if (article && article.content.length > articleContent.length * 1.5) {
        console.log('Successfully fetched longer article content');
        const cleanContent = stripHtml(article.content);
        handleArticleContentUpdate(cleanContent, true);
      } else {
        console.log('Using RSS preview content');
        handleArticleContentUpdate(stripHtml(articleContent), false);
      }
    }).catch(err => {
      console.error('Failed to fetch article:', err);
      handleArticleContentUpdate(stripHtml(articleContent), false);
    }).finally(() => {
      setIsFetchingArticle(false);
    });
  }, [articleUrl, articleContent, handleArticleContentUpdate]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setInput('');
      setIsLoading(false);
      setIsFetchingArticle(false);
      setFullArticleContent(null);
      setActiveModel('');
      setError(null);
      setIsUsingFallbackContent(false);
      setIframeError(null);
    }
  }, [isOpen]);

  // Initialize chat with article content
  const initializeChat = useCallback(async () => {
    if (!fullArticleContent) return;

    try {
      const config = loadOllamaConfig();
      if (!config) {
        throw new Error('Ollama configuration not found');
      }

      setActiveModel(config.chatModel);

      // Check if we already have a chat history
      const history = await getChatHistory(entryId);
      if (history && history.length > 0) {
        setMessages(history);
        return;
      }

      // If no history, initialize with system message and article content
      const systemMessage = `You are a helpful assistant discussing the article titled "${articleTitle}". The article content has been provided for context. Please help answer any questions about the article. Base your responses only on the provided article content.`;
      const formattedArticle = `Article content:\n\n${fullArticleContent}`;

      const initialMessages: ChatMessage[] = [
        {
          role: 'system',
          content: systemMessage,
          timestamp: new Date(),
          id: 'system-' + Math.random().toString(36).substring(7)
        },
        {
          role: 'article',
          content: formattedArticle,
          timestamp: new Date(),
          id: 'article-' + Math.random().toString(36).substring(7)
        }
      ];

      setMessages(initialMessages);
      await saveChatHistory(entryId, initialMessages);

    } catch (err) {
      console.error('Error initializing chat:', err);
      setError('Failed to initialize chat');
    }
  }, [fullArticleContent, articleTitle, entryId]);

  // Initialize chat when article content is ready
  useEffect(() => {
    if (isOpen && fullArticleContent) {
      initializeChat();
    }
  }, [isOpen, fullArticleContent, initializeChat]);

  // Handle escape and delete keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Delete') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen && !isFetchingArticle) {
      inputRef.current?.focus();
    }
  }, [isOpen, isFetchingArticle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: 'user-' + Math.random().toString(36).substring(7),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };
    setInput('');
    inputRef.current?.focus();
    
    // Add user message to the chat
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    await saveChatHistory(entryId, updatedMessages);
    
    setIsLoading(true);
    setError(null);

    try {
      const config = loadOllamaConfig();
      if (!config) {
        throw new Error('Ollama configuration not found');
      }

      // Filter and format messages for Ollama API
      const apiMessages = [
        // Always include system message with article content
        {
          role: 'system',
          content: `You are a helpful assistant discussing the article titled "${articleTitle}". Here is the article content for context:\n\n${fullArticleContent}\n\nPlease help answer questions about this article, using only information from the provided content.`
        },
        // Include chat history excluding system and article messages
        ...updatedMessages
          .filter(msg => msg.role !== 'article' && msg.role !== 'system')
          .map(msg => ({
            role: msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
            content: msg.content
          }))
      ];

      console.log('Sending messages to Ollama:', apiMessages);

      // Send request to Ollama
      const response = await fetch(`${config.serverUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.chatModel,
          messages: apiMessages,
          stream: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ollama API error:', errorText);
        throw new Error(`Failed to get response from Ollama: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream available');

      // Create a new message for streaming response
      const assistantMessage: ChatMessage = {
        id: streamingMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        model: config.chatModel
      };

      // Add empty assistant message to chat
      setMessages(prev => [...prev, assistantMessage]);

      // Process the stream
      let responseText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode and parse the chunk
        const chunk = new TextDecoder().decode(value);
        console.log('Received chunk:', chunk);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            console.log('Processing line:', line);
            const json = JSON.parse(line);
            console.log('Parsed JSON:', json);

            // Handle both old and new Ollama API formats
            const responseContent = json.response || json.message?.content || '';
            if (responseContent) {
              responseText += responseContent;
              // Update the assistant message with new content
              setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage.id === streamingMessageId) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMessage,
                      content: responseText
                    }
                  ];
                }
                return prev;
              });
            }
          } catch (err) {
            console.error('Error parsing stream chunk:', err, 'Line:', line);
          }
        }
      }

      console.log('Final response:', responseText);

      if (!responseText) {
        throw new Error('No response content received from Ollama');
      }

      // Save final chat history
      const finalMessages = await getChatHistory(entryId);
      if (finalMessages) {
        await saveChatHistory(entryId, finalMessages);
        // Notify parent component about the chat update
        onChatUpdate?.();
      }

    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get response');
      
      // Remove the last message if it was an empty assistant message
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.id === streamingMessageId && !lastMessage.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshChat = async () => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setError(null);
    
    // Clear chat history
    await saveChatHistory(entryId, []);
    
    // Re-initialize chat
    await initializeChat();
  };

  if (!isOpen) return null;

  // Style classes for markdown content
  const markdownClass = `prose prose-sm max-w-none 
    ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}
    prose-p:my-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
    prose-pre:bg-gray-800 prose-pre:text-gray-100
    prose-code:text-blue-500 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
    prose-a:text-blue-500 hover:prose-a:text-blue-600
    ${isDarkMode ? 'prose-code:bg-gray-700' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-30" onClick={onClose} />
      <div className={`relative z-50 rounded-lg p-6 w-[95vw] h-[90vh] border-2 shadow-xl flex flex-col
        ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col gap-2">
            <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {articleTitle}
            </h2>
            <div className="flex items-center gap-2">
              {activeModel && (
                <div className={`text-sm px-2 py-1 rounded-full flex items-center gap-1
                  ${isDarkMode ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-800'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                  <span>{activeModel}</span>
                </div>
              )}
              {isUsingFallbackContent ? (
                <div className={`text-sm px-2 py-1 rounded flex items-center gap-1
                  ${isDarkMode ? 'bg-yellow-500/20 text-yellow-200' : 'bg-yellow-100 text-yellow-800'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>RSS preview</span>
                </div>
              ) : (
                <div className={`text-sm px-2 py-1 rounded flex items-center gap-1
                  ${isDarkMode ? 'bg-green-500/20 text-green-200' : 'bg-green-100 text-green-800'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Full article</span>
                </div>
              )}
              <button
                onClick={handleRefreshChat}
                disabled={isLoading || isFetchingArticle}
                className={`p-1.5 rounded-full transition-colors
                  ${isDarkMode 
                    ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                    : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'}
                  ${(isLoading || isFetchingArticle) ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Restart chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode 
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left side - Article iframe */}
          <div className={`flex flex-col rounded-lg overflow-hidden border transition-all duration-300
            ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}
            ${isPreviewCollapsed ? 'w-0' : 'w-1/2'}`}>
            <div className="p-2 bg-gray-100 dark:bg-gray-700 flex items-center justify-between">
              <span className={`text-sm font-medium transition-opacity duration-300 ${isPreviewCollapsed ? 'opacity-0' : 'opacity-100'}`}>
                Article Preview
              </span>
              {!isPreviewCollapsed && (
                <a 
                  href={articleUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 text-sm"
                >
                  Open in New Tab ↗
                </a>
              )}
            </div>
            <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden relative">
              {iframeError ? (
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center transition-opacity duration-300 ${isPreviewCollapsed ? 'opacity-0' : 'opacity-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {iframeError}
                  </p>
                  <a 
                    href={articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                  >
                    Open Article in New Tab
                  </a>
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  src={articleUrl}
                  className={`w-full h-full transition-opacity duration-300 ${isPreviewCollapsed ? 'opacity-0' : 'opacity-100'}`}
                  style={{ maxWidth: '600px', margin: '0 auto' }}
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  sandbox="allow-same-origin allow-scripts"
                />
              )}
            </div>
          </div>

          {/* Toggle button */}
          <button
            onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
            className={`self-center -ml-2 z-10 p-1.5 rounded-full shadow-lg transition-colors
              ${isDarkMode 
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white' 
                : 'bg-white hover:bg-gray-100 text-gray-600 hover:text-gray-900'}
              border ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}
            title={isPreviewCollapsed ? "Show article preview" : "Hide article preview"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d={isPreviewCollapsed 
                  ? "M9 5l7 7-7 7"  // Right arrow
                  : "M15 19l-7-7 7-7" // Left arrow
                }
              />
            </svg>
          </button>

          {/* Right side - Chat */}
          <div className={`flex flex-col min-h-0 transition-all duration-300
            ${isPreviewCollapsed ? 'w-full' : 'w-1/2'}`}>
            <div 
              ref={chatContainerRef}
              className={`flex-1 overflow-y-auto mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'} scroll-smooth`}
            >
              {isFetchingArticle ? (
                <div className="text-center">
                  <span className={`inline-block px-4 py-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    Attempting to fetch full article content...
                  </span>
                </div>
              ) : (
                <div className="flex flex-col min-h-full">
                  <div className="flex-grow">
                    {messages.map((message, index) => (
                      <div 
                        key={message.id || index}
                        className={`mb-4 ${
                          message.role === 'assistant'
                            ? 'bg-blue-500/10 rounded-lg p-4'
                            : message.role === 'user'
                            ? 'bg-gray-500/10 rounded-lg p-4'
                            : ''
                        }`}
                      >
                        {message.role === 'article' ? (
                          <div className="text-sm opacity-75">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              className={markdownClass}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : message.role === 'assistant' || message.role === 'user' ? (
                          <div className={message.role === 'assistant' ? markdownClass : ''}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              className={message.role === 'user' ? 'whitespace-pre-wrap' : markdownClass}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  {error && (
                    <div className={`text-center mb-4 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                      {error}
                    </div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about the article..."
                className={`flex-1 px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-reader-blue
                  ${isDarkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                disabled={isLoading || isFetchingArticle}
              />
              <button
                type="submit"
                disabled={isLoading || isFetchingArticle || !input.trim()}
                className={`px-4 py-2 rounded-lg font-medium transition-colors
                  ${isDarkMode
                    ? 'bg-reader-blue text-white hover:bg-blue-600'
                    : 'bg-reader-blue text-white hover:bg-blue-600'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatModal; 