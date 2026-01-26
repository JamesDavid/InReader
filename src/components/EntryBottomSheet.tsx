import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { type FeedEntryWithTitle } from '../services/db';
import { gunService } from '../services/gunService';

interface EntryBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  entry: FeedEntryWithTitle;
  onMarkAsRead: (entryId: number, isRead?: boolean) => void;
  onToggleStar: (entryId: number) => void;
  onOpenChat: () => void;
  onListen: () => void;
  onCopy: () => void;
  onEmail: () => void;
  onRefresh: () => void;
  onOpenInBrowser: () => void;
}

const EntryBottomSheet: React.FC<EntryBottomSheetProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  entry,
  onMarkAsRead,
  onToggleStar,
  onOpenChat,
  onListen,
  onCopy,
  onEmail,
  onRefresh,
  onOpenInBrowser,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isGunAuthenticated, setIsGunAuthenticated] = useState(false);

  useEffect(() => {
    setIsGunAuthenticated(gunService.isAuthenticated());
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Delay to trigger slide-up animation
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const handleAction = (action: () => void) => () => {
    action();
    handleClose();
  };

  const handleShare = async () => {
    try {
      await gunService.shareItem(entry);
      window.dispatchEvent(new CustomEvent('showToast', {
        detail: { message: 'Article shared successfully', type: 'success' }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('showToast', {
        detail: { message: 'Failed to share article', type: 'error' }
      }));
    }
    handleClose();
  };

  if (!isOpen) return null;

  const bgClass = isDarkMode ? 'bg-gray-800' : 'bg-white';
  const textClass = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const subtextClass = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const hoverClass = isDarkMode ? 'active:bg-gray-700' : 'active:bg-gray-100';
  const borderClass = isDarkMode ? 'border-gray-700' : 'border-gray-200';

  const actions = [
    {
      label: entry.isRead ? 'Mark as unread' : 'Mark as read',
      icon: entry.isRead ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ),
      action: handleAction(() => onMarkAsRead(entry.id!, !entry.isRead)),
    },
    {
      label: entry.isStarred ? 'Remove star' : 'Add star',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${entry.isStarred ? 'text-yellow-500' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ),
      action: handleAction(() => onToggleStar(entry.id!)),
    },
    {
      label: 'Open chat',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
      ),
      action: handleAction(onOpenChat),
    },
    {
      label: 'Listen',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
        </svg>
      ),
      action: handleAction(onListen),
    },
    {
      label: 'Copy article',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
        </svg>
      ),
      action: handleAction(onCopy),
    },
    {
      label: 'Email article',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
        </svg>
      ),
      action: handleAction(onEmail),
    },
    ...(isGunAuthenticated ? [{
      label: 'Share',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
      ),
      action: handleShare,
    }] : []),
    {
      label: 'Refresh content',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
      ),
      action: handleAction(onRefresh),
    },
    {
      label: 'Open in browser',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
        </svg>
      ),
      action: handleAction(onOpenInBrowser),
    },
  ];

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black transition-opacity duration-300 ${
          isVisible ? 'bg-opacity-50' : 'bg-opacity-0'
        }`}
        onClick={handleClose}
      />
      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-xl transition-transform duration-300 ${bgClass} ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '70vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className={`w-10 h-1 rounded-full ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
        </div>

        {/* Entry title */}
        <div className={`px-6 pb-3 border-b ${borderClass}`}>
          <h3 className={`text-base font-semibold ${textClass} line-clamp-2`}>
            {entry.title}
          </h3>
          <p className={`text-sm mt-1 ${subtextClass}`}>{entry.feedTitle}</p>
        </div>

        {/* Actions list */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 120px)' }}>
          {actions.map((item, idx) => (
            <button
              key={idx}
              onClick={item.action}
              className={`w-full flex items-center gap-4 px-6 py-4 ${hoverClass} ${textClass} transition-colors`}
            >
              <span className={subtextClass}>{item.icon}</span>
              <span className="text-base">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Cancel button */}
        <div className={`border-t ${borderClass} p-3`}>
          <button
            onClick={handleClose}
            className={`w-full py-3 rounded-lg text-base font-medium ${
              isDarkMode ? 'bg-gray-700 text-gray-200 active:bg-gray-600' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
            } transition-colors`}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(sheet, document.body);
};

export default EntryBottomSheet;
