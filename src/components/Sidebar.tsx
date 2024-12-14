import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  getAllFeeds, 
  getFolders, 
  deleteSavedSearch, 
  deleteFeed, 
  deleteFolder, 
  getUnreadEntries, 
  updateSearchResultCounts, 
  updateFeedOrder,
  updateFolderOrder,
  updateFeedTitle,
  updateFolderName,
  db,
  type Feed, 
  type Folder, 
  type SavedSearch 
} from '../services/db';
import { refreshFeed } from '../services/feedParser';
import AddFeedModal from './AddFeedModal';
import ttsService from '../services/ttsService';
import SidebarMainItem from './sidebar/SidebarMainItem';
import SidebarSearchItem from './sidebar/SidebarSearchItem';
import SidebarFeedItem from './sidebar/SidebarFeedItem';
import SidebarHeader from './sidebar/SidebarHeader';
import SidebarFeedFolder from './sidebar/SidebarFeedFolder';

interface NavigationItem {
  id?: string | number;
  path: string;
  title: string;
  isFolder?: boolean;
  unreadCount?: number;
  onDelete?: () => Promise<void>;
}

interface SidebarProps {
  className?: string;
  isFocused: boolean;
  onFocusChange: (focused: boolean) => void;
  isDarkMode: boolean;
  onRegisterRefreshFeeds: (callback: () => void) => void;
  searchHistory: SavedSearch[];
  onClearSearchHistory: (searchId?: number) => Promise<void>;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onOpenSearch: () => void;
}

interface FeedItemWithUnread extends Feed {
  order?: number;
}

