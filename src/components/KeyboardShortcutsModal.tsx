import React, { useEffect, useState } from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const shortcuts = [
  {
    category: 'Navigation',
    items: [
      { key: 'j', description: 'Next item' },
      { key: 'k', description: 'Previous item' },
      { key: 'h', description: 'Focus sidebar' },
      { key: 'l', description: 'Focus list / Open chat' },
      { key: 'Shift+P', description: 'Previous page' },
      { key: 'Ctrl+P', description: 'Next page' },
    ],
  },
  {
    category: 'Entry Actions',
    items: [
      { key: 'm', description: 'Toggle read/unread' },
      { key: 'i', description: 'Toggle star' },
      { key: 'o', description: 'Open in new tab' },
      { key: '0', description: 'Open in reused tab' },
      { key: 'l', description: 'Open chat' },
      { key: 'u', description: 'Refresh content & summary' },
      { key: 'Space', description: 'Expand / scroll article' },
      { key: "'", description: 'Copy article' },
      { key: '-', description: 'Email article' },
      { key: '[', description: 'Add to TTS queue' },
    ],
  },
  {
    category: 'TTS Controls',
    items: [
      { key: ']', description: 'Next in queue' },
      { key: '\\', description: 'Play / Pause' },
      { key: 'p', description: 'Go to current article' },
    ],
  },
  {
    category: 'Global',
    items: [
      { key: 'a', description: 'Add feed' },
      { key: '/', description: 'Search' },
      { key: 'r', description: 'Refresh feeds' },
      { key: 'Esc', description: 'Close modal' },
      { key: '?', description: 'This help' },
    ],
  },
];

const gestures = [
  {
    category: 'Swipe Gestures',
    items: [
      { icon: '\u2190', description: 'Swipe Left', detail: 'Mark read & advance' },
      { icon: '\u2192', description: 'Swipe Right', detail: 'Quick actions (Star, Chat, Listen)' },
      { icon: '\u23F3', description: 'Long Press', detail: 'All actions' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { icon: '\uD83D\uDC46', description: 'Tap', detail: 'Select entry' },
      { icon: '\u2716', description: 'Tap outside', detail: 'Close actions' },
    ],
  },
];

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose, isDarkMode }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black bg-opacity-50" />
      <div
        className={`relative rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto ${
          isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-lg font-semibold">{isMobile ? 'Touch Gestures' : 'Keyboard Shortcuts'}</h2>
          <button
            onClick={onClose}
            className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {isMobile ? (
            /* Mobile: Touch gesture instructions */
            gestures.map((group) => (
              <div key={group.category}>
                <h3 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {group.category}
                </h3>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <div key={item.description} className="flex items-center gap-3 py-2">
                      <span className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                      }`}>
                        {item.icon}
                      </span>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {item.description}
                        </div>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {item.detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            /* Desktop: Keyboard shortcuts */
            shortcuts.map((group) => (
              <div key={group.category}>
                <h3 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {group.category}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between py-1">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {item.description}
                      </span>
                      <div className="flex gap-1">
                        {item.key.split(' / ').map((k) => (
                          <kbd
                            key={k}
                            className={`inline-block px-2 py-0.5 text-xs font-mono rounded border ${
                              isDarkMode
                                ? 'bg-gray-700 border-gray-600 text-gray-200'
                                : 'bg-gray-100 border-gray-300 text-gray-800'
                            }`}
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
