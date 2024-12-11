import React, { useState, useEffect, useRef } from 'react';
import ttsService from '../services/ttsService';

interface VoiceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

interface VoiceConfig {
  voice: SpeechSynthesisVoice;
  rate: number;
}

const VoiceConfigModal: React.FC<VoiceConfigModalProps> = ({ isOpen, onClose, isDarkMode }) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState('');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const hasLoadedPreferences = useRef(false);

  const sampleText = "Welcome to InReader. This is how articles will sound when read aloud.";

  // Filter voices based on search text
  const filteredVoices = voices.filter(voice => {
    const searchText = voiceFilter.toLowerCase();
    return voice.name.toLowerCase().includes(searchText) || 
           voice.lang.toLowerCase().includes(searchText);
  });

  // Load saved preferences once
  useEffect(() => {
    if (!hasLoadedPreferences.current) {
      const savedRate = localStorage.getItem('speechRate');
      if (savedRate) {
        setRate(parseFloat(savedRate));
      }
      hasLoadedPreferences.current = true;
    }
  }, []);

  // Handle voice loading
  useEffect(() => {
    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Only set the selected voice if it hasn't been set yet
      if (!selectedVoice) {
        const savedVoice = localStorage.getItem('selectedVoice');
        if (savedVoice) {
          const voice = availableVoices.find(v => v.name === savedVoice);
          if (voice) setSelectedVoice(voice);
        } else if (availableVoices.length > 0) {
          setSelectedVoice(availableVoices[0]);
        }
      }
    };

    // Initial load
    updateVoices();
    
    // Setup event listener
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [selectedVoice]);

  const handleSave = () => {
    if (selectedVoice) {
      localStorage.setItem('selectedVoice', selectedVoice.name);
      localStorage.setItem('speechRate', rate.toString());
      ttsService.updateVoice(selectedVoice);
      ttsService.updateRate(rate);
    }
    onClose();
  };

  const handleTest = () => {
    if (!selectedVoice) return;

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.voice = selectedVoice;
    utterance.rate = rate;
    utteranceRef.current = utterance;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopTest = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  if (!isOpen) return null;

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
          Text-to-Speech Configuration
        </h2>
        
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="mb-4">
            <label htmlFor="voiceFilter" className={labelClass}>
              Filter Voices
            </label>
            <input
              type="text"
              id="voiceFilter"
              value={voiceFilter}
              onChange={(e) => setVoiceFilter(e.target.value)}
              placeholder="Filter by name or language (e.g. 'Natural', 'United States')"
              className={inputClass}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="voice" className={labelClass}>
              Voice {filteredVoices.length > 0 ? `(${filteredVoices.length} available)` : ''}
            </label>
            <select
              id="voice"
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const voice = voices.find(v => v.name === e.target.value);
                if (voice) setSelectedVoice(voice);
              }}
              className={inputClass}
              required
            >
              {filteredVoices.map(voice => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label htmlFor="rate" className={labelClass}>
              Speed: {rate}x
            </label>
            <input
              type="range"
              id="rate"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="mb-6">
            <button
              type="button"
              onClick={isPlaying ? stopTest : handleTest}
              className={`w-full btn ${isDarkMode 
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
            >
              {isPlaying ? 'Stop Test' : 'Test Voice'}
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`btn ${isDarkMode 
                ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300' 
                : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'} border`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-blue"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VoiceConfigModal; 