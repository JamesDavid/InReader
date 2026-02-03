import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { gunService, truncatePublicKey, type SharedFeedList, type SharedFeed } from '../services/gunService';
import { addFeed, getAllFeeds } from '../services/db';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SharedItem {
  id: string;
  title: string;
  content: string;
  link: string;
  publishDate: string;
  sharedAt: string;
  comment?: string;
  sharedBy: {
    pub: string;
    name: string;
  };
}

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

type TabType = 'items' | 'feeds';

const GunFeedList: React.FC = () => {
  const context = useOutletContext<ContextType>();
  const isDarkMode = context.isDarkMode;
  const { pubKey } = useParams<{ pubKey: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('items');
  const [items, setItems] = useState<SharedItem[]>([]);
  const [sharedFeedList, setSharedFeedList] = useState<SharedFeedList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ pub: string; name: string } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>(
    gunService.getConnectionStatus()
  );
  const [subscribedUrls, setSubscribedUrls] = useState<Set<string>>(new Set());
  const [subscribingUrl, setSubscribingUrl] = useState<string | null>(null);

  // Subscribe to connection status changes
  useEffect(() => {
    const cleanup = gunService.onConnectionStatusChange(setConnectionStatus);
    return cleanup;
  }, []);

  // Load existing feed URLs to know which are already subscribed
  useEffect(() => {
    const loadExistingFeeds = async () => {
      try {
        const feeds = await getAllFeeds();
        setSubscribedUrls(new Set(feeds.map(f => f.url)));
      } catch (err) {
        console.error('Failed to load existing feeds:', err);
      }
    };
    loadExistingFeeds();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!pubKey) return;

      setIsLoading(true);
      setError(null);

      try {
        const [profile, sharedItems, feedList] = await Promise.all([
          gunService.getUserProfile(pubKey),
          gunService.getSharedItems(pubKey),
          gunService.getSharedFeedList(pubKey)
        ]);

        setUserProfile(profile as { pub: string; name: string });
        setItems(sharedItems as SharedItem[]);
        setSharedFeedList(feedList);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setError(errorMessage);
        if (!userProfile) {
          setUserProfile({ pub: pubKey, name: 'Unknown User' });
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [pubKey]);

  const handleRetry = () => {
    if (pubKey) {
      setError(null);
      setIsLoading(true);
      Promise.all([
        gunService.getSharedItems(pubKey),
        gunService.getSharedFeedList(pubKey)
      ])
        .then(([sharedItems, feedList]) => {
          setItems(sharedItems as SharedItem[]);
          setSharedFeedList(feedList);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  };

  const handleSubscribeToFeed = async (feed: SharedFeed) => {
    setSubscribingUrl(feed.url);
    try {
      await addFeed(feed.url, feed.title);
      setSubscribedUrls(prev => new Set([...prev, feed.url]));
    } catch (err) {
      console.error('Failed to subscribe to feed:', err);
      alert(err instanceof Error ? err.message : 'Failed to subscribe to feed');
    } finally {
      setSubscribingUrl(null);
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

  const isCurrentUser = userProfile?.pub === gunService.getCurrentUserPubKey();
  const userName = renderUserName(userProfile?.pub || '', userProfile?.name);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${isDarkMode ? 'text-gray-300 bg-gray-900' : 'text-gray-700 bg-white'}`}>
        <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${isDarkMode ? 'text-red-400 bg-gray-900' : 'text-red-600 bg-white'}`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-lg font-medium mb-2">{error}</span>
        <div className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Connection status: {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </div>
        <button
          onClick={handleRetry}
          className={`px-4 py-2 rounded-lg transition-colors ${
            isDarkMode
              ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Retry
        </button>
      </div>
    );
  }

  const renderEmptyState = () => {
    if (activeTab === 'items') {
      return (
        <div className={`flex flex-col items-center justify-center py-16 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
          </svg>
          <span className="text-lg font-medium">No shared items</span>
          <span className="text-sm mt-2">
            {isCurrentUser
              ? "You haven't shared any articles yet"
              : `${userName} hasn't shared any articles yet`}
          </span>
        </div>
      );
    } else {
      return (
        <div className={`flex flex-col items-center justify-center py-16 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 3a1 1 0 000 2c5.523 0 10 4.477 10 10a1 1 0 102 0C17 8.373 11.627 3 5 3z" />
            <path d="M4 9a1 1 0 011-1 7 7 0 017 7 1 1 0 11-2 0 5 5 0 00-5-5 1 1 0 01-1-1zM3 15a2 2 0 114 0 2 2 0 01-4 0z" />
          </svg>
          <span className="text-lg font-medium">No shared feeds</span>
          <span className="text-sm mt-2">
            {isCurrentUser
              ? "Enable 'Share my feed subscriptions' in Gun settings to share your feeds"
              : `${userName} hasn't shared their feed subscriptions`}
          </span>
        </div>
      );
    }
  };

  const renderSharedItems = () => {
    if (items.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className={`divide-y ${isDarkMode ? 'divide-gray-800' : 'divide-gray-200'}`}>
        {items.map((item, index) => (
          <article
            key={`${item.id}_${item.sharedAt}`}
            data-index={index}
            className={`border-b transition-colors ${isDarkMode ? 'border-gray-800 hover:bg-gray-800' : 'border-gray-100 hover:bg-reader-hover'}`}
          >
            <div className="flex items-center px-4 py-2 gap-4">
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`text-base font-medium flex-grow min-w-0 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`hover:underline ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-reader-blue'}`}
                    >
                      {item.title}
                    </a>
                  </h3>
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Shared by {renderUserName(item.sharedBy.pub, item.sharedBy.name)}
                </div>
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
              <div className={computedMarkdownClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {item.content}
                </ReactMarkdown>
              </div>
              <div className={`mt-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Originally published {new Date(item.publishDate).toLocaleDateString()}
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  const renderSharedFeeds = () => {
    if (!sharedFeedList || sharedFeedList.feeds.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className={`divide-y ${isDarkMode ? 'divide-gray-800' : 'divide-gray-200'}`}>
        {sharedFeedList.feeds.map((feed) => {
          const isSubscribed = subscribedUrls.has(feed.url);
          const isSubscribing = subscribingUrl === feed.url;

          return (
            <div
              key={feed.url}
              className={`px-4 py-3 flex items-center gap-4 ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-reader-hover'}`}
            >
              <div className="flex-grow min-w-0">
                <h3 className={`text-base font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {feed.title}
                </h3>
                {feed.description && (
                  <p className={`text-sm mt-1 line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {feed.description}
                  </p>
                )}
                <p className={`text-xs mt-1 font-mono truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {feed.url}
                </p>
              </div>
              <div className="shrink-0">
                {isSubscribed ? (
                  <span className={`px-3 py-1.5 rounded text-sm ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                    Subscribed
                  </span>
                ) : (
                  <button
                    onClick={() => handleSubscribeToFeed(feed)}
                    disabled={isSubscribing}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isDarkMode
                        ? 'bg-reader-blue text-white hover:bg-blue-600'
                        : 'bg-reader-blue text-white hover:bg-blue-600'
                    } ${isSubscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSubscribing ? 'Adding...' : 'Subscribe'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Last updated: {new Date(sharedFeedList.updatedAt).toLocaleString()}
        </div>
      </div>
    );
  };

  return (
    <div className={`h-full overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Header with tabs */}
      <div className={`sticky top-0 z-10 ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        <div className="px-4 py-3 border-b border-inherit">
          <h2 className={`text-lg font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            {isCurrentUser ? "Your Shared Content" : `${userName}'s Shared Content`}
          </h2>
        </div>
        <div className="flex border-b border-inherit">
          <button
            onClick={() => setActiveTab('items')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'items'
                ? `border-reader-blue ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`
                : `border-transparent ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            Shared Items ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('feeds')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'feeds'
                ? `border-reader-blue ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`
                : `border-transparent ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            Feed Subscriptions ({sharedFeedList?.feeds.length || 0})
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'items' ? renderSharedItems() : renderSharedFeeds()}
    </div>
  );
};

export default GunFeedList;