interface VisibleItem {
  id?: string | number;
  path: string;
  title: string;
  isFolder?: boolean;
  unreadCount?: number;
  onDelete?: () => Promise<void>;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  className = '', 
  isFocused, 
  onFocusChange, 
  isDarkMode,
  onRegisterRefreshFeeds,
  searchHistory,
  onClearSearchHistory,
  selectedIndex,
  onSelectedIndexChange,
  onOpenSearch
}) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [draggedItem, setDraggedItem] = useState<NavigationItem | null>(null);
  const [isAddFeedModalOpen, setIsAddFeedModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshingFeeds, setRefreshingFeeds] = useState<Set<number>>(new Set());
  const [isSearchesCollapsed, setIsSearchesCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isKeyboardNavRef = useRef(false);

  // Create search items from search history
  const searchItems = useMemo(() => 
    searchHistory.map(search => {
      console.log('Raw search data:', {
        query: search.query,
        mostRecentResult: search.mostRecentResult,
        type: search.mostRecentResult ? typeof search.mostRecentResult : 'undefined',
        isDate: search.mostRecentResult instanceof Date
      });
      
      // Ensure we have a valid Date object or null
      let timestamp: Date | null = null;
      if (search.mostRecentResult) {
        try {
          timestamp = new Date(search.mostRecentResult);
          // Verify it's a valid date
          if (isNaN(timestamp.getTime())) {
            console.warn('Invalid date for search:', search.query, search.mostRecentResult);
            timestamp = null;
          }
        } catch (error) {
          console.error('Error converting date:', error);
          timestamp = null;
        }
      }

      console.log('Creating search item for:', search.query, {
        mostRecentResult: search.mostRecentResult,
        resultCount: search.resultCount,
        timestamp,
        isValidDate: timestamp instanceof Date
      });

      return {
        id: search.id,
        path: `/search/${encodeURIComponent(search.query)}`,
        title: search.query,
        hits: search.resultCount,
        timestamp,
        onDelete: async () => {
          await onClearSearchHistory(search.id!);
        }
      };
    }), [searchHistory, onClearSearchHistory]);

  // Add this effect to log search history updates
  useEffect(() => {
    console.log('Search history updated:', searchHistory);
  }, [searchHistory]);

  // Add this effect to update visible items when search history changes
  useEffect(() => {
    if (searchHistory.length > 0 && isSearchesCollapsed) {
      setIsSearchesCollapsed(false);
    }
  }, [searchHistory.length]);

  // Create feed items
  const feedItems = useMemo(() => {
    return feeds.map(feed => ({
      id: feed.id!,
      path: `/feed/${feed.id}`,
      title: feed.title,
      onDelete: () => handleDeleteFeed(feed.id!)
    }));
  }, [feeds]);

  const mainItems = [
    { path: '/', title: 'All Items' },
    { path: '/starred', title: 'Starred' },
    { path: '/listened', title: 'Listened' },
    { path: '/chats', title: 'Chats' }
  ];

  // Add this helper function to calculate visible items (move it up before effects)
  const visibleItems = useMemo<VisibleItem[]>(() => {
    const items: VisibleItem[] = [];
    
    // Add main items
    items.push(...mainItems);
    
    // Add search items if not collapsed
    if (!isSearchesCollapsed && searchItems.length > 0) {
      items.push(...searchItems);
    }
    
    // Add unorganized feeds
    const unorganizedFeeds = feedItems.filter(feed => 
      !feeds.find(f => f.id === feed.id)?.folderId
    );
    items.push(...unorganizedFeeds);
    
    // Add folders and their feeds
    folders.forEach(folder => {
      const folderId = folder.id!.toString();
      items.push({
        id: `folder-${folderId}`,
        path: `/folder/${folderId}`,
        title: folder.name,
        isFolder: true
      });
      
      // If folder is not collapsed, add its feeds
      if (!collapsedFolders.has(folderId)) {
        const folderFeeds = feedItems.filter(feed => 
          feeds.find(f => f.id === feed.id)?.folderId === folder.id
        );
        items.push(...folderFeeds);
      }
    });
    
    return items;
  }, [mainItems, searchItems, feedItems, folders, feeds, isSearchesCollapsed, collapsedFolders]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [feedsData, foldersData] = await Promise.all([
        getAllFeeds(),
        getFolders()
      ]);

      // Sort feeds by order field
      const sortedFeeds = feedsData.sort((a, b) => (a.order || 0) - (b.order || 0));
      setFeeds(sortedFeeds);
      setFolders(foldersData);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setFeeds([]);
      setFolders([]);
      setIsLoading(false);
    }
  }, []);

  // Load feeds and folders on mount and when modals close
  useEffect(() => {
    const initialLoad = async () => {
      try {
        setIsLoading(true);
        const [feedsData, foldersData] = await Promise.all([
          getAllFeeds(),
          getFolders()
        ]);

        // Sort feeds by order field
        const sortedFeeds = feedsData.sort((a, b) => (a.order || 0) - (b.order || 0));
        setFeeds(sortedFeeds);
        setFolders(foldersData);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setFeeds([]);
        setFolders([]);
        setIsLoading(false);
      }
    };

    initialLoad();
  }, []); // Empty dependency array since this is only for initial load

  const handleDeleteFeed = async (id: number) => {
    await deleteFeed(id);
    loadData();
  };

  const handleRefreshCurrentFeed = useCallback(async () => {
    // Check if current selection is a feed
    const currentItem = visibleItems[selectedIndex];
    const feedItem = feedItems.find(item => item.path === currentItem.path);
    if (feedItem && feedItem.id) {
      try {
        const feed = feeds.find(f => f.id === feedItem.id);
        if (feed) {
          console.log('Refreshing feed:', feed.title);
          setRefreshingFeeds(prev => new Set(prev).add(feedItem.id!));
          await refreshFeed(feed);
          await loadData();
          // Update search result counts after refreshing the feed
          await updateSearchResultCounts();
          setRefreshingFeeds(prev => {
            const next = new Set(prev);
            next.delete(feedItem.id!);
            return next;
          });
        }
      } catch (error) {
        console.error('Error refreshing feed:', error);
        setRefreshingFeeds(prev => {
          const next = new Set(prev);
          next.delete(feedItem.id!);
          return next;
        });
      }
    }
  }, [visibleItems, selectedIndex, feedItems, feeds, loadData]);

  const handleRefreshFeeds = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      // Add all feed IDs to refreshing set
      const feedIds = feeds.map(feed => feed.id!);
      setRefreshingFeeds(new Set(feedIds));

      // Refresh feeds concurrently but track individual completion
      await Promise.all(feeds.map(async feed => {
        try {
          await refreshFeed(feed);
          // Remove this feed from refreshing set when it completes
          setRefreshingFeeds(prev => {
            const next = new Set(prev);
            next.delete(feed.id!);
            return next;
          });
        } catch (error) {
          console.error(`Error refreshing feed ${feed.title}:`, error);
          // Still remove from refreshing set even if it fails
          setRefreshingFeeds(prev => {
            const next = new Set(prev);
            next.delete(feed.id!);
            return next;
          });
        }
      }));
      
      // Wait a short moment for entries to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update feeds data and search results
      await Promise.all([
        loadData(),
        updateSearchResultCounts()
      ]);

    } catch (error) {
      console.error('Error refreshing feeds:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [feeds, isRefreshing, loadData]);

  // Register the refresh callback with Layout
  useEffect(() => {
    if (onRegisterRefreshFeeds) {
      onRegisterRefreshFeeds(handleRefreshFeeds);
    }
  }, [onRegisterRefreshFeeds, handleRefreshFeeds]);

  // Keep initial route sync effect
  useEffect(() => {
    if (!isKeyboardNavRef.current) {
      const currentPath = location.pathname;
      const index = visibleItems.findIndex(item => item.path === currentPath);
      if (index !== -1 && index !== selectedIndex) {
        onSelectedIndexChange(index);
      }
    }
  }, [location.pathname, visibleItems, selectedIndex, onSelectedIndexChange]);

  // Navigation effect
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < visibleItems.length) {
      const currentItem = visibleItems[selectedIndex];
      const currentPath = location.pathname;
      
      if (currentItem && currentPath !== currentItem.path) {
        isKeyboardNavRef.current = true;
        if (currentItem.isFolder) {
          navigate(`/folder/${currentItem.id!.toString()}`);
        } else {
          navigate(currentItem.path);
        }
      }
    }
  }, [selectedIndex, visibleItems, navigate, location.pathname]);

  // Keep scroll into view effect
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < visibleItems.length) {
      const selectedElement = document.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement && sidebarRef.current) {
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedIndex, visibleItems.length]);

  const menuItemClass = useCallback((isActive: boolean, isSelected: boolean) => `
    block px-4 py-2 text-sm transition-colors
    ${isActive ? (isDarkMode ? 'bg-gray-700' : 'bg-reader-hover') : ''}
    ${isSelected ? (isDarkMode ? 'ring-2 ring-reader-blue ring-opacity-50' : 'ring-2 ring-reader-blue ring-opacity-50') : ''}
    ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-reader-hover'}
  `, [isDarkMode]);

  const handleQueueRecentUnread = useCallback(async () => {
    try {
      const currentItem = visibleItems[selectedIndex];
      const feedItem = feedItems.find(item => item.path === currentItem.path);
      if (feedItem && feedItem.id) {
        // Get 5 most recent unread items from this feed
        const recentUnread = await getUnreadEntries(feedItem.id);
        recentUnread.sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
        const top5 = recentUnread.slice(0, 5);

        // Add each entry to the TTS queue
        for (const entry of top5) {
          const ttsEntry = {
            ...entry,
            id: entry.id!,
            chatHistory: entry.chatHistory
              ?.filter(msg => msg.role === 'user' || msg.role === 'assistant')
              .map((msg, index) => ({
                id: index,
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
                timestamp: new Date()
              }))
          };
          await ttsService.addToQueue(ttsEntry);
        }
      }
    } catch (error) {
      console.error('Error queueing unread items:', error);
    }
  }, [visibleItems, selectedIndex, feedItems]);

  const handleCreateFolder = async (name: string) => {
    try {
      await db.folders.add({ name });
      await loadData();
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const handleUpdateFeedOrder = async (updates: { feedId: number; folderId: string | null; order: number }[]) => {
    try {
      // Convert string folderId to number or null
      const convertedUpdates = updates.map(update => ({
        ...update,
        folderId: update.folderId ? parseInt(update.folderId) : null
      }));
      
      // Wait for the update to complete
      await updateFeedOrder(convertedUpdates);
      
      // Only reload data after the update is successful
      await loadData();
    } catch (error) {
      console.error('Error updating feed order:', error);
      // Force a reload to ensure UI is in sync with database
      await loadData();
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteFolder(parseInt(folderId));
      await loadData();
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const handleUpdateFolderOrder = async (updates: { folderId: string; order: number }[]) => {
    try {
      const convertedUpdates = updates.map(update => ({
        folderId: parseInt(update.folderId),
        order: update.order
      }));
      
      await updateFolderOrder(convertedUpdates);
      await loadData();
    } catch (error) {
      console.error('Error updating folder order:', error);
    }
  };

  const handleRenameFeed = async (feedId: number, newTitle: string) => {
    try {
      await updateFeedTitle(feedId, newTitle);
      loadData(); // Refresh the feed list
    } catch (error) {
      console.error('Error renaming feed:', error);
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      await updateFolderName(folderId, newName);
      loadData(); // Refresh the folder list
    } catch (error) {
      console.error('Error renaming folder:', error);
    }
  };

  return (
    <div 
      ref={sidebarRef} 
      className={`${className} overflow-y-auto`}
      data-sidebar-items-count={visibleItems.length}
    >
      <nav className={`py-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
        {/* Main Items */}
        {mainItems.map((item, index) => (
          <SidebarMainItem
            key={item.path}
            path={item.path}
            title={item.title}
            isActive={location.pathname === item.path}
            isSelected={selectedIndex === index}
            isDarkMode={isDarkMode}
            index={index}
            onSelect={onSelectedIndexChange}
            onFocusChange={onFocusChange}
          />
        ))}

        {/* Search Items */}
        {searchItems.length > 0 && (
          <>
            <SidebarHeader
              title="Searches"
              isDarkMode={isDarkMode}
              type="searches"
              isCollapsed={isSearchesCollapsed}
              onToggleCollapse={() => setIsSearchesCollapsed(!isSearchesCollapsed)}
              folders={[]}
              feeds={[]}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              onDeleteFeed={handleDeleteFeed}
              onUpdateFeedOrder={handleUpdateFeedOrder}
              onUpdateFolderOrder={handleUpdateFolderOrder}
              onRenameFolder={handleRenameFolder}
              onRenameFeed={handleRenameFeed}
              onOpenSearch={onOpenSearch}
            />
            {!isSearchesCollapsed && searchItems.map((item) => {
              const itemIndex = visibleItems.findIndex(visibleItem => visibleItem.path === item.path);
              return (
                <SidebarSearchItem
                  key={item.path}
                  path={item.path}
                  title={item.title}
                  hits={item.hits}
                  isActive={location.pathname === item.path}
                  isSelected={selectedIndex === itemIndex}
                  isDarkMode={isDarkMode}
                  index={itemIndex}
                  onSelect={onSelectedIndexChange}
                  onFocusChange={onFocusChange}
                  onDelete={item.onDelete}
                  timestamp={item.timestamp}
                />
              );
            })}
          </>
        )}

        {/* Subscriptions */}
        <SidebarHeader
          title="Subscriptions"
          isDarkMode={isDarkMode}
          isLoading={isLoading}
          folders={folders.map(folder => ({
            id: folder.id!.toString(),
            name: folder.name
          }))}
          feeds={feeds.map(feed => ({
            id: feed.id!,
            title: feed.title,
            folderId: feed.folderId?.toString() || null
          }))}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onDeleteFeed={handleDeleteFeed}
          onUpdateFeedOrder={handleUpdateFeedOrder}
          onUpdateFolderOrder={handleUpdateFolderOrder}
          onRenameFolder={handleRenameFolder}
          onRenameFeed={handleRenameFeed}
          buttons={[
            {
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              ),
              onClick: () => setIsAddFeedModalOpen(true),
              title: "Add subscription"
            },
            {
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              ),
              onClick: handleRefreshFeeds,
              disabled: isRefreshing,
              title: "Refresh all feeds"
            }
          ]}
        />

        {/* Feed Items and Folders */}
        {folders.map((folder) => {
          const folderFeeds = feeds.filter(feed => feed.folderId === folder.id);
          
          return folderFeeds.length > 0 ? (
            <SidebarFeedFolder
              key={folder.id}
              id={folder.id!.toString()}
              title={folder.name}
              feeds={folderFeeds.map(feed => ({
                id: feed.id!,
                title: feed.title,
                path: `/feed/${feed.id}`,
                unreadCount: feed.unreadCount,
                isRefreshing: refreshingFeeds.has(feed.id!)
              }))}
              isDarkMode={isDarkMode}
              isLoading={isLoading}
              selectedIndex={selectedIndex}
              visibleItems={visibleItems}
              isCollapsed={collapsedFolders.has(folder.id!.toString())}
              onToggleCollapse={(folderId) => {
                setCollapsedFolders(prev => {
                  const next = new Set(prev);
                  if (next.has(folderId)) {
                    next.delete(folderId);
                  } else {
                    next.add(folderId);
                  }
                  return next;
                });
              }}
              onSelect={onSelectedIndexChange}
              onFocusChange={onFocusChange}
              onDeleteFeed={handleDeleteFeed}
            />
          ) : null;
        })}

        {/* Unorganized Feed Items */}
        {feeds
          .filter(feed => !feed.folderId)
          .map((feed) => {
            const itemIndex = visibleItems.findIndex(item => item.path === `/feed/${feed.id}`);
            return (
              <SidebarFeedItem
                key={feed.id}
                id={feed.id!}
                path={`/feed/${feed.id}`}
                title={feed.title}
                isActive={location.pathname === `/feed/${feed.id}`}
                isSelected={selectedIndex === itemIndex}
                isDarkMode={isDarkMode}
                index={itemIndex}
                isLoading={isLoading}
                isRefreshing={refreshingFeeds.has(feed.id!)}
                onSelect={onSelectedIndexChange}
                onFocusChange={onFocusChange}
                onDelete={() => handleDeleteFeed(feed.id!)}
              />
            );
          })}
      </nav>

      <AddFeedModal
        isOpen={isAddFeedModalOpen}
        onClose={() => setIsAddFeedModalOpen(false)}
        onSuccess={loadData}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default Sidebar; 