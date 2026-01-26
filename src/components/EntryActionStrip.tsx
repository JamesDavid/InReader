import React from 'react';

interface EntryActionStripProps {
  isDarkMode: boolean;
  isStarred: boolean;
  onStar: () => void;
  onChat: () => void;
  onListen: () => void;
  onDone: () => void;
}

const EntryActionStrip: React.FC<EntryActionStripProps> = ({
  isDarkMode,
  isStarred,
  onStar,
  onChat,
  onListen,
  onDone,
}) => {
  const handleAction = (action: () => void) => (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    action();
    onDone();
  };

  const baseBtn = 'flex-1 flex flex-col items-center justify-center gap-1 transition-colors';

  return (
    <div className="w-[180px] h-full flex items-stretch flex-shrink-0">
      <button
        onClick={handleAction(onStar)}
        className={`${baseBtn} ${
          isStarred
            ? (isDarkMode ? 'bg-yellow-900/60 text-yellow-300' : 'bg-yellow-100 text-yellow-700')
            : (isDarkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-100 text-yellow-600')
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        <span className="text-xs font-medium">{isStarred ? 'Unstar' : 'Star'}</span>
      </button>
      <button
        onClick={handleAction(onChat)}
        className={`${baseBtn} ${
          isDarkMode ? 'bg-gray-700 text-blue-400' : 'bg-gray-100 text-blue-600'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-medium">Chat</span>
      </button>
      <button
        onClick={handleAction(onListen)}
        className={`${baseBtn} ${
          isDarkMode ? 'bg-gray-700 text-green-400' : 'bg-gray-100 text-green-600'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-medium">Listen</span>
      </button>
    </div>
  );
};

export default EntryActionStrip;
