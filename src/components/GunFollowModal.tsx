import React, { useState } from 'react';
import Modal from './Modal';
import { gunService } from '../services/gunService';

interface GunFollowModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onFollow: (pubKey: string) => Promise<void>;
}

const GunFollowModal: React.FC<GunFollowModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onFollow
}) => {
  const [pubKey, setPubKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFollow = async () => {
    if (!pubKey.trim()) {
      setError('Please enter a public key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onFollow(pubKey.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to follow user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Follow User"
      isDarkMode={isDarkMode}
    >
      <div className="space-y-4">
        <div>
          <label 
            className={`block text-sm font-medium mb-1 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            User's Public Key
          </label>
          <input
            type="text"
            value={pubKey}
            onChange={(e) => setPubKey(e.target.value)}
            placeholder="Enter the user's public key"
            className={`w-full px-3 py-2 rounded-lg border font-mono text-sm ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700 text-gray-200' 
                : 'bg-white border-gray-300 text-gray-900'
            } focus:outline-none focus:ring-2 focus:ring-reader-blue`}
          />
          <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            The public key of the user you want to follow
          </p>
        </div>

        {error && (
          <div className="text-red-500 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
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
            onClick={handleFollow}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg bg-reader-blue text-white hover:bg-blue-600 
              ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Following...' : 'Follow'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default GunFollowModal; 