import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { testConnection, getAvailableModels, saveOllamaConfig, loadOllamaConfig, type OllamaConfig } from '../services/ollamaService';
import { clearAllAISummaries } from '../services/db';
import { getQueueStats, clearQueue, initializeQueue } from '../services/requestQueueService';

interface OllamaConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const defaultSystemPrompts = {
  summary: "You are a helpful AI assistant that summarizes RSS feed content. Be concise and focus on the key points.",
  chat: "You are a helpful AI assistant that discusses RSS feed content with users. Be informative and engaging.",
  historyAnalyzer: "You are an AI that analyzes user's reading history to understand their interests and preferences.",
  itemRecommender: "You are an AI that recommends articles based on user's reading history and interests."
};

const OllamaConfigModal: React.FC<OllamaConfigModalProps> = ({ isOpen, onClose, isDarkMode }) => {
  // Server and connection states
  const [serverUrl, setServerUrl] = useState('http://localhost:11434');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ name: string }[]>([]);
  
  // Model states
  const [summaryModel, setSummaryModel] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [historyAnalyzerModel, setHistoryAnalyzerModel] = useState('');
  const [itemRecommenderModel, setItemRecommenderModel] = useState('');
  
  // Prompt states
  const [summarySystemPrompt, setSummarySystemPrompt] = useState(defaultSystemPrompts.summary);
  const [chatSystemPrompt, setChatSystemPrompt] = useState(defaultSystemPrompts.chat);
  const [historyAnalyzerPrompt, setHistoryAnalyzerPrompt] = useState(defaultSystemPrompts.historyAnalyzer);
  const [itemRecommenderPrompt, setItemRecommenderPrompt] = useState(defaultSystemPrompts.itemRecommender);
  
  // Queue states
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState(2);
  const [isClearing, setIsClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState({ size: 0, pending: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const config = loadOllamaConfig();
    if (config) {
      setServerUrl(config.serverUrl);
      setSummaryModel(config.summaryModel);
      setChatModel(config.chatModel);
      setSummarySystemPrompt(config.summarySystemPrompt || defaultSystemPrompts.summary);
      setChatSystemPrompt(config.chatSystemPrompt || defaultSystemPrompts.chat);
      setMaxConcurrentRequests(config.maxConcurrentRequests || 2);
      // Initialize queue with saved concurrency
      initializeQueue(config.maxConcurrentRequests || 2);
      // Test connection on load if we have a saved config
      handleTestConnection(config.serverUrl, config.summaryModel, config.chatModel);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const refreshStats = () => {
        const stats = getQueueStats();
        console.log('Refreshing queue stats:', stats);
        setQueueStats(stats);
      };

      // Initial refresh
      refreshStats();

      // Refresh every 2 seconds while modal is open
      const interval = setInterval(refreshStats, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleTestConnection = async (url: string, currentSummaryModel?: string, currentChatModel?: string) => {
    setIsConnecting(true);
    const connected = await testConnection(url);
    setIsConnected(connected);
    setIsConnecting(false);

    if (connected) {
      const models = await getAvailableModels(url);
      setAvailableModels(models);
      
      const modelNames = models.map(m => m.name);
      
      // Preserve current model selections if they're still available
      if (currentSummaryModel && modelNames.includes(currentSummaryModel)) {
        setSummaryModel(currentSummaryModel);
      } else if (models.length > 0) {
        setSummaryModel(models[0].name);
      }

      if (currentChatModel && modelNames.includes(currentChatModel)) {
        setChatModel(currentChatModel);
      } else if (models.length > 0) {
        setChatModel(models[0].name);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      handleTestConnection(serverUrl, summaryModel, chatModel);
      return;
    }

    const config: OllamaConfig = {
      serverUrl,
      summaryModel,
      chatModel,
      summarySystemPrompt,
      chatSystemPrompt,
      maxConcurrentRequests
    };
    saveOllamaConfig(config);
    onClose();
  };

  const handleClearSummaries = async () => {
    setIsClearing(true);
    setClearMessage(null);
    try {
      const clearedCount = await clearAllAISummaries();
      setClearMessage(`Successfully cleared ${clearedCount} summaries. They will be regenerated with new settings.`);
    } catch (error) {
      console.error('Failed to clear summaries:', error);
      setClearMessage('Failed to clear summaries');
    } finally {
      setIsClearing(false);
    }
  };

  const handleRefreshStats = () => {
    setIsRefreshing(true);
    const stats = getQueueStats();
    console.log('Manually refreshing queue stats:', stats);
    setQueueStats(stats);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleClearQueue = () => {
    clearQueue();
    setQueueStats(getQueueStats());
  };

  const inputClass = `w-full px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-reader-blue
    ${isDarkMode 
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`;

  const labelClass = `block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;

  const tabClass = `w-full py-2.5 text-sm font-medium leading-5 rounded-lg
    focus:outline-none focus:ring-2 ring-offset-2 ring-offset-reader-blue ring-white ring-opacity-60
    ${isDarkMode 
      ? 'text-gray-300 hover:bg-gray-700' 
      : 'text-gray-700 hover:bg-gray-100'}`;

  const selectedTabClass = `${tabClass} ${isDarkMode 
    ? 'bg-gray-700 text-white' 
    : 'bg-white shadow text-reader-blue'}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-30" onClick={onClose} />
      <div className={`relative z-50 rounded-lg p-6 w-full max-w-2xl border-2 shadow-xl overflow-y-auto max-h-[90vh]
        ${isDarkMode 
          ? 'bg-gray-800 border-gray-600' 
          : 'bg-white border-gray-200'}`}>
        <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          Ollama Configuration
        </h2>
        
        <form onSubmit={handleSubmit}>
          {/* Server Configuration - Always visible */}
          <div className="mb-4">
            <label htmlFor="serverUrl" className={labelClass}>
              Server URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                id="serverUrl"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className={inputClass}
                placeholder="http://localhost:11434"
                required
              />
              <button
                type="button"
                onClick={() => handleTestConnection(serverUrl)}
                className="btn btn-blue whitespace-nowrap"
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : (isConnected ? 'Reconnect' : 'Connect')}
              </button>
            </div>
          </div>

          {isConnected && (
            <Tab.Group>
              <Tab.List className="flex space-x-1 rounded-xl bg-gray-900/20 p-1">
                <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                  Summarizer
                </Tab>
                <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                  Chat
                </Tab>
                <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                  Recommendations
                </Tab>
                <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                  Queue
                </Tab>
              </Tab.List>

              <Tab.Panels className="mt-4">
                {/* Summarizer Configuration */}
                <Tab.Panel>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="summaryModel" className={labelClass}>
                        Summarization Model
                      </label>
                      <select
                        id="summaryModel"
                        value={summaryModel}
                        onChange={(e) => setSummaryModel(e.target.value)}
                        className={inputClass}
                        required
                      >
                        {availableModels.map(model => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="summarySystemPrompt" className={labelClass}>
                        Summary System Prompt
                      </label>
                      <textarea
                        id="summarySystemPrompt"
                        value={summarySystemPrompt}
                        onChange={(e) => setSummarySystemPrompt(e.target.value)}
                        className={`${inputClass} h-24 resize-none`}
                        placeholder="Customize the system prompt for summarization..."
                        required
                      />
                    </div>
                  </div>
                </Tab.Panel>

                {/* Chat Configuration */}
                <Tab.Panel>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="chatModel" className={labelClass}>
                        Chat Model
                      </label>
                      <select
                        id="chatModel"
                        value={chatModel}
                        onChange={(e) => setChatModel(e.target.value)}
                        className={inputClass}
                        required
                      >
                        {availableModels.map(model => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="chatSystemPrompt" className={labelClass}>
                        Chat System Prompt
                      </label>
                      <textarea
                        id="chatSystemPrompt"
                        value={chatSystemPrompt}
                        onChange={(e) => setChatSystemPrompt(e.target.value)}
                        className={`${inputClass} h-24 resize-none`}
                        placeholder="Customize the system prompt for chat..."
                        required
                      />
                    </div>
                  </div>
                </Tab.Panel>

                {/* Recommendations Configuration */}
                <Tab.Panel>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="historyAnalyzerModel" className={labelClass}>
                        History Analyzer Model
                      </label>
                      <select
                        id="historyAnalyzerModel"
                        value={historyAnalyzerModel}
                        onChange={(e) => setHistoryAnalyzerModel(e.target.value)}
                        className={inputClass}
                        required
                      >
                        {availableModels.map(model => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="historyAnalyzerPrompt" className={labelClass}>
                        History Analyzer Prompt
                      </label>
                      <textarea
                        id="historyAnalyzerPrompt"
                        value={historyAnalyzerPrompt}
                        onChange={(e) => setHistoryAnalyzerPrompt(e.target.value)}
                        className={`${inputClass} h-24 resize-none`}
                        placeholder="Customize the system prompt for history analysis..."
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="itemRecommenderModel" className={labelClass}>
                        Item Recommender Model
                      </label>
                      <select
                        id="itemRecommenderModel"
                        value={itemRecommenderModel}
                        onChange={(e) => setItemRecommenderModel(e.target.value)}
                        className={inputClass}
                        required
                      >
                        {availableModels.map(model => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="itemRecommenderPrompt" className={labelClass}>
                        Item Recommender Prompt
                      </label>
                      <textarea
                        id="itemRecommenderPrompt"
                        value={itemRecommenderPrompt}
                        onChange={(e) => setItemRecommenderPrompt(e.target.value)}
                        className={`${inputClass} h-24 resize-none`}
                        placeholder="Customize the system prompt for item recommendations..."
                        required
                      />
                    </div>
                  </div>
                </Tab.Panel>

                {/* Queue Configuration */}
                <Tab.Panel>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="maxConcurrentRequests" className={labelClass}>
                        Max Concurrent Requests
                      </label>
                      <input
                        type="number"
                        id="maxConcurrentRequests"
                        value={maxConcurrentRequests}
                        onChange={(e) => setMaxConcurrentRequests(Math.max(1, parseInt(e.target.value) || 1))}
                        className={inputClass}
                        min="1"
                        max="10"
                        required
                      />
                      <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Limit concurrent requests to Ollama server (1-10)
                      </p>
                    </div>

                    <div className={`p-3 rounded-lg border ${
                      isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                          Queue Status
                        </span>
                        <button
                          type="button"
                          onClick={handleRefreshStats}
                          className={`px-2 py-1 rounded text-sm transition-colors ${
                            isDarkMode 
                              ? 'hover:bg-gray-600 text-gray-300' 
                              : 'hover:bg-gray-200 text-gray-600'
                          }`}
                          disabled={isRefreshing}
                        >
                          {isRefreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                      <div className={`grid grid-cols-2 gap-4 text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`}>
                        <div>
                          <span>Queued: </span>
                          <span className="font-mono">{queueStats.size}</span>
                        </div>
                        <div>
                          <span>Processing: </span>
                          <span className="font-mono">{queueStats.pending}</span>
                        </div>
                      </div>
                      {(queueStats.size > 0 || queueStats.pending > 0) && (
                        <button
                          type="button"
                          onClick={handleClearQueue}
                          className={`mt-2 text-sm px-2 py-1 rounded w-full ${
                            isDarkMode
                              ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                              : 'bg-red-50 text-red-600 hover:bg-red-100'
                          }`}
                        >
                          Clear Queue
                        </button>
                      )}
                    </div>
                  </div>
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>
          )}

          <div className="flex justify-between gap-2 mt-6">
            <div>
              {isConnected && (
                <button
                  type="button"
                  onClick={handleClearSummaries}
                  disabled={isClearing}
                  className={`btn ${isDarkMode 
                    ? 'bg-red-900/80 text-red-100 hover:bg-red-800' 
                    : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                >
                  {isClearing ? 'Clearing Summaries...' : 'Clear All AI Summaries'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`btn ${isDarkMode 
                  ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300' 
                  : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'} border`}
              >
                Cancel
              </button>
              {isConnected && (
                <button
                  type="submit"
                  className="btn btn-blue"
                >
                  Save Configuration
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OllamaConfigModal; 