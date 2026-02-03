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
  const [hasNext, setHasNext] = useState(ttsService.hasNext());
  const [hasPrevious, setHasPrevious] = useState(ttsService.hasPrevious());
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Handle iOS Safari bottom toolbar using Visual Viewport API
  useEffect(() => {
    if (!isMobile) return;

    const updateBottomOffset = () => {
      if (window.visualViewport) {
        // Calculate how much the visual viewport is offset from the bottom
        const offsetFromBottom = window.innerHeight - (window.visualViewport.height + window.visualViewport.offsetTop);
        setBottomOffset(Math.max(0, offsetFromBottom));
      }
    };

    updateBottomOffset();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateBottomOffset);
      window.visualViewport.addEventListener('scroll', updateBottomOffset);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateBottomOffset);
        window.visualViewport.removeEventListener('scroll', updateBottomOffset);
      }
    };
  }, [isMobile]);

  useEffect(() => {
    const updateState = () => {
      setQueueLength(ttsService.getQueueLength());
      setCurrentArticle(ttsService.getCurrentArticle());
      setIsPlaying(ttsService.isCurrentlyPlaying());
      setIsPaused(ttsService.isPausedState());
      setCurrentIndex(ttsService.getCurrentIndex());
      setHasNext(ttsService.hasNext());
      setHasPrevious(ttsService.hasPrevious());
    };

    const unsubscribe = ttsService.addListener(updateState);
    return () => { unsubscribe(); };
  }, []);

  // Close expanded view when clicking outside (desktop only)
  useEffect(() => {
    if (!isExpanded || isMobile) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tts-status')) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isExpanded, isMobile]);

  if (!isPlaying && queueLength === 0) {
    return null;
  }

  const controlButtonClass = `p-3 rounded-full transition-colors ${
    isDarkMode
      ? 'hover:bg-gray-700 text-gray-300 hover:text-white active:bg-gray-600'
      : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900 active:bg-gray-300'
  }`;

  const controlButtonClassSmall = `p-2 rounded-full transition-colors ${
    isDarkMode
      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
  }`;

  // Mobile: Bottom mini-player + bottom sheet
  if (isMobile) {
    return (
      <>
        {/* Mini player bar at bottom */}
        <div
          className={`fixed left-0 right-0 z-40 ${
            isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          } border-t shadow-lg`}
          style={{ bottom: bottomOffset }}
        >
          <div className="flex items-center gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {/* Play/Pause button */}
            <button
              onClick={() => ttsService.togglePlayPause()}
              className={`${controlButtonClass} flex-shrink-0`}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Article info - tappable to expand */}
            <button
              onClick={() => setIsExpanded(true)}
              className="flex-grow min-w-0 text-left"
            >
              {currentArticle ? (
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {currentArticle.title}
                  </div>
                  <div className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {currentArticle.source}
                  </div>
                </div>
              ) : (
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {queueLength} item{queueLength !== 1 ? 's' : ''} in queue
                </div>
              )}
            </button>

            {/* Skip button */}
            <button
              onClick={() => ttsService.next()}
              disabled={!hasNext}
              className={`${controlButtonClassSmall} flex-shrink-0 ${!hasNext ? 'opacity-30' : ''}`}
              title="Skip"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
              </svg>
            </button>

            {/* Queue badge / expand button */}
            <button
              onClick={() => setIsExpanded(true)}
              className={`${controlButtonClassSmall} flex-shrink-0 relative`}
              title="View queue"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
              </svg>
              {queueLength > 1 && (
                <span className="absolute -top-1 -right-1 bg-reader-blue text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {queueLength}
                </span>
              )}
            </button>
          </div>

          {/* Playing indicator animation */}
          {isPlaying && !isPaused && (
            <div className="h-0.5 bg-reader-blue/20">
              <div className="h-full bg-reader-blue animate-pulse" style={{ width: '100%' }} />
            </div>
          )}
        </div>

        {/* Bottom sheet overlay */}
        {isExpanded && (
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setIsExpanded(false)}
          >
            {/* Bottom sheet */}
            <div
              className={`absolute bottom-0 left-0 right-0 ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              } rounded-t-2xl max-h-[80vh] flex flex-col safe-area-bottom`}
              onClick={e => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="flex justify-center py-3">
                <div className={`w-10 h-1 rounded-full ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
              </div>

              {/* Now playing section */}
              <div className="px-4 pb-4">
                <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Now Playing
                </div>
                {currentArticle ? (
                  <div>
                    <div className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      {currentArticle.title}
                    </div>
                    <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {currentArticle.source}
                    </div>
                  </div>
                ) : (
                  <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Nothing playing
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex justify-center items-center gap-6 py-4">
                <button
                  onClick={() => ttsService.previous()}
                  disabled={!hasPrevious}
                  className={`${controlButtonClass} ${!hasPrevious ? 'opacity-30' : ''}`}
                  title="Previous"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                  </svg>
                </button>

                <button
                  onClick={() => ttsService.togglePlayPause()}
                  className={`p-4 rounded-full transition-colors ${
                    isDarkMode
                      ? 'bg-reader-blue hover:bg-blue-500 text-white'
                      : 'bg-reader-blue hover:bg-blue-600 text-white'
                  }`}
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => ttsService.next()}
                  disabled={!hasNext}
                  className={`${controlButtonClass} ${!hasNext ? 'opacity-30' : ''}`}
                  title="Next"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
                  </svg>
                </button>
              </div>

              {/* Queue list */}
              {queueLength > 0 && (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-t ${
                    isDarkMode ? 'text-gray-400 border-gray-700' : 'text-gray-500 border-gray-200'
                  }`}>
                    Up Next ({queueLength} item{queueLength !== 1 ? 's' : ''})
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 pb-4">
                    {ttsService.getQueuedArticles().map((article, index) => (
                      <div
                        key={article.id}
                        className={`py-3 border-b last:border-b-0 ${
                          isDarkMode ? 'border-gray-700' : 'border-gray-100'
                        } ${index === currentIndex ? (isDarkMode ? 'bg-gray-700/50' : 'bg-blue-50') : ''}
                        -mx-4 px-4 ${index === currentIndex ? 'rounded' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {index === currentIndex && (
                            <div className="flex-shrink-0">
                              <div className="w-2 h-2 bg-reader-blue rounded-full animate-pulse" />
                            </div>
                          )}
                          <div className="min-w-0 flex-grow">
                            <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                              {article.title}
                            </div>
                            <div className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {article.source}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className={`px-4 py-3 flex gap-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                {isPlaying && (
                  <button
                    onClick={() => {
                      ttsService.stop();
                      setIsExpanded(false);
                    }}
                    className={`flex-1 py-3 rounded-lg text-sm font-medium ${
                      isDarkMode
                        ? 'bg-gray-700 text-gray-300 active:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                    }`}
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={() => {
                    ttsService.clearQueue();
                    setIsExpanded(false);
                  }}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium ${
                    isDarkMode
                      ? 'bg-red-900/80 text-red-100 active:bg-red-800'
                      : 'bg-red-100 text-red-700 active:bg-red-200'
                  }`}
                >
                  Clear Queue
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: Header button + dropdown panel
  const buttonClass = `flex items-center gap-2 p-2 rounded-lg ${
    isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
  }`;

  const statusClass = `fixed z-40 ${
    isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  } border shadow-lg rounded-lg p-3 text-sm right-4 top-16`;

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
          {isPlaying && !isPaused ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-reader-blue" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
          {queueLength > 0 && (
            <span className="absolute -top-1 -right-1 bg-reader-blue text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
              {queueLength}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className={`${statusClass} tts-status-panel min-w-[320px]`} onClick={e => e.stopPropagation()}>
          <div className="mb-3">
            <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Now Playing
            </div>
            {currentArticle ? (
              <div>
                <div className={`font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {currentArticle.title}
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {currentArticle.source}
                </div>
              </div>
            ) : (
              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Nothing playing
              </div>
            )}
          </div>

          <div className="flex justify-center items-center gap-4 my-4">
            <button
              onClick={() => ttsService.previous()}
              disabled={!hasPrevious}
              className={`${controlButtonClassSmall} ${!hasPrevious ? 'opacity-30' : ''}`}
              title="Previous"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
              </svg>
            </button>

            <button
              onClick={() => ttsService.togglePlayPause()}
              className={`p-3 rounded-full transition-colors ${
                isDarkMode
                  ? 'bg-reader-blue hover:bg-blue-500 text-white'
                  : 'bg-reader-blue hover:bg-blue-600 text-white'
              }`}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <button
              onClick={() => ttsService.next()}
              disabled={!hasNext}
              className={`${controlButtonClassSmall} ${!hasNext ? 'opacity-30' : ''}`}
              title="Next"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
              </svg>
            </button>
          </div>

          {queueLength > 0 && (
            <div className={`border-t pt-3 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Queue ({queueLength})
              </div>
              <div className="max-h-48 overflow-y-auto -mx-3 px-3">
                {ttsService.getQueuedArticles().map((article, index) => (
                  <div
                    key={article.id}
                    className={`py-2 flex items-center gap-2 ${
                      index === currentIndex
                        ? isDarkMode
                          ? 'bg-gray-700/50 -mx-2 px-2 rounded'
                          : 'bg-blue-50 -mx-2 px-2 rounded'
                        : ''
                    }`}
                  >
                    {index === currentIndex && (
                      <div className="w-2 h-2 bg-reader-blue rounded-full animate-pulse flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                        {article.title}
                      </div>
                      <div className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {article.source}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`mt-3 pt-3 flex justify-end gap-2 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            {isPlaying && (
              <button
                onClick={() => ttsService.stop()}
                className={`text-sm px-3 py-1.5 rounded ${
                  isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Stop
              </button>
            )}
            <button
              onClick={() => ttsService.clearQueue()}
              className={`text-sm px-3 py-1.5 rounded ${
                isDarkMode
                  ? 'bg-red-900/80 text-red-100 hover:bg-red-800'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              Clear Queue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TTSQueueStatus;
