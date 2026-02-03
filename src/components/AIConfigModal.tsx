import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import {
  testOllamaConnection,
  testOpenAIConnection,
  testAnthropicConnection,
  getAvailableModels,
  saveAIConfig,
  loadAIConfig,
  type AIConfig
} from '../services/aiService';
import { clearAllAISummaries, type InterestTag } from '../services/db';
import { getQueueStats, clearQueue, initializeQueue } from '../services/requestQueueService';
import { getInterestProfile, clearInterestProfile, rescoreAllTaggedEntries, deleteInterestTag } from '../services/interestService';
import ttsService, { type TTSConfig, type OpenAIVoice, type TTSProvider } from '../services/ttsService';

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

interface QueuedRequest {
  entryId?: number;
  feedId?: number;
  feedTitle?: string;
  entryTitle?: string;
  status: 'queued' | 'processing' | 'failed';
  addedAt: Date;
  error?: string;
  type?: string;
}

const defaultSystemPrompts = {
  summary: "You are a helpful AI assistant that summarizes RSS feed content. Be concise and focus on the key points.",
  chat: "You are a helpful AI assistant that discusses RSS feed content with users. Be informative and engaging."
};

const AIConfigModal: React.FC<AIConfigModalProps> = ({ isOpen, onClose, isDarkMode }) => {
  // Provider state
  const [provider, setProvider] = useState<AIConfig['provider']>('ollama');

  // Server and connection states
  const [serverUrl, setServerUrl] = useState('http://localhost:11434');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ name: string }[]>([]);

  // Model states
  const [summaryModel, setSummaryModel] = useState('');
  const [chatModel, setChatModel] = useState('');

  // Prompt states
  const [summarySystemPrompt, setSummarySystemPrompt] = useState(defaultSystemPrompts.summary);
  const [chatSystemPrompt, setChatSystemPrompt] = useState(defaultSystemPrompts.chat);

  // Interest profile state
  const [interestTags, setInterestTags] = useState<InterestTag[]>([]);
  const [isClearingProfile, setIsClearingProfile] = useState(false);

  // Queue states
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState(2);
  const [isClearing, setIsClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState<{ size: number; pending: number; requests: QueuedRequest[] }>({
    size: 0,
    pending: 0,
    requests: []
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // TTS state
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('browser');
  const [openaiVoice, setOpenaiVoice] = useState<OpenAIVoice>('nova');
  const [openaiSpeed, setOpenaiSpeed] = useState(1.0);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState<string | null>(null);
  const [browserRate, setBrowserRate] = useState(1.0);
  const [ttsTestStatus, setTtsTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const config = loadAIConfig();
    if (config) {
      setProvider(config.provider || 'ollama');
      setServerUrl(config.serverUrl || 'http://localhost:11434');
      setOpenaiApiKey(config.openaiApiKey || '');
      setAnthropicApiKey(config.anthropicApiKey || '');
      setSummaryModel(config.summaryModel);
      setChatModel(config.chatModel);
      setSummarySystemPrompt(config.summarySystemPrompt || defaultSystemPrompts.summary);
      setChatSystemPrompt(config.chatSystemPrompt || defaultSystemPrompts.chat);
      setMaxConcurrentRequests(config.maxConcurrentRequests || 2);
      initializeQueue(config.maxConcurrentRequests || 2);
      // Test connection on load - pass keys directly since setState hasn't flushed
      handleTestConnection(
        config.provider || 'ollama',
        config.serverUrl,
        config.summaryModel,
        config.chatModel,
        config.openaiApiKey,
        config.anthropicApiKey
      );
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const refreshStats = () => {
        const stats = getQueueStats();
        setQueueStats(stats);
      };
      refreshStats();
      const interval = setInterval(refreshStats, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Load interest profile when modal opens
  useEffect(() => {
    if (isOpen) {
      getInterestProfile().then(setInterestTags).catch(console.error);
    }
  }, [isOpen]);

  // Load TTS config and browser voices
  useEffect(() => {
    // Load TTS config
    const ttsConfig = ttsService.getConfig();
    setTtsProvider(ttsConfig.provider);
    setOpenaiVoice(ttsConfig.openaiVoice);
    setOpenaiSpeed(ttsConfig.openaiSpeed);
    setSelectedBrowserVoice(ttsConfig.browserVoice);
    setBrowserRate(ttsConfig.browserRate);

    // Load browser voices
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setBrowserVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const handleTestConnection = async (
    prov: AIConfig['provider'],
    url?: string,
    currentSummaryModel?: string,
    currentChatModel?: string,
    openaiKey?: string,
    anthropicKey?: string
  ) => {
    setIsConnecting(true);
    setIsConnected(false);
    setConnectionError(null);

    let connected = false;
    let error: string | null = null;
    switch (prov) {
      case 'openai': {
        const key = openaiKey ?? openaiApiKey;
        if (!key) {
          error = 'Please enter an API key';
          break;
        }
        const result = await testOpenAIConnection(key);
        if (result === null) {
          connected = true;
        } else {
          error = result;
        }
        break;
      }
      case 'anthropic': {
        const key = anthropicKey ?? anthropicApiKey;
        if (!key) {
          error = 'Please enter an API key';
          break;
        }
        const result = await testAnthropicConnection(key);
        if (result === null) {
          connected = true;
        } else {
          error = result;
        }
        break;
      }
      case 'ollama':
      default:
        connected = await testOllamaConnection(url || serverUrl);
        if (!connected) {
          error = `Failed to connect to Ollama server at ${url || serverUrl}`;
        }
        break;
    }

    setIsConnected(connected);
    setIsConnecting(false);
    setConnectionError(error);

    if (connected) {
      const models = await getAvailableModels(prov, url || serverUrl);
      setAvailableModels(models);

      const modelNames = models.map(m => m.name);

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

  // Reset connection when provider changes
  const handleProviderChange = async (newProvider: AIConfig['provider']) => {
    setProvider(newProvider);
    setIsConnected(false);
    setConnectionError(null);
    setAvailableModels([]);
    setSummaryModel('');
    setChatModel('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      handleTestConnection(provider, serverUrl, summaryModel, chatModel);
      return;
    }

    const config: AIConfig = {
      provider,
      serverUrl,
      openaiApiKey: openaiApiKey || undefined,
      anthropicApiKey: anthropicApiKey || undefined,
      summaryModel,
      chatModel,
      summarySystemPrompt,
      chatSystemPrompt,
      maxConcurrentRequests
    };
    saveAIConfig(config);
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
    setQueueStats(stats);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleClearQueue = () => {
    clearQueue();
    setQueueStats(getQueueStats());
  };

  const getConnectButtonLabel = () => {
    if (isConnecting) return 'Connecting...';
    if (isConnected) return 'Reconnect';
    if (provider === 'ollama') return 'Connect';
    return 'Test Key';
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
          AI Configuration
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Provider Selector */}
          <div className="mb-4">
            <label htmlFor="provider" className={labelClass}>
              AI Provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as AIConfig['provider'])}
              className={inputClass}
            >
              <option value="ollama">Ollama (Local)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          {/* Connection Configuration - varies by provider */}
          <div className="mb-4">
            {provider === 'ollama' && (
              <>
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
                    onClick={() => handleTestConnection('ollama', serverUrl)}
                    className="btn btn-blue whitespace-nowrap"
                    disabled={isConnecting}
                  >
                    {getConnectButtonLabel()}
                  </button>
                </div>
                {/* Warning for cloud-hosted + private IP */}
                {(() => {
                  const host = window.location.hostname;
                  const isCloud = host.endsWith('.vercel.app') || host.endsWith('.netlify.app');
                  const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost|127\.0\.0\.1)/.test(
                    (() => { try { return new URL(serverUrl).hostname; } catch { return ''; } })()
                  );
                  if (isCloud && isPrivate) {
                    return (
                      <p className={`text-sm mt-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                        Cloud-hosted apps cannot reach private/LAN addresses like {serverUrl}. Use the Docker deployment for LAN Ollama servers, or expose your Ollama server publicly (e.g., via Cloudflare Tunnel).
                      </p>
                    );
                  }
                  return null;
                })()}
              </>
            )}

            {provider === 'openai' && (
              <>
                <label htmlFor="openaiApiKey" className={labelClass}>
                  OpenAI API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    id="openaiApiKey"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    className={inputClass}
                    placeholder="sk-..."
                    required
                  />
                  <button
                    type="button"
                    onClick={() => handleTestConnection('openai')}
                    className="btn btn-blue whitespace-nowrap"
                    disabled={isConnecting || !openaiApiKey}
                  >
                    {getConnectButtonLabel()}
                  </button>
                </div>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Your API key is stored locally and sent through a server proxy for each request.
                </p>
              </>
            )}

            {provider === 'anthropic' && (
              <>
                <label htmlFor="anthropicApiKey" className={labelClass}>
                  Anthropic API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    id="anthropicApiKey"
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                    className={inputClass}
                    placeholder="sk-ant-..."
                    required
                  />
                  <button
                    type="button"
                    onClick={() => handleTestConnection('anthropic')}
                    className="btn btn-blue whitespace-nowrap"
                    disabled={isConnecting || !anthropicApiKey}
                  >
                    {getConnectButtonLabel()}
                  </button>
                </div>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Your API key is stored locally and sent through a server proxy for each request.
                </p>
              </>
            )}

            {/* Connection status indicator */}
            {isConnected && (
              <p className={`text-sm mt-2 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                Connected successfully
              </p>
            )}
            {connectionError && !isConnecting && (
              <p className={`text-sm mt-2 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                {connectionError}
              </p>
            )}
            {clearMessage && (
              <p className={`text-sm mt-2 ${clearMessage.includes('Failed')
                ? (isDarkMode ? 'text-red-400' : 'text-red-600')
                : (isDarkMode ? 'text-green-400' : 'text-green-600')}`}>
                {clearMessage}
              </p>
            )}
          </div>

          <Tab.Group>
            <Tab.List className="flex space-x-1 rounded-xl bg-gray-900/20 p-1">
              {isConnected && (
                <>
                  <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                    Summarizer
                  </Tab>
                  <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                    Chat
                  </Tab>
                  <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                    Recommendations
                  </Tab>
                </>
              )}
              <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                Text-to-Speech
              </Tab>
              <Tab className={({ selected }) => selected ? selectedTabClass : tabClass}>
                Queue
              </Tab>
            </Tab.List>

            <Tab.Panels className="mt-4">
              {isConnected && (
                <>
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

                  {/* Recommendations — Interest Profile */}
                  <Tab.Panel>
                    <div className="space-y-4">
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Tags are extracted from AI summaries. Starring or listening to an entry adds its tags here. Articles matching these tags appear in the Recommended view.
                      </p>

                      {interestTags.length === 0 ? (
                        <div className={`text-center py-6 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          No interest tags collected yet. Star or listen to summarized articles to build your profile.
                        </div>
                      ) : (
                        <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex flex-wrap gap-2">
                            {interestTags.map(tag => (
                              <span
                                key={tag.tag}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm ${
                                  isDarkMode
                                    ? 'bg-gray-600 text-gray-200'
                                    : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {tag.tag}
                                <span className={`text-xs font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {tag.count}
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await deleteInterestTag(tag.id!);
                                    setInterestTags(prev => prev.filter(t => t.id !== tag.id));
                                  }}
                                  className={`ml-0.5 rounded-full p-0.5 transition-colors ${
                                    isDarkMode
                                      ? 'hover:bg-gray-500 text-gray-400 hover:text-gray-200'
                                      : 'hover:bg-gray-300 text-gray-500 hover:text-gray-700'
                                  }`}
                                  title={`Remove "${tag.tag}" from profile`}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {interestTags.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await rescoreAllTaggedEntries();
                                window.dispatchEvent(new CustomEvent('showToast', {
                                  detail: { message: 'Re-scored all entries', type: 'success' }
                                }));
                              }}
                              className={`text-sm px-3 py-1.5 rounded ${
                                isDarkMode
                                  ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
                                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                              }`}
                            >
                              Re-score Entries
                            </button>
                            <button
                              type="button"
                              disabled={isClearingProfile}
                              onClick={async () => {
                                setIsClearingProfile(true);
                                try {
                                  await clearInterestProfile();
                                  setInterestTags([]);
                                  await rescoreAllTaggedEntries();
                                } catch (e) {
                                  console.error('Failed to clear profile:', e);
                                } finally {
                                  setIsClearingProfile(false);
                                }
                              }}
                              className={`text-sm px-3 py-1.5 rounded ${
                                isDarkMode
                                  ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              {isClearingProfile ? 'Clearing...' : 'Clear Profile'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </Tab.Panel>
                </>
              )}

              {/* Text-to-Speech Configuration - Always visible */}
              <Tab.Panel>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="ttsProvider" className={labelClass}>
                      TTS Provider
                    </label>
                    <select
                      id="ttsProvider"
                      value={ttsProvider}
                      onChange={(e) => {
                        const newProvider = e.target.value as TTSProvider;
                        setTtsProvider(newProvider);
                        ttsService.saveConfig({ provider: newProvider });
                      }}
                      className={inputClass}
                    >
                      <option value="browser">Browser (Free)</option>
                      <option value="openai" disabled={!openaiApiKey}>
                        OpenAI {!openaiApiKey ? '(requires API key)' : ''}
                      </option>
                    </select>
                  </div>

                  {ttsProvider === 'openai' && (
                    <>
                      <div>
                        <label htmlFor="openaiVoice" className={labelClass}>
                          Voice
                        </label>
                        <select
                          id="openaiVoice"
                          value={openaiVoice}
                          onChange={(e) => {
                            const voice = e.target.value as OpenAIVoice;
                            setOpenaiVoice(voice);
                            ttsService.saveConfig({ openaiVoice: voice });
                          }}
                          className={inputClass}
                        >
                          <option value="alloy">Alloy (neutral)</option>
                          <option value="echo">Echo (male)</option>
                          <option value="fable">Fable (British)</option>
                          <option value="onyx">Onyx (deep male)</option>
                          <option value="nova">Nova (female)</option>
                          <option value="shimmer">Shimmer (soft female)</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="openaiSpeed" className={labelClass}>
                          Speed: {openaiSpeed.toFixed(1)}x
                        </label>
                        <input
                          type="range"
                          id="openaiSpeed"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          value={openaiSpeed}
                          onChange={(e) => {
                            const speed = parseFloat(e.target.value);
                            setOpenaiSpeed(speed);
                            ttsService.saveConfig({ openaiSpeed: speed });
                          }}
                          className="w-full"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={isTesting || !openaiApiKey}
                        onClick={async () => {
                          setIsTesting(true);
                          setTtsTestStatus('Testing...');
                          const result = await ttsService.testOpenAITTS();
                          setTtsTestStatus(result.success ? 'Success!' : `Failed: ${result.error}`);
                          setIsTesting(false);
                        }}
                        className={`w-full btn ${isDarkMode
                          ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                      >
                        {isTesting ? 'Testing...' : 'Test Voice'}
                      </button>

                      {ttsTestStatus && (
                        <p className={`text-sm ${ttsTestStatus.startsWith('Failed')
                          ? (isDarkMode ? 'text-red-400' : 'text-red-600')
                          : (isDarkMode ? 'text-green-400' : 'text-green-600')}`}>
                          {ttsTestStatus}
                        </p>
                      )}

                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        OpenAI TTS costs ~$0.015 per 1,000 characters. A typical article costs $0.01-0.05.
                      </p>
                    </>
                  )}

                  {ttsProvider === 'browser' && (
                    <>
                      <div>
                        <label htmlFor="browserVoice" className={labelClass}>
                          Voice
                        </label>
                        <select
                          id="browserVoice"
                          value={selectedBrowserVoice || ''}
                          onChange={(e) => {
                            const voiceName = e.target.value || null;
                            setSelectedBrowserVoice(voiceName);
                            ttsService.saveConfig({ browserVoice: voiceName });
                          }}
                          className={inputClass}
                        >
                          <option value="">System Default</option>
                          {browserVoices.map((voice) => (
                            <option key={voice.name} value={voice.name}>
                              {voice.name} ({voice.lang})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="browserRate" className={labelClass}>
                          Speed: {browserRate.toFixed(1)}x
                        </label>
                        <input
                          type="range"
                          id="browserRate"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          value={browserRate}
                          onChange={(e) => {
                            const rate = parseFloat(e.target.value);
                            setBrowserRate(rate);
                            ttsService.saveConfig({ browserRate: rate });
                          }}
                          className="w-full"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const utterance = new SpeechSynthesisUtterance('This is a test of browser text to speech.');
                          if (selectedBrowserVoice) {
                            const voice = browserVoices.find(v => v.name === selectedBrowserVoice);
                            if (voice) utterance.voice = voice;
                          }
                          utterance.rate = browserRate;
                          window.speechSynthesis.cancel();
                          window.speechSynthesis.speak(utterance);
                        }}
                        className={`w-full btn ${isDarkMode
                          ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                      >
                        Test Voice
                      </button>

                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Browser TTS is free but voice quality varies by browser and operating system.
                      </p>
                    </>
                  )}
                </div>
              </Tab.Panel>

              {/* Queue Configuration - Always visible */}
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
                      Limit concurrent AI requests (1-10)
                    </p>
                  </div>

                  <div className={`p-4 rounded-lg border ${
                    isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex justify-between items-center mb-3">
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

                    <div className={`grid grid-cols-3 gap-4 text-sm mb-3 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      <div>
                        <span>Queued: </span>
                        <span className="font-mono">{queueStats.requests.filter(r => r.status === 'queued').length}</span>
                      </div>
                      <div>
                        <span>Processing: </span>
                        <span className="font-mono">{queueStats.requests.filter(r => r.status === 'processing').length}</span>
                      </div>
                      <div>
                        <span>Failed: </span>
                        <span className="font-mono">{queueStats.requests.filter(r => r.status === 'failed').length}</span>
                      </div>
                    </div>

                    {queueStats.requests.length > 0 && (
                      <div className={`mt-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
                          {[...queueStats.requests]
                            .map(request => ({
                              ...request,
                              addedAt: request.addedAt ? new Date(request.addedAt) : new Date()
                            }))
                            .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
                            .map((request) => (
                              <div
                                key={`${request.entryId}-${request.addedAt.getTime()}`}
                                className={`p-2 rounded ${
                                  request.status === 'processing'
                                    ? (isDarkMode ? 'bg-blue-900/30' : 'bg-blue-50')
                                    : request.status === 'failed'
                                    ? (isDarkMode ? 'bg-red-900/30' : 'bg-red-50')
                                    : (isDarkMode ? 'bg-gray-800' : 'bg-white')
                                }`}
                              >
                                <div className={`font-medium text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                                  {request.entryTitle || 'Unknown Entry'}
                                </div>
                                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {request.feedTitle || 'Unknown Feed'} • {request.status}
                                  {request.status === 'processing' && (
                                    <span className="ml-1">• Fetching article content...</span>
                                  )}
                                  {request.error && (
                                    <span className={isDarkMode ? 'text-red-400' : 'text-red-500'}>
                                      {' • '}{request.error}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {(queueStats.size > 0 || queueStats.pending > 0) && (
                      <button
                        type="button"
                        onClick={handleClearQueue}
                        className={`mt-3 text-sm px-2 py-1 rounded w-full ${
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

export default AIConfigModal;
