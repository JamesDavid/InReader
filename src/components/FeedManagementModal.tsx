import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { PlusIcon, FolderIcon, RssIcon, XMarkIcon, TrashIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, PencilIcon } from '@heroicons/react/24/outline';
import { StrictModeDroppable } from './StrictModeDroppable';
import { importOpml, exportOpml } from '../services/opmlService';
import { getAllFeeds } from '../services/db';

interface Folder {
  id: string;
  name: string;
}

interface Feed {
  id: number;
  title: string;
  folderId: string | null;
  isDeleted: boolean;
}

interface FeedManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  feeds: Feed[];
  isDarkMode: boolean;
  onCreateFolder: (name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onDeleteFeed: (feedId: number) => Promise<void>;
  onUpdateFeedOrder: (updates: { feedId: number; folderId: string | null; order: number }[]) => Promise<void>;
  onUpdateFolderOrder: (updates: { folderId: string; order: number }[]) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onRenameFeed: (feedId: number, newTitle: string) => Promise<void>;
}

// Add this interface to track folder state
interface OrganizationState {
  unorganized: Feed[];
  [key: string]: Feed[];
}

interface DraggableFeedProps {
  feed: Feed;
  index: number;
  isDarkMode: boolean;
  isEditing: boolean;
  editingName: string;
  onStartEdit: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onEditingNameChange: (name: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSave: () => void;
}

const DraggableFeed: React.FC<DraggableFeedProps> = ({
  feed,
  index,
  isDarkMode,
  isEditing,
  editingName,
  onStartEdit,
  onDelete,
  onEditingNameChange,
  onKeyDown,
  onSave,
}) => {
  return (
    <Draggable key={feed.id} draggableId={`feed-${feed.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`flex items-center justify-between p-2 mb-2 rounded shadow-sm
            ${feed.isDeleted ? 'opacity-75 italic' : ''}
            ${snapshot.isDragging
              ? isDarkMode ? 'bg-gray-700' : 'bg-blue-50'
              : isDarkMode ? 'bg-gray-800' : 'bg-white'
            }
            ${isDarkMode ? 'text-white' : 'text-gray-900'}
          `}
        >
          <div className="flex items-center gap-2">
            <RssIcon className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={onSave}
                autoFocus
                className={`px-1 py-0.5 rounded ${
                  isDarkMode
                    ? 'bg-gray-700 text-white border-gray-600'
                    : 'bg-white text-gray-900 border-gray-300'
                } border`}
              />
            ) : (
              <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>
                {feed.title}{feed.isDeleted ? ' (Deleted)' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!feed.isDeleted && (
              <>
                <button
                  onClick={() => onStartEdit(feed.id, feed.title)}
                  className={`p-1 rounded-full ${
                    isDarkMode
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Rename feed"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(feed.id)}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                  title="Delete feed"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
};

interface DraggableFolderProps {
  folder: Folder;
  index: number;
  isDarkMode: boolean;
  isEditing: boolean;
  editingName: string;
  editingItemId: string | null;
  feeds: Feed[];
  onStartEdit: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onEditingNameChange: (name: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSave: () => void;
  onFeedStartEdit: (id: number, name: string) => void;
  onFeedDelete: (id: number) => void;
}

const DraggableFolder: React.FC<DraggableFolderProps> = ({
  folder,
  index,
  isDarkMode,
  isEditing,
  editingName,
  editingItemId,
  feeds,
  onStartEdit,
  onDelete,
  onEditingNameChange,
  onKeyDown,
  onSave,
  onFeedStartEdit,
  onFeedDelete,
}) => {
  return (
    <Draggable key={folder.id} draggableId={`folder-${folder.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`mb-4 ${snapshot.isDragging ? 'z-50' : ''}`}
        >
          <div className={`p-3 rounded transition-colors ${
            snapshot.isDragging
              ? isDarkMode ? 'bg-gray-700 shadow-lg' : 'bg-blue-50 shadow-lg'
              : isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`flex items-center gap-2 text-sm font-medium ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <FolderIcon className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                {isEditing ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => onEditingNameChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={onSave}
                    autoFocus
                    className={`px-1 py-0.5 rounded ${
                      isDarkMode
                        ? 'bg-gray-700 text-white border-gray-600'
                        : 'bg-white text-gray-900 border-gray-300'
                    } border`}
                  />
                ) : (
                  <span>{folder.name}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onStartEdit(folder.id, folder.name)}
                  className={`p-1 rounded-full ${
                    isDarkMode
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Rename folder"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(folder.id)}
                  className="p-1 text-red-500 hover:text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Delete folder"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Feeds within folder */}
            <StrictModeDroppable droppableId={folder.id} type="FEED">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="pl-4"
                >
                  {feeds.map((feed, index) => (
                    <DraggableFeed
                      key={feed.id}
                      feed={feed}
                      index={index}
                      isDarkMode={isDarkMode}
                      isEditing={editingItemId === String(feed.id)}
                      editingName={editingName}
                      onStartEdit={onFeedStartEdit}
                      onDelete={onFeedDelete}
                      onEditingNameChange={onEditingNameChange}
                      onKeyDown={onKeyDown}
                      onSave={onSave}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </StrictModeDroppable>
          </div>
        </div>
      )}
    </Draggable>
  );
};

const FeedManagementModal: React.FC<FeedManagementModalProps> = ({
  isOpen,
  onClose,
  folders,
  feeds,
  isDarkMode,
  onCreateFolder,
  onDeleteFolder,
  onDeleteFeed,
  onUpdateFeedOrder,
  onUpdateFolderOrder,
  onRenameFolder,
  onRenameFeed,
}) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [organizationState, setOrganizationState] = useState<OrganizationState>({
    unorganized: [],
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [orderedFolders, setOrderedFolders] = useState<Folder[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  // Track editing state for Escape handler
  const editingRef = useRef(false);
  editingRef.current = editingItemId !== null;

  // Close on Escape key (unless editing a name)
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingRef.current) return; // Let input handler cancel edit first
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Initialize organization state and folder order
  useEffect(() => {
    // Only update if feeds or folders have actually changed
    const feedsString = JSON.stringify(feeds);
    const foldersString = JSON.stringify(folders);

    if (!isUpdating) {
      // Set up folder order only if it's different
      const newFolderOrder = [...folders];
      if (JSON.stringify(newFolderOrder) !== JSON.stringify(orderedFolders)) {
        setOrderedFolders(newFolderOrder);
      }

      // Set up feed organization
      const newState: OrganizationState = {
        unorganized: feeds
          .filter(feed => !feed.folderId)
          .map(feed => ({
            ...feed,
            id: feed.id,
            draggableId: `feed-${feed.id}`
          })),
      };
      
      folders.forEach(folder => {
        newState[folder.id] = feeds
          .filter(feed => feed.folderId === folder.id)
          .map(feed => ({
            ...feed,
            id: feed.id,
            draggableId: `feed-${feed.id}`
          }));
      });
      
      // Only update if the state has actually changed
      if (JSON.stringify(newState) !== JSON.stringify(organizationState)) {
        setOrganizationState(newState);
      }
    }
  }, [feeds, folders, isUpdating, orderedFolders, organizationState]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      await onCreateFolder(newFolderName.trim());
      setNewFolderName('');
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, type } = result;
    
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setIsUpdating(true);
    try {
      if (type === 'FOLDER') {
        // Handle folder reordering
        const newFolderOrder = Array.from(orderedFolders);
        const [removed] = newFolderOrder.splice(source.index, 1);
        newFolderOrder.splice(destination.index, 0, removed);
        
        setOrderedFolders(newFolderOrder);
        
        const updates = newFolderOrder.map((folder, index) => ({
          folderId: folder.id,
          order: index,
        }));
        
        await onUpdateFolderOrder(updates);
      } else {
        // Handle feed reordering
        const newState = { ...organizationState };
        const [movedFeed] = newState[source.droppableId].splice(source.index, 1);
        newState[destination.droppableId].splice(destination.index, 0, movedFeed);
        
        setOrganizationState(newState);
        
        const updates = Object.entries(newState).flatMap(([folderId, feeds]) =>
          feeds.map((feed, index) => ({
            feedId: feed.id,
            folderId: folderId === 'unorganized' ? null : folderId,
            order: index,
          }))
        );
        
        await onUpdateFeedOrder(updates);
      }
    } catch (error) {
      console.error('Error updating order:', error);
      // Revert state on error
      if (type === 'FOLDER') {
        setOrderedFolders(folders);
      } else {
        const revertState: OrganizationState = {
          unorganized: feeds.filter(feed => !feed.folderId),
        };
        folders.forEach(folder => {
          revertState[folder.id] = feeds.filter(feed => feed.folderId === folder.id);
        });
        setOrganizationState(revertState);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (confirm('Are you sure you want to delete this folder? Feeds in this folder will be moved to Unorganized.')) {
      try {
        await onDeleteFolder(folderId);
      } catch (error) {
        console.error('Error deleting folder:', error);
      }
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const stats = await importOpml(content);
      setImportSuccess(`Successfully imported ${stats.feeds} feeds and ${stats.folders} folders.`);
      setImportError(null);
      // Clear the input so the same file can be selected again
      event.target.value = '';
      // Refresh the feed list
      window.location.reload();
    } catch (error) {
      setImportError('Failed to import OPML file. Please make sure it\'s a valid OPML file.');
      setImportSuccess(null);
      console.error('OPML import error:', error);
    }
  };

  const handleExport = async () => {
    try {
      const opmlContent = await exportOpml();
      const blob = new Blob([opmlContent], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rss-feeds-export.opml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('OPML export error:', error);
    }
  };

  const handleStartEdit = (id: string | number, currentName: string) => {
    setEditingItemId(String(id));
    setEditingName(currentName);
  };

  const handleSaveEdit = async () => {
    if (!editingItemId || !editingName.trim()) return;

    try {
      if (editingItemId.startsWith('folder-')) {
        const folderId = editingItemId.replace('folder-', '');
        await onRenameFolder(folderId, editingName.trim());
      } else {
        const feedId = parseInt(editingItemId, 10);
        await onRenameFeed(feedId, editingName.trim());
      }
    } catch (error) {
      console.error('Error renaming item:', error);
    } finally {
      setEditingItemId(null);
      setEditingName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Manage Feeds
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportClick}
              className={`p-2 rounded flex items-center gap-1 ${
                isDarkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              title="Import OPML"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              <span>Import</span>
            </button>
            <button
              onClick={handleExport}
              className={`p-2 rounded flex items-center gap-1 ${
                isDarkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              title="Export OPML"
            >
              <ArrowUpTrayIcon className="w-5 h-5" />
              <span>Export</span>
            </button>
            <button
              onClick={onClose}
              className={`p-1 rounded ${
                isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".opml,text/xml"
          className="hidden"
        />

        {importError && (
          <div className={`mb-4 p-3 rounded ${isDarkMode ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
            {importError}
          </div>
        )}

        {importSuccess && (
          <div className={`mb-4 p-3 rounded ${isDarkMode ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-600'}`}>
            {importSuccess}
          </div>
        )}

        {/* New Folder Form */}
        <form onSubmit={handleCreateFolder} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name"
              className={`flex-1 px-3 py-2 border rounded ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
            >
              <PlusIcon className="w-5 h-5" />
              <span>Add Folder</span>
            </button>
          </div>
        </form>

        {/* Drag and Drop Area */}
        <div className="flex-1">
          <div className="overflow-y-auto max-h-[60vh]">
            <DragDropContext onDragEnd={handleDragEnd}>
              {/* Folder List */}
              <StrictModeDroppable droppableId="folder-list" type="FOLDER">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`mb-4 ${
                      snapshot.isDraggingOver
                        ? isDarkMode ? 'bg-gray-700/50' : 'bg-blue-50/50'
                        : ''
                    }`}
                  >
                    {orderedFolders.map((folder, index) => (
                      <DraggableFolder
                        key={folder.id}
                        folder={folder}
                        index={index}
                        isDarkMode={isDarkMode}
                        isEditing={editingItemId === `folder-${folder.id}`}
                        editingName={editingName}
                        editingItemId={editingItemId}
                        feeds={organizationState[folder.id] || []}
                        onStartEdit={(id, name) => handleStartEdit(`folder-${id}`, name)}
                        onDelete={handleDeleteFolder}
                        onEditingNameChange={setEditingName}
                        onKeyDown={handleKeyDown}
                        onSave={handleSaveEdit}
                        onFeedStartEdit={handleStartEdit}
                        onFeedDelete={onDeleteFeed}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </StrictModeDroppable>

              {/* Unorganized Feeds */}
              <StrictModeDroppable droppableId="unorganized" type="FEED">
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`mb-4 p-3 rounded transition-colors ${
                      snapshot.isDraggingOver
                        ? isDarkMode ? 'bg-gray-700' : 'bg-blue-50'
                        : isDarkMode ? 'bg-gray-800' : 'bg-white'
                    }`}
                  >
                    <h3 className={`text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Unorganized
                    </h3>
                    {organizationState.unorganized?.map((feed, index) => (
                      <DraggableFeed
                        key={feed.id}
                        feed={feed}
                        index={index}
                        isDarkMode={isDarkMode}
                        isEditing={editingItemId === String(feed.id)}
                        editingName={editingName}
                        onStartEdit={handleStartEdit}
                        onDelete={onDeleteFeed}
                        onEditingNameChange={setEditingName}
                        onKeyDown={handleKeyDown}
                        onSave={handleSaveEdit}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </StrictModeDroppable>
            </DragDropContext>
          </div>
        </div>

        {/* Add toggle for showing deleted feeds */}
        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            id="showDeleted"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className={`rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
          />
          <label 
            htmlFor="showDeleted"
            className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
          >
            Show deleted feeds
          </label>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FeedManagementModal;