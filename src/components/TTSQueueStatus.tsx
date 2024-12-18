import React, { useState, useEffect } from 'react';
import ttsService from '../services/ttsService';

interface TTSQueueStatusProps {
  isDarkMode: boolean;
}

const TTSQueueStatus: React.FC<TTSQueueStatusProps> = ({ isDarkMode }) => {
  const [queueLength, setQueueLength] = useState(ttsService.getQueueLength());
  const [currentArticle, setCurrentArticle] = useState(ttsService.getCurrentArticle());
  const [isPlaying, setIsPlaying] = useState(ttsService.isCurrentlyPlaying());
  const [isPaused, setIsPaused] = useState(ttsService.isPausedState());
  const [currentIndex, setCurrentIndex] = useState(ttsService.getCurrentIndex());
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const updateState = () => {
      setQueueLength(ttsService.getQueueLength());
      setCurrentArticle(ttsService.getCurrentArticle());
      setIsPlaying(ttsService.isCurrentlyPlaying());
      setIsPaused(ttsService.isPausedState());
      setCurrentIndex(ttsService.getCurrentIndex());
    };

    const unsubscribe = ttsService.addListener(updateState);
    return () => { unsubscribe(); };
  }, []);

  // Close expanded view when clicking outside
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tts-status')) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isExpanded]);

  if (!isPlaying && queueLength === 0) {
    return null;
  }

  const buttonClass = `flex items-center gap-2 p-2 rounded-lg ${
    isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
  }`;

  const statusClass = `fixed z-40 ${
    isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  } border shadow-lg rounded-lg p-2 text-sm right-4 top-16`;

  const controlButtonClass = `p-1.5 rounded transition-colors ${
    isDarkMode 
      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
  }`;

  return (
    <div className="relative tts-status">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className={`${buttonClass} relative`}
        title={currentArticle ? `Now Playing: ${currentArticle.title} - ${currentArticle.source}` : "TTS Queue Status"}
      >
        {currentArticle && (
          <div className="flex flex-col items-start">
            <div className="text-sm truncate max-w-[200px]">
              {currentArticle.title}
            </div>
            <div className="text-xs text-gray-500 truncate max-w-[200px]">
              {currentArticle.source}
            </div>
          </div>
        )}
        <div className="relative flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
          {queueLength > 0 && (
            <span className="absolute -top-1 -right-1 bg-reader-blue text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
              {queueLength}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className={`${statusClass} tts-status-panel min-w-[300px]`} onClick={e => e.stopPropagation()}>
          <div className="mb-2">
            <div className="font-semibold mb-1">Now Playing:</div>
            {currentArticle ? (
              <div className="text-xs">
                <div className="font-medium">{currentArticle.title}</div>
                <div className="text-gray-500">{currentArticle.source}</div>
              </div>
            ) : (
              <div className="text-gray-500 text-xs">Nothing playing</div>
            )}
          </div>

          <div className="flex justify-center items-center gap-2 my-3">
            <button
              onClick={() => ttsService.previous()}
              disabled={currentIndex <= 0}
              className={`${controlButtonClass} ${currentIndex <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Previous"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </button>

            <button
              onClick={() => ttsService.togglePlayPause()}
              className={controlButtonClass}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <button
              onClick={() => ttsService.next()}
              disabled={currentIndex >= queueLength - 1}
              className={`${controlButtonClass} ${currentIndex >= queueLength - 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Next"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
              </svg>
            </button>
          </div>

          {queueLength > 0 && (
            <div>
              <div className="font-semibold mb-1">Queue:</div>
              <div className="max-h-48 overflow-y-auto">
                {ttsService.getQueuedArticles().map((article, index) => (
                  <div 
                    key={article.id} 
                    className={`text-xs mb-2 p-1 rounded ${
                      index === currentIndex 
                        ? isDarkMode 
                          ? 'bg-gray-700' 
                          : 'bg-gray-100'
                        : ''
                    }`}
                  >
                    <div className="font-medium">{article.title}</div>
                    <div className="text-gray-500">{article.source}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            {isPlaying && (
              <button
                onClick={() => ttsService.stop()}
                className={`text-xs px-2 py-1 rounded ${
                  isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Stop
              </button>
            )}
            {queueLength > 0 && (
              <button
                onClick={() => ttsService.clearQueue()}
                className={`text-xs px-2 py-1 rounded ${
                  isDarkMode
                    ? 'bg-red-900/80 text-red-100 hover:bg-red-800'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                Clear Queue
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TTSQueueStatus; 