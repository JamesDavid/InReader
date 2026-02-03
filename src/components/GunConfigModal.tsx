import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { gunService } from '../services/gunService';

interface GunConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const GunConfigModal: React.FC<GunConfigModalProps> = ({
  isOpen,
  onClose,
  isDarkMode
}) => {
  const defaultRelays = [
    'https://peer.gun.eco/gun',
    'https://gun-us.herokuapp.com/gun',
    'https://gun-eu.herokuapp.com/gun'
  ];

  const [relayServer, setRelayServer] = useState(defaultRelays[0]);
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [shareFeedList, setShareFeedList] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  useEffect(() => {
    if (isOpen) {
      // Load current settings
      const config = gunService.getConfig();
      setRelayServer(config.relayServer || defaultRelays[0]);
      setPrivateKey(config.privateKey || '');
      setDisplayName(config.displayName || '');
      setShareFeedList(config.shareFeedList || false);

      // Try to extract public key from private key
      if (config.privateKey) {
        try {
          const keyPair = JSON.parse(config.privateKey);
          setPublicKey(keyPair.pub || '');
        } catch (err) {
          console.error('Failed to parse private key:', err);
          setPublicKey('');
        }
      } else {
        setPublicKey('');
      }

      // Subscribe to connection status changes
      const cleanup = gunService.onConnectionStatusChange(setConnectionStatus);
      return cleanup;
    }
  }, [isOpen]);

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return isDarkMode ? 'text-green-400' : 'text-green-600';
      case 'connecting':
        return isDarkMode ? 'text-yellow-400' : 'text-yellow-600';
      case 'disconnected':
        return isDarkMode ? 'text-red-400' : 'text-red-600';
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return '●';
      case 'connecting':
        return '○';
      case 'disconnected':
        return '×';
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await gunService.updateConfig({
        relayServer,
        privateKey,
        displayName,
        shareFeedList
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateKeyPair = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const keyPair = await gunService.generateKeyPair();
      setPublicKey(keyPair.pub);
      setPrivateKey(keyPair.priv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate key pair');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPrivateKey = () => {
    const blob = new Blob([privateKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gun_private_key.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportPrivateKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        const trimmedContent = content.trim();
        setPrivateKey(trimmedContent);
        try {
          const keyPair = JSON.parse(trimmedContent);
          setPublicKey(keyPair.pub || '');
        } catch (err) {
          console.error('Failed to parse imported key:', err);
          setPublicKey('');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Gun.js Configuration"
      isDarkMode={isDarkMode}
    >
      <div className="space-y-4">
        <div>
          <label 
            className={`block text-sm font-medium mb-1 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            Relay Server
          </label>
          <select
            value={relayServer}
            onChange={(e) => setRelayServer(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700 text-gray-200' 
                : 'bg-white border-gray-300 text-gray-900'
            } focus:outline-none focus:ring-2 focus:ring-reader-blue`}
          >
            {defaultRelays.map((relay) => (
              <option key={relay} value={relay}>
                {relay}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 mt-1">
            <span className={`text-lg leading-none ${getConnectionStatusColor()}`}>
              {getConnectionStatusIcon()}
            </span>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {connectionStatus === 'connected' && 'Connected to relay server'}
              {connectionStatus === 'connecting' && 'Connecting to relay server...'}
              {connectionStatus === 'disconnected' && 'Disconnected from relay server'}
            </p>
          </div>
          <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            The Gun.js relay server for peer discovery
          </p>
        </div>

        <div>
          <label 
            className={`block text-sm font-medium mb-1 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            className={`w-full px-3 py-2 rounded-lg border ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700 text-gray-200' 
                : 'bg-white border-gray-300 text-gray-900'
            } focus:outline-none focus:ring-2 focus:ring-reader-blue`}
          />
          <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Your public display name for shared items
          </p>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={shareFeedList}
              onChange={(e) => setShareFeedList(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-reader-blue focus:ring-reader-blue"
            />
            <div>
              <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Share my feed subscriptions
              </span>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Allow followers to see and subscribe to your RSS feeds
              </p>
            </div>
          </label>
        </div>

        <div>
          <label
            className={`block text-sm font-medium mb-1 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            Public Key
          </label>
          <input
            type="text"
            value={publicKey}
            readOnly
            className={`w-full px-3 py-2 rounded-lg border font-mono text-sm ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700 text-gray-200' 
                : 'bg-gray-100 border-gray-300 text-gray-900'
            } focus:outline-none`}
            placeholder="Your public key will appear here"
          />
          <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Your public key for identification
          </p>
        </div>

        <div>
          <label 
            className={`block text-sm font-medium mb-1 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            Private Key
          </label>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="Your private key"
            className={`w-full px-3 py-2 rounded-lg border ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700 text-gray-200' 
                : 'bg-white border-gray-300 text-gray-900'
            } focus:outline-none focus:ring-2 focus:ring-reader-blue`}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleExportPrivateKey}
              disabled={!privateKey}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                isDarkMode
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } ${!privateKey ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Export Key
            </button>
            <label
              className={`px-3 py-1 rounded text-sm transition-colors cursor-pointer ${
                isDarkMode
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Import Key
              <input
                type="file"
                accept=".txt"
                onChange={handleImportPrivateKey}
                className="hidden"
              />
            </label>
            <button
              onClick={handleGenerateKeyPair}
              disabled={isLoading}
              className={`px-3 py-1 rounded text-sm transition-colors ml-auto ${
                isDarkMode
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-red-500 text-white hover:bg-red-600'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Generate New Key
            </button>
          </div>
          {privateKey && (
            <p className={`mt-2 text-xs ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
              ⚠️ Save your private key securely! It cannot be recovered if lost.
            </p>
          )}
        </div>

        {error && (
          <div className="text-red-500 text-sm mt-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg ${
              isDarkMode
                ? 'text-gray-300 hover:bg-gray-800'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg bg-reader-blue text-white hover:bg-blue-600 
              ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default GunConfigModal; 