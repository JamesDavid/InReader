import { useState, useEffect, useCallback } from 'react';
import {
  getAllFeeds,
  getFolders,
  deleteFeed,
  deleteFolder,
  updateFeedOrder,
  updateFolderOrder,
  updateFeedTitle,
  updateFolderName,
  updateSearchResultCounts,
  db,
  type Feed,
  type Folder,
} from '../services/db';
import { refreshFeeds } from '../services/feedParser';
import { dispatchAppEvent } from '../utils/eventDispatcher';

interface UseSidebarDataOptions {
  onRegisterRefreshFeeds?: (callback: () => void) => void;
}

/**
 * Owns the sidebar's feed/folder data: initial load, refresh-all, and all
 * folder/feed CRUD + reorder operations. Extracted from Sidebar so the component
 * is left with view state (collapse, modals), the visible-item derivation, and
 * navigation.
 */
export function useSidebarData({ onRegisterRefreshFeeds }: UseSidebarDataOptions) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshingFeeds, setRefreshingFeeds] = useState<Set<number>>(new Set());

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

  // Load feeds and folders on mount
  useEffect(() => {
    loadData();
  }, []); // Empty dependency array since this is only for initial load

  const handleDeleteFeed = async (id: number) => {
    await deleteFeed(id);
    loadData();
  };

  const handleRefreshAllFeeds = useCallback(async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    try {
      const allFeeds = await getAllFeeds();

      // Set all feeds as refreshing
      const feedIds = allFeeds.map(feed => feed.id!);
      setRefreshingFeeds(new Set(feedIds));

      // Use parallel refresh for all feeds
      await refreshFeeds(allFeeds);

      // Update UI
      await loadData();

      // Update search counts
      await updateSearchResultCounts();

      // Notify components that all feeds have been refreshed
      dispatchAppEvent('allFeedsRefreshed');
    } catch (error) {
      console.error('Error refreshing all feeds:', error);
    } finally {
      setIsRefreshingAll(false);
      setRefreshingFeeds(new Set());
    }
  }, [isRefreshingAll, loadData]);

  // Register the refresh callback with Layout
  useEffect(() => {
    if (onRegisterRefreshFeeds) {
      onRegisterRefreshFeeds(handleRefreshAllFeeds);
    }
  }, [onRegisterRefreshFeeds, handleRefreshAllFeeds]);

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
      // Only allow reordering non-deleted feeds
      const activeFeeds = await getAllFeeds(false);
      const activeFeedIds = new Set(activeFeeds.map(f => f.id));

      const validUpdates = updates.filter(update =>
        activeFeedIds.has(update.feedId)
      ).map(update => ({
        ...update,
        folderId: update.folderId ? parseInt(update.folderId) : null
      }));

      await updateFeedOrder(validUpdates);
      await loadData();
    } catch (error) {
      console.error('Error updating feed order:', error);
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

  return {
    feeds,
    folders,
    isLoading,
    isRefreshingAll,
    refreshingFeeds,
    loadData,
    handleDeleteFeed,
    handleRefreshAllFeeds,
    handleCreateFolder,
    handleUpdateFeedOrder,
    handleDeleteFolder,
    handleUpdateFolderOrder,
    handleRenameFeed,
    handleRenameFolder,
  };
}
