import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { PlusIcon, FolderIcon, RssIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { StrictModeDroppable } from './StrictModeDroppable';

interface Folder {
  id: string;
  name: string;
}

interface Feed {
  id: number;
  title: string;
  folderId: string | null;
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
}

// Add this interface to track folder state
interface OrganizationState {
  unorganized: Feed[];
  [key: string]: Feed[];
}

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
}) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [organizationState, setOrganizationState] = useState<OrganizationState>({
    unorganized: [],
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [orderedFolders, setOrderedFolders] = useState<Folder[]>([]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Manage Feeds
          </h2>
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
                      <Draggable
                        key={`folder-${folder.id}`}
                        draggableId={`folder-${folder.id}`}
                        index={index}
                      >
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
                                  {folder.name}
                                </div>
                                <button
                                  onClick={() => handleDeleteFolder(folder.id)}
                                  className="p-1 text-red-500 hover:text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                                  title="Delete folder"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Feeds within folder */}
                              <StrictModeDroppable droppableId={folder.id} type="FEED">
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className="pl-4"
                                  >
                                    {organizationState[folder.id]?.map((feed, index) => (
                                      <Draggable
                                        key={feed.id}
                                        draggableId={`feed-${feed.id}`}
                                        index={index}
                                      >
                                        {(provided, snapshot) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            className={`flex items-center justify-between p-2 mb-2 rounded shadow-sm
                                              ${snapshot.isDragging
                                                ? isDarkMode ? 'bg-gray-700' : 'bg-blue-50'
                                                : isDarkMode ? 'bg-gray-800' : 'bg-white'
                                              }
                                              ${isDarkMode ? 'text-white' : 'text-gray-900'}
                                            `}
                                          >
                                            <div className="flex items-center gap-2">
                                              <RssIcon className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                                              <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{feed.title}</span>
                                            </div>
                                            <button
                                              onClick={() => onDeleteFeed(feed.id)}
                                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                                            >
                                              <XMarkIcon className="w-4 h-4" />
                                            </button>
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                    {provided.placeholder}
                                  </div>
                                )}
                              </StrictModeDroppable>
                            </div>
                          </div>
                        )}
                      </Draggable>
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
                      <Draggable key={feed.id} draggableId={`feed-${feed.id}`} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`flex items-center justify-between p-2 mb-2 rounded shadow-sm
                              ${snapshot.isDragging
                                ? isDarkMode ? 'bg-gray-700' : 'bg-blue-50'
                                : isDarkMode ? 'bg-gray-800' : 'bg-white'
                              }
                              ${isDarkMode ? 'text-white' : 'text-gray-900'}
                            `}
                          >
                            <div className="flex items-center gap-2">
                              <RssIcon className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                              <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{feed.title}</span>
                            </div>
                            <button
                              onClick={() => onDeleteFeed(feed.id)}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </StrictModeDroppable>
            </DragDropContext>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedManagementModal; 