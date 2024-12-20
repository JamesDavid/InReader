import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { gunService, truncatePublicKey, type SharedItem, verifySharedItem, type FeedEntry } from '../services/gunService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  CheckCircleIcon, 
  XCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SpeakerWaveIcon,
  EnvelopeIcon,
  ShareIcon,
  ChatBubbleLeftEllipsisIcon,
  TrashIcon
} from '@heroicons/react/24/solid';
import ttsService from '../services/ttsService';

interface ContextType {
  isDarkMode: boolean;
  isFocused: boolean;
  showUnreadOnly: boolean;
  onFocusChange: (focused: boolean) => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  selectedEntryId: number | null;
  onSelectedEntryIdChange: (id: number | null) => void;
  onOpenChat: (entry: any) => void;
}

const GunFeedList: React.FC = () => {
  const context = useOutletContext<ContextType>();
  const isDarkMode = context.isDarkMode;
  const { pubKey } = useParams<{ pubKey: string }>();
  const [items, setItems] = useState<(SharedItem & { isVerified?: boolean; isExpanded?: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ pub: string; name: string } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [copiedPubKey, setCopiedPubKey] = useState<string | null>(null);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        setSelectedIndex(prevIndex => {
          const newIndex = e.key === 'j' 
            ? Math.min(prevIndex + 1, items.length - 1)
            : Math.max(prevIndex - 1, 0);
          
          // Scroll the selected item into view
          const element = document.querySelector(`[data-index="${newIndex}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          
          return newIndex;
        });
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        const item = items[selectedIndex];
        toggleExpanded(item.id + '_' + item.sharedAt);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, selectedIndex]);

  useEffect(() => {
    const loadSharedItems = async () => {
      if (!pubKey) return;

      setIsLoading(true);
      setError(null);

      try {
        const [profile, sharedItems] = await Promise.all([
          gunService.getUserProfile(pubKey),
          gunService.getSharedItems(pubKey)
        ]);

        // Verify signatures for all items
        const verifiedItems = await Promise.all(
          (sharedItems as SharedItem[]).map(async (item: SharedItem) => ({
            ...item,
            isVerified: await verifySharedItem(item)
          }))
        );

        setUserProfile(profile as { pub: string; name: string });
        setItems(verifiedItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared items');
      } finally {
        setIsLoading(false);
      }
    };

    loadSharedItems();
  }, [pubKey]);

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleListen = async (item: SharedItem) => {
    await ttsService.addToQueue({
      id: parseInt(item.id),
      title: item.title,
      content_rssAbstract: item.content,
      link: item.link,
      publishDate: new Date(item.publishDate),
      feedTitle: item.feedTitle || '',
      chatHistory: []
    });
  };

  const handleEmail = (item: SharedItem) => {
    const subject = encodeURIComponent(item.title);
    const body = encodeURIComponent(`${item.content}\n\nRead more: ${item.link}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleShare = async (item: SharedItem, withComment: boolean = false) => {
    let comment: string | undefined;
    if (withComment) {
      const promptResult = prompt('Add a comment to share:');
      if (promptResult === null) return; // User cancelled
      comment = promptResult;
    }
    
    try {
      await gunService.shareItem({
        id: parseInt(item.id),
        title: item.title,
        content_fullArticle: item.content,
        content_rssAbstract: item.content,
        content_aiSummary: item.content_aiSummary,
        aiSummaryMetadata: item.aiSummaryMetadata,
        publishDate: new Date(item.publishDate),
        feedTitle: item.feedTitle,
        feedUrl: item.feedUrl,
        link: item.link
      } as FeedEntry, comment);
    } catch (error) {
      console.error('Error sharing item:', error);
    }
  };

  const handleUnshare = async (itemId: string) => {
    if (!confirm('Are you sure you want to unshare this item?')) return;
    
    try {
      await gunService.unshareItem(itemId);
      // Remove the item from the local state
      setItems(prevItems => prevItems.filter(item => item._id !== itemId));
    } catch (error) {
      console.error('Error unsharing item:', error);
    }
  };

  const renderUserName = (pubKey: string, displayName?: string) => {
    if (displayName && displayName !== 'Unknown User') return displayName;
    return truncatePublicKey(pubKey);
  };

  const formatDate = (date: string) => {
    const now = new Date();
    const itemDate = new Date(date);
    const diff = now.getTime() - itemDate.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 7) {
      return itemDate.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'just now';
    }
  };

  const computedMarkdownClass = `prose prose-sm max-w-none 
    ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}
    prose-p:my-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
    prose-pre:bg-gray-800 prose-pre:text-gray-100
    prose-code:text-blue-500 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
    prose-a:text-blue-500 hover:prose-a:text-blue-600
    ${isDarkMode ? 'prose-code:bg-gray-700' : ''}`;

  const handleCopyPubKey = async (pubKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(pubKey);
      setCopiedPubKey(pubKey);
      setTimeout(() => setCopiedPubKey(null), 2000);
    } catch (error) {
      console.error('Failed to copy public key:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${isDarkMode ? 'text-gray-300 bg-gray-900' : 'text-gray-700 bg-white'}`}>
        <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>Loading shared items...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${isDarkMode ? 'text-red-400 bg-gray-900' : 'text-red-600 bg-white'}`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span>{error}</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${isDarkMode ? 'text-gray-300 bg-gray-900' : 'text-gray-700 bg-white'}`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
        </svg>
        <span className="text-lg font-medium">No shared items yet</span>
        <span className="text-sm mt-2">
          {userProfile?.pub === JSON.parse(gunService.getConfig().privateKey).pub
            ? "You haven't shared any items yet"
            : `${renderUserName(userProfile?.pub || '', userProfile?.name)} hasn't shared any items yet`}
        </span>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
      <div className={`sticky top-0 px-4 py-3 border-b z-10 ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        <h2 className={`text-lg font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {userProfile?.pub === JSON.parse(gunService.getConfig().privateKey).pub
            ? "Your Shared Items"
            : `${userProfile?.name}'s Shared Items`}
        </h2>
      </div>
      <div className={`divide-y ${isDarkMode ? 'divide-gray-800' : 'divide-gray-200'}`}>
        {items.map((item, index) => {
          const itemId = `${item.id}_${item.sharedAt}`;
          const isExpanded = expandedItems.has(itemId);
          
          return (
            <article
              key={itemId}
              data-index={index}
              className={`border-b transition-colors ${
                isDarkMode 
                  ? 'border-gray-800 hover:bg-gray-800' 
                  : 'border-gray-100 hover:bg-reader-hover'
              } ${selectedIndex === index ? (isDarkMode ? 'bg-gray-800' : 'bg-reader-hover') : ''}`}
            >
              <div 
                className="flex items-center px-4 py-2 gap-4 cursor-pointer"
                onClick={() => toggleExpanded(itemId)}
              >
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDownIcon className="h-5 w-5 shrink-0" />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5 shrink-0" />
                    )}
                    <h3 className={`text-base font-medium flex-grow min-w-0 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`hover:underline ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-reader-blue'}`}
                        onClick={e => e.stopPropagation()}
                      >
                        {item.title}
                      </a>
                    </h3>
                    {item.isVerified !== undefined && (
                      item.isVerified ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 shrink-0" title="Signature verified" />
                      ) : (
                        <XCircleIcon className="h-5 w-5 text-red-500 shrink-0" title="Invalid signature" />
                      )
                    )}
                  </div>
                  <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Shared by {item.sharedBy?.name || 'Unknown User'} {' '}
                    {item.sharedBy?.pub && (
                      <button
                        onClick={(e) => handleCopyPubKey(item.sharedBy.pub, e)}
                        className={`inline-flex items-center px-2 py-0.5 rounded transition-colors ${
                          isDarkMode 
                            ? 'bg-gray-700 hover:bg-gray-600' 
                            : 'bg-gray-200 hover:bg-gray-300'
                        } ${copiedPubKey === item.sharedBy.pub ? 'text-green-500' : ''}`}
                        title={`Click to copy: ${item.sharedBy.pub}`}
                      >
                        {copiedPubKey === item.sharedBy.pub ? 'Copied!' : truncatePublicKey(item.sharedBy.pub)}
                      </button>
                    )}
                  </div>
                  {item.feedTitle && (
                    <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      From <a 
                        href={item.feedUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`hover:underline ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-reader-blue'}`}
                        onClick={e => e.stopPropagation()}
                      >
                        {item.feedTitle}
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <time
                    dateTime={item.sharedAt}
                    className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    {formatDate(item.sharedAt)}
                  </time>
                </div>
              </div>
              {isExpanded && (
                <div className={`px-4 pb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {item.comment && (
                    <div className={`mb-4 p-3 rounded-lg ${
                      isDarkMode 
                        ? 'bg-gray-800/50 text-gray-300 border border-gray-700' 
                        : 'bg-gray-50 text-gray-700 border border-gray-200'
                    }`}>
                      <p className="text-sm italic">"{item.comment}"</p>
                    </div>
                  )}
                  {item.content_aiSummary && (
                    <div className={`mb-4 p-4 rounded border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                      <div className={`text-sm font-medium mb-2 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span>Summary</span>
                        {item.aiSummaryMetadata?.model && (
                          <>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              isDarkMode ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {item.aiSummaryMetadata.model}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              isDarkMode 
                                ? (item.aiSummaryMetadata.isFullContent ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-200')
                                : (item.aiSummaryMetadata.isFullContent ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')
                            }`}>
                              {item.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'}
                            </span>
                          </>
                        )}
                      </div>
                      <div className={computedMarkdownClass}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {item.content_aiSummary}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  <div className={computedMarkdownClass}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {item.content}
                    </ReactMarkdown>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Originally published {new Date(item.publishDate).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleListen(item)}
                        className={`p-2 rounded-full transition-colors ${
                          isDarkMode 
                            ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-300' 
                            : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                        }`}
                        title="Listen to article"
                      >
                        <SpeakerWaveIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleEmail(item)}
                        className={`p-2 rounded-full transition-colors ${
                          isDarkMode 
                            ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-300' 
                            : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                        }`}
                        title="Email article"
                      >
                        <EnvelopeIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleShare(item)}
                        className={`p-2 rounded-full transition-colors ${
                          isDarkMode 
                            ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-300' 
                            : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                        }`}
                        title="Share article"
                      >
                        <ShareIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleShare(item, true)}
                        className={`p-2 rounded-full transition-colors ${
                          isDarkMode 
                            ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-300' 
                            : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                        }`}
                        title="Share article with comment"
                      >
                        <ChatBubbleLeftEllipsisIcon className="h-5 w-5" />
                      </button>
                      {userProfile?.pub === JSON.parse(gunService.getConfig().privateKey).pub && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item._id) {
                              handleUnshare(item._id);
                            }
                          }}
                          className="p-2 rounded-full transition-colors text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Unshare article"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default GunFeedList; 