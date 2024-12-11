import React, { useState, useEffect, useRef } from 'react';
import { addNewFeed } from '../services/feedParser';

interface AddFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isDarkMode: boolean;
}

const AddFeedModal: React.FC<AddFeedModalProps> = ({ isOpen, onClose, onSuccess, isDarkMode }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when modal opens and clear input when modal closes
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the modal is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      // Clear the input when modal closes
      setUrl('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await addNewFeed(url);
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof Error && err.message === 'Feed already exists') {
        setError('This feed has already been subscribed to.');
      } else {
        setError('Failed to add feed. Please check the URL and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = `w-full px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-reader-blue
    ${isDarkMode 
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`;

  const labelClass = `block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-30" onClick={onClose} />
      <div className={`relative z-50 rounded-lg p-6 w-full max-w-md border-2 shadow-xl
        ${isDarkMode 
          ? 'bg-gray-800 border-gray-600' 
          : 'bg-white border-gray-200'}`}>
        <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          Add New Feed
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label 
              htmlFor="url" 
              className={labelClass}
            >
              Feed URL
            </label>
            <input
              ref={inputRef}
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={inputClass}
              placeholder="https://example.com/feed.xml"
              required
            />
          </div>

          {error && (
            <div className={`mb-4 text-sm ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`btn ${isDarkMode 
                ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300' 
                : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'} border`}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-blue"
              disabled={isLoading}
            >
              {isLoading ? 'Adding...' : 'Add Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFeedModal; 