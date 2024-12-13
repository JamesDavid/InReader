import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db, type ChatMessage } from '../services/db';
import { loadOllamaConfig } from '../services/ollamaService';

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
  const [fullArticleContent, setFullArticleContent] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUsingFullContent, setIsUsingFullContent] = useState(false);
  const [isContentCollapsed, setIsContentCollapsed] = useState(false);

  const markdownClass = `prose prose-sm max-w-none 
    ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}
    prose-p:my-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
    prose-pre:bg-gray-800 prose-pre:text-gray-100
    prose-code:text-blue-500 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
    prose-a:text-blue-500 hover:prose-a:text-blue-600
    ${isDarkMode ? 'prose-code:bg-gray-700' : ''}`;

  // Reset state and load content when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadContent = async () => {
        try {
          const entry = await db.entries.get(entryId);
          if (entry) {
            // Build content in order of preference
            let content = '';
            
            // 1. Full article content if available
            if (entry.content_fullArticle) {
              content = entry.content_fullArticle;
              setIsUsingFullContent(true);
            } 
            // 2. RSS content
            else {
              content = entry.content_rssAbstract;
              setIsUsingFullContent(false);
            }

            // 3. Add AI summary if available
            if (entry.content_aiSummary) {
              content += '\n\n## AI Summary\n' + entry.content_aiSummary;
            }

            setFullArticleContent(content);
          } else {
            setFullArticleContent(articleContent);
            setIsUsingFullContent(false);
          }
        } catch (error) {
          console.error('Error loading content:', error);
          setFullArticleContent(articleContent);
          setIsUsingFullContent(false);
        }
      };

      setMessages([]);
      setInput('');
      setIsLoading(false);
      setError(null);
      loadContent();
    }
  }, [isOpen, entryId, articleContent]);

  // Initialize chat when article content is ready
  useEffect(() => {
    if (isOpen && fullArticleContent) {
      initializeChat();
    }
  }, [isOpen, fullArticleContent]);

  const initializeChat = async () => {
    if (!fullArticleContent) return;

    try {
      const config = loadOllamaConfig();
      if (!config) {
        throw new Error('Ollama configuration not found');
      }

      setActiveModel(config.chatModel);

      // Check if we already have a chat history
      const history = await db.entries.get(entryId);
      if (history?.chatHistory && history.chatHistory.length > 0) {
        setMessages(history.chatHistory);
        return;
      }

      // If no history, initialize with system message and article content
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `You are a helpful assistant discussing the article titled "${articleTitle}". The article content has been provided for context. Please help answer any questions about the article. Base your responses only on the provided article content.`,
        timestamp: new Date(),
        id: 'system-' + Math.random().toString(36).substring(7)
      };

      const articleMessage: ChatMessage = {
        role: 'article',
        content: `Article content:\n\n${fullArticleContent}`,
        timestamp: new Date(),
        id: 'article-' + Math.random().toString(36).substring(7)
      };

      const initialMessages = [systemMessage, articleMessage];
      setMessages(initialMessages);
      await db.entries.update(entryId, { chatHistory: initialMessages });

    } catch (err) {
      console.error('Error initializing chat:', err);
      setError('Failed to initialize chat');
    }
  };

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
    await db.entries.update(entryId, { chatHistory: updatedMessages });
    
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
        throw new Error(`Failed to get response from Ollama: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream available');

      // Create a new message for streaming response
      const assistantMessage: ChatMessage = {
        id: 'assistant-' + Math.random().toString(36).substring(7),
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
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            // Handle both old and new Ollama API formats
            const responseContent = json.response || json.message?.content || '';
            if (responseContent) {
              responseText += responseContent;
              // Update the assistant message with new content
              setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage.role === 'assistant') {
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
            console.error('Error parsing stream chunk:', err);
          }
        }
      }

      // Save final chat history
      const finalMessages = messages.map(msg => 
        msg.role === 'assistant' && msg.content === '' 
          ? { ...msg, content: responseText }
          : msg
      );
      await db.entries.update(entryId, { chatHistory: finalMessages });
      onChatUpdate?.();

    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get response');
      
      // Remove the last message if it was an empty assistant message
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.role === 'assistant' && !lastMessage.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-30" onClick={onClose} />
      <div className={`relative z-50 rounded-lg p-6 w-[95vw] h-[90vh] border-2 shadow-xl flex flex-col
        ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
        {/* Header */}
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
              <div className={`text-sm px-2 py-1 rounded-full flex items-center gap-1
                ${isUsingFullContent 
                  ? (isDarkMode ? 'bg-green-500/20 text-green-200' : 'bg-green-100 text-green-800')
                  : (isDarkMode ? 'bg-yellow-500/20 text-yellow-200' : 'bg-yellow-100 text-yellow-800')}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  {isUsingFullContent ? (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  )}
                </svg>
                <span>{isUsingFullContent ? 'Full Content' : 'RSS Summary'}</span>
              </div>
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

        {/* Main Content Area */}
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Article Content - Left Side */}
          <div className={`flex flex-col transition-all duration-300 relative ${isContentCollapsed ? 'w-0' : 'w-1/2'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'} ${isContentCollapsed ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
                Article Content
              </h3>
              <div className={`absolute ${isContentCollapsed ? '-right-6' : 'right-0'} transition-all duration-300`}>
                <button
                  onClick={() => setIsContentCollapsed(!isContentCollapsed)}
                  className={`p-1.5 rounded-full transition-colors
                    ${isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200 bg-gray-800' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700 bg-white'} 
                    shadow-sm border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}
                  title={isContentCollapsed ? "Show article content" : "Hide article content"}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d={isContentCollapsed 
                        ? "M9 5l7 7-7 7"  // Right arrow when collapsed
                        : "M15 19l-7-7 7-7" // Left arrow when expanded
                      }
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-50'} ${isContentCollapsed ? 'hidden' : ''}`}>
              <div className={`p-4 ${markdownClass}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {fullArticleContent || ''}
                </ReactMarkdown>
              </div>
            </div>
          </div>

          {/* Chat Area - Right Side */}
          <div className={`flex flex-col min-h-0 transition-all duration-300 ${isContentCollapsed ? 'w-full pl-8' : 'w-1/2'}`}>
            {/* Chat Messages */}
            <div 
              ref={chatContainerRef}
              className={`flex-1 overflow-y-auto mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
            >
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
                      {message.role === 'assistant' || message.role === 'user' ? (
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
            </div>

            {/* Chat Input */}
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
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
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