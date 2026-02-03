import { markAsListened } from './db';
import { loadAIConfig } from './aiService';

interface QueuedArticle {
  id: number;
  title: string;
  source: string;
  summary?: string;
  content: string;
}

export type TTSProvider = 'browser' | 'openai';
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface TTSConfig {
  provider: TTSProvider;
  openaiVoice: OpenAIVoice;
  openaiSpeed: number;
  browserVoice: string | null;
  browserRate: number;
}

const DEFAULT_TTS_CONFIG: TTSConfig = {
  provider: 'browser',
  openaiVoice: 'nova',
  openaiSpeed: 1.0,
  browserVoice: null,
  browserRate: 1.0
};

class TTSService {
  private queue: QueuedArticle[] = [];
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private currentAudioStartTime: number = 0;
  private currentAudioDuration: number = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private rate: number = 1;
  private currentArticle: QueuedArticle | null = null;
  private currentArticleIndex: number = -1;
  private listeners: Set<() => void> = new Set();
  private audioContext: AudioContext | null = null;
  private chromePauseWorkaroundInterval: number | null = null;
  private ttsConfig: TTSConfig = DEFAULT_TTS_CONFIG;

  constructor() {
    this.loadConfig();

    // Initialize browser voice when available
    const loadVoice = () => {
      if (this.ttsConfig.browserVoice) {
        const voices = window.speechSynthesis.getVoices();
        this.voice = voices.find(v => v.name === this.ttsConfig.browserVoice) || null;
      }
    };

    loadVoice();
    window.speechSynthesis.onvoiceschanged = loadVoice;
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem('ttsConfig');
      console.log('TTS: Loading config, saved value:', saved);
      if (saved) {
        this.ttsConfig = { ...DEFAULT_TTS_CONFIG, ...JSON.parse(saved) };
      }

      // Migrate legacy settings
      const legacyVoice = localStorage.getItem('selectedVoice');
      const legacyRate = localStorage.getItem('speechRate');
      if (legacyVoice && !saved) {
        this.ttsConfig.browserVoice = legacyVoice;
      }
      if (legacyRate && !saved) {
        this.ttsConfig.browserRate = parseFloat(legacyRate);
      }

      this.rate = this.ttsConfig.browserRate;
      console.log('TTS: Final config:', this.ttsConfig);
    } catch (e) {
      console.error('Failed to load TTS config:', e);
    }
  }

  saveConfig(config: Partial<TTSConfig>) {
    console.log('TTS: saveConfig called with:', config);
    this.ttsConfig = { ...this.ttsConfig, ...config };
    localStorage.setItem('ttsConfig', JSON.stringify(this.ttsConfig));
    console.log('TTS: Config saved, new config:', this.ttsConfig);

    // Update internal state
    if (config.browserRate !== undefined) {
      this.rate = config.browserRate;
    }
    if (config.browserVoice !== undefined) {
      const voices = window.speechSynthesis.getVoices();
      this.voice = voices.find(v => v.name === config.browserVoice) || null;
    }

    this.notifyListeners();
  }

  getConfig(): TTSConfig {
    return { ...this.ttsConfig };
  }

  // Lazily initialize AudioContext to avoid browser warnings
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private cleanTextForSpeech(text: string): string {
    // Create a temporary div to parse HTML
    const div = document.createElement('div');
    div.innerHTML = text;

    // Remove script and style elements
    const scripts = div.getElementsByTagName('script');
    const styles = div.getElementsByTagName('style');
    while (scripts.length > 0) scripts[0].remove();
    while (styles.length > 0) styles[0].remove();

    // Get text content
    let cleanText = div.textContent || div.innerText || '';

    // Remove URLs
    cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, '');

    // Remove hashtags
    cleanText = cleanText.replace(/#\w+/g, '');

    // Remove email addresses
    cleanText = cleanText.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '');

    // Remove markdown formatting
    cleanText = cleanText
      // Remove markdown links but keep text
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      // Remove bold/italic
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove bullets and list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove horizontal rules
      .replace(/^([-*_]){3,}\s*$/gm, '')
      // Remove task lists
      .replace(/^[\s]*- \[[x ]\]\s*/gm, '')
      // Remove table formatting
      .replace(/\|/g, ' ');

    // Remove excessive whitespace
    cleanText = cleanText.replace(/\s+/g, ' ');

    // Remove common file extensions
    cleanText = cleanText.replace(/\.\w{2,4}\b/g, '');

    // Remove common programming syntax
    cleanText = cleanText.replace(/\b(function|const|let|var|if|else|for|while|return)\b/g, '');
    cleanText = cleanText.replace(/[{}[\]()]/g, '');

    // Remove HTML entities
    cleanText = cleanText.replace(/&[^;]+;/g, '');

    // Add natural pauses
    cleanText = cleanText
      .replace(/([.!?])\s+/g, '$1. ') // Add extra pause after sentence endings
      .replace(/([,;:])\s+/g, '$1, '); // Add slight pause after commas and semicolons

    // Trim and normalize spaces
    cleanText = cleanText.trim().replace(/\s+/g, ' ');

    return cleanText;
  }

  addListener(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(callback => callback());
  }

  updateVoice(voice: SpeechSynthesisVoice) {
    this.voice = voice;
    this.saveConfig({ browserVoice: voice.name });
  }

  updateRate(rate: number) {
    this.rate = rate;
    this.saveConfig({ browserRate: rate });
  }

  private playAddToQueueSound() {
    try {
      const audioContext = this.getAudioContext();

      // Resume context if suspended (required after user interaction)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create oscillator and gain nodes
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Set up oscillator
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
      oscillator.frequency.setValueAtTime(1108.73, audioContext.currentTime + 0.1); // C#6 note

      // Set up gain (volume envelope)
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Play sound
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.warn('Could not play add-to-queue sound:', error);
    }
  }

  private playDuplicateSound() {
    try {
      const audioContext = this.getAudioContext();

      // Resume context if suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create oscillator and gain nodes
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Set up oscillator for a descending tone (sad sound)
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
      oscillator.frequency.linearRampToValueAtTime(330, audioContext.currentTime + 0.2); // E4 note

      // Set up gain (volume envelope)
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Play sound
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('Could not play duplicate sound:', error);
    }
  }

  // Chrome has a bug where speech pauses after ~15 seconds
  // This workaround keeps it alive by calling pause/resume periodically
  private startChromePauseWorkaround() {
    this.stopChromePauseWorkaround();
    this.chromePauseWorkaroundInterval = window.setInterval(() => {
      if (this.isPlaying && !this.isPaused && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000); // Every 10 seconds
  }

  private stopChromePauseWorkaround() {
    if (this.chromePauseWorkaroundInterval !== null) {
      clearInterval(this.chromePauseWorkaroundInterval);
      this.chromePauseWorkaroundInterval = null;
    }
  }

  async addToQueue(entry: { id: number; title: string; content_fullArticle?: string; content_rssAbstract?: string; content_aiSummary?: string; feedTitle?: string }) {
    // Check if the article is currently playing
    if (this.currentArticle?.id === entry.id) {
      this.playDuplicateSound();
      return;
    }

    // Check if the article is already in the queue
    if (this.queue.some(article => article.id !== undefined && article.id === entry.id)) {
      this.playDuplicateSound();
      return;
    }

    // Determine which content to use, preferring full article over RSS abstract
    let content = '';
    if (entry.content_fullArticle) {
      content = entry.content_fullArticle;
    } else if (entry.content_rssAbstract) {
      content = entry.content_rssAbstract;
    }

    // Clean the content and summary for better readability
    const cleanContent = this.cleanTextForSpeech(content);
    const cleanSummary = entry.content_aiSummary ? this.cleanTextForSpeech(entry.content_aiSummary) : undefined;

    const article: QueuedArticle = {
      id: entry.id,
      title: entry.title,
      source: entry.feedTitle || 'Unknown Feed',
      summary: cleanSummary,
      content: cleanContent
    };

    this.queue.push(article);
    this.notifyListeners();

    // Play the happy sound effect
    this.playAddToQueueSound();

    // Update interest profile (fire-and-forget)
    import('./interestService').then(({ updateInterestProfile }) => {
      updateInterestProfile(entry.id).catch(console.error);
    });

    // If not currently playing, start playing the newly added item
    console.log('TTS: Added to queue, isPlaying:', this.isPlaying, 'queue length:', this.queue.length);
    if (!this.isPlaying) {
      this.currentArticleIndex = this.queue.length - 1;
      console.log('TTS: Starting playback, calling playNext()');
      this.playNext();
    }
  }

  private async playNext() {
    console.log('TTS: playNext() called, queue length:', this.queue.length, 'currentIndex:', this.currentArticleIndex);
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.isPaused = false;
      this.currentArticle = null;
      this.currentArticleIndex = -1;
      this.stopChromePauseWorkaround();
      this.notifyListeners();
      return;
    }

    // Ensure index is valid
    if (this.currentArticleIndex < 0 || this.currentArticleIndex >= this.queue.length) {
      this.currentArticleIndex = 0;
    }

    const article = this.queue[this.currentArticleIndex];
    if (!article) {
      console.error('No article at index', this.currentArticleIndex);
      this.stop();
      return;
    }

    console.log('TTS: playNext() calling playArticle for:', article.title);
    await this.playArticle(article);
  }

  private async playArticle(article: QueuedArticle) {
    console.log('TTS: playArticle() called, provider:', this.ttsConfig.provider);
    this.isPlaying = true;
    this.isPaused = false;
    this.currentArticle = article;
    this.notifyListeners();

    if (this.ttsConfig.provider === 'openai') {
      console.log('TTS: Using OpenAI provider');
      await this.playArticleWithOpenAI(article);
    } else {
      console.log('TTS: Using browser provider');
      await this.playArticleWithBrowser(article);
    }
  }

  private async playArticleWithOpenAI(article: QueuedArticle) {
    console.log('OpenAI TTS: Starting playback for article:', article.title);
    console.log('OpenAI TTS: Current config:', this.ttsConfig);

    const aiConfig = loadAIConfig();
    const apiKey = aiConfig?.openaiApiKey;

    if (!apiKey) {
      console.error('OpenAI TTS: No API key configured, falling back to browser');
      await this.playArticleWithBrowser(article);
      return;
    }

    // Build the full text to speak
    const parts: string[] = [];
    parts.push(`Now reading: ${article.title} from ${article.source}`);
    if (article.summary) {
      parts.push(`Summary: ${article.summary}`);
    }
    if (article.content) {
      parts.push(article.content);
    }

    const fullText = parts.join('. ');
    console.log('OpenAI TTS: Full text length:', fullText.length);

    if (fullText.length < 10) {
      console.error('OpenAI TTS: Text too short, falling back to browser');
      await this.playArticleWithBrowser(article);
      return;
    }

    // OpenAI TTS has a 4096 character limit per request
    // Split into chunks if needed
    const chunks = this.splitTextIntoChunks(fullText, 4000);
    console.log('OpenAI TTS: Split into', chunks.length, 'chunks');

    if (chunks.length === 0) {
      console.error('OpenAI TTS: No chunks generated, falling back to browser');
      await this.playArticleWithBrowser(article);
      return;
    }

    try {
      await this.playOpenAIChunks(chunks, article);
    } catch (error) {
      console.error('OpenAI TTS: Playback failed, falling back to browser:', error);
      await this.playArticleWithBrowser(article);
    }
  }

  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point (sentence or word boundary)
      let breakPoint = maxLength;

      // Try to break at a sentence
      const sentenceEnd = remaining.lastIndexOf('. ', maxLength);
      if (sentenceEnd > maxLength * 0.5) {
        breakPoint = sentenceEnd + 1;
      } else {
        // Try to break at a word
        const wordEnd = remaining.lastIndexOf(' ', maxLength);
        if (wordEnd > maxLength * 0.5) {
          breakPoint = wordEnd;
        }
      }

      chunks.push(remaining.slice(0, breakPoint).trim());
      remaining = remaining.slice(breakPoint).trim();
    }

    return chunks;
  }

  private async playOpenAIChunks(chunks: string[], article: QueuedArticle): Promise<void> {
    const aiConfig = loadAIConfig();
    const apiKey = aiConfig?.openaiApiKey;

    for (let i = 0; i < chunks.length; i++) {
      if (!this.isPlaying || this.currentArticle?.id !== article.id) {
        // Playback was stopped or article changed
        return;
      }

      const chunk = chunks[i];

      try {
        console.log(`OpenAI TTS: Playing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
        const response = await fetch('/api/openai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            model: 'tts-1',
            voice: this.ttsConfig.openaiVoice,
            input: chunk,
            speed: this.ttsConfig.openaiSpeed
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('OpenAI TTS API error:', response.status, errorText);
          throw new Error(`TTS request failed: ${response.status} - ${errorText}`);
        }

        const audioBlob = await response.blob();
        console.log(`OpenAI TTS: Received audio blob (${audioBlob.size} bytes, type: ${audioBlob.type})`);
        const audioUrl = URL.createObjectURL(audioBlob);

        await this.playAudioElement(audioUrl, i === chunks.length - 1, article);

        URL.revokeObjectURL(audioUrl);
      } catch (error) {
        console.error('Error playing OpenAI TTS chunk:', error);
        throw error;
      }
    }
  }

  // Test OpenAI TTS with a sample phrase
  async testOpenAITTS(): Promise<{ success: boolean; error?: string }> {
    const aiConfig = loadAIConfig();
    const apiKey = aiConfig?.openaiApiKey;

    if (!apiKey) {
      return { success: false, error: 'No OpenAI API key configured' };
    }

    try {
      const response = await fetch('/api/openai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: 'tts-1',
          voice: this.ttsConfig.openaiVoice,
          input: 'This is a test of OpenAI text to speech.',
          speed: this.ttsConfig.openaiSpeed
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `API error: ${response.status} - ${errorText}` };
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve({ success: true });
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(audioUrl);
          resolve({ success: false, error: 'Audio playback failed' });
        };
        audio.play().catch((e) => {
          URL.revokeObjectURL(audioUrl);
          resolve({ success: false, error: `Playback error: ${e.message}` });
        });
      });
    } catch (error) {
      return { success: false, error: `Network error: ${(error as Error).message}` };
    }
  }

  private async playAudioElement(url: string, isLastChunk: boolean, article: QueuedArticle): Promise<void> {
    console.log('OpenAI TTS: Playing audio via Web Audio API, isLastChunk:', isLastChunk);

    const audioContext = this.getAudioContext();

    // Resume AudioContext if suspended (handles autoplay policy)
    if (audioContext.state === 'suspended') {
      console.log('OpenAI TTS: Resuming suspended AudioContext');
      await audioContext.resume();
    }

    try {
      // Fetch the audio data from the blob URL
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log('OpenAI TTS: Audio decoded, duration:', audioBuffer.duration, 'seconds');

      // Create a buffer source and play
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      // Store reference for pause/stop control
      this.currentAudioSource = source;
      this.currentAudioStartTime = audioContext.currentTime;
      this.currentAudioDuration = audioBuffer.duration;

      return new Promise((resolve, reject) => {
        source.onended = async () => {
          console.log('OpenAI TTS: Audio ended, isLastChunk:', isLastChunk);
          this.currentAudioSource = null;

          if (isLastChunk) {
            // Mark article as listened
            try {
              await markAsListened(article.id);
            } catch (error) {
              console.error('Failed to mark article as listened:', error);
            }

            // Remove the current article from the queue
            const indexToRemove = this.currentArticleIndex;
            this.queue = this.queue.filter((_, index) => index !== indexToRemove);

            // Adjust current index if needed
            if (this.queue.length > 0) {
              if (this.currentArticleIndex >= this.queue.length) {
                this.currentArticleIndex = 0;
              }
              this.notifyListeners();
              // Don't await playNext - let it run independently
              this.playNext();
            } else {
              this.stopInternal();
            }
          }

          resolve();
        };

        source.start(0);
        console.log('OpenAI TTS: Audio playback started');
      });
    } catch (error) {
      console.error('OpenAI TTS: Web Audio API playback failed:', error);
      throw error;
    }
  }

  private async playArticleWithBrowser(article: QueuedArticle) {
    // Start Chrome pause workaround
    this.startChromePauseWorkaround();

    // Helper to handle errors and move to next or stop
    const handleUtteranceError = (event: SpeechSynthesisErrorEvent, phase: string) => {
      console.error(`TTS Error during ${phase}:`, event.error);

      // Don't treat 'interrupted' or 'canceled' as errors - these are expected during skip/stop
      if (event.error === 'interrupted' || event.error === 'canceled') {
        return;
      }

      // Remove the problematic article from queue
      this.queue = this.queue.filter((_, index) => index !== this.currentArticleIndex);
      this.notifyListeners();

      if (this.queue.length > 0) {
        if (this.currentArticleIndex >= this.queue.length) {
          this.currentArticleIndex = 0;
        }
        this.playNext();
      } else {
        this.stopInternal();
      }
    };

    // Create introduction utterance
    const intro = new SpeechSynthesisUtterance(
      `Now reading: ${article.title} from ${article.source}`
    );
    if (this.voice) intro.voice = this.voice;
    intro.rate = this.rate;
    intro.onerror = (event) => handleUtteranceError(event, 'intro');

    // Create summary utterance if available
    let summary: SpeechSynthesisUtterance | null = null;
    if (article.summary) {
      summary = new SpeechSynthesisUtterance(
        `Summary: ${article.summary}`
      );
      if (this.voice) summary.voice = this.voice;
      summary.rate = this.rate;
      summary.onerror = (event) => handleUtteranceError(event, 'summary');
    }

    // Create content utterance
    const content = new SpeechSynthesisUtterance(article.content);
    if (this.voice) content.voice = this.voice;
    content.rate = this.rate;

    // Set up completion handling for content
    content.onend = async () => {
      // Mark article as listened
      try {
        await markAsListened(article.id);
      } catch (error) {
        console.error('Failed to mark article as listened:', error);
      }

      // Remove the current article from the queue
      const indexToRemove = this.currentArticleIndex;
      this.queue = this.queue.filter((_, index) => index !== indexToRemove);

      // Adjust current index if needed
      if (this.queue.length > 0) {
        // If we were at the end, go back to start
        if (this.currentArticleIndex >= this.queue.length) {
          this.currentArticleIndex = 0;
        }
        // Otherwise keep the same index (next article has shifted down)
        this.notifyListeners();
        this.playNext();
      } else {
        // No more articles in queue
        this.stopInternal();
      }
    };

    // Handle errors for content
    content.onerror = (event) => handleUtteranceError(event, 'content');

    // Play the sequence with proper chaining
    this.currentUtterance = intro;
    window.speechSynthesis.speak(intro);

    intro.onend = () => {
      if (summary) {
        this.currentUtterance = summary;
        window.speechSynthesis.speak(summary);
        summary.onend = () => {
          this.currentUtterance = content;
          window.speechSynthesis.speak(content);
        };
      } else {
        this.currentUtterance = content;
        window.speechSynthesis.speak(content);
      }
    };
  }

  togglePlayPause() {
    if (!this.isPlaying && !this.isPaused) {
      // If nothing is playing, start playing if there's something in the queue
      if (this.queue.length > 0) {
        if (this.currentArticleIndex < 0) {
          this.currentArticleIndex = 0;
        }
        this.playNext();
      }
      return;
    }

    if (this.ttsConfig.provider === 'openai') {
      // Web Audio API doesn't support pause/resume easily
      // For now, just toggle the playing state flag
      // Full pause would require tracking position and restarting
      if (this.currentAudioSource && this.audioContext) {
        if (this.isPaused) {
          // Resume: we'd need to recreate the source, for now just unpause flag
          this.audioContext.resume();
          this.isPaused = false;
          this.isPlaying = true;
        } else {
          // Pause: suspend the audio context
          this.audioContext.suspend();
          this.isPaused = true;
          this.isPlaying = true;
        }
      }
    } else {
      if (this.isPaused) {
        // Resume speech
        window.speechSynthesis.resume();
        this.isPaused = false;
        this.isPlaying = true;
        this.startChromePauseWorkaround();
      } else {
        // Pause speech
        window.speechSynthesis.pause();
        this.isPaused = true;
        this.isPlaying = true;
        this.stopChromePauseWorkaround();
      }
    }
    this.notifyListeners();
  }

  next() {
    // Stop current playback
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentAudioSource = null;
    }
    window.speechSynthesis.cancel();

    // If nothing is playing or queue is empty, nothing to do
    if (this.currentArticleIndex < 0 || this.queue.length === 0) {
      return;
    }

    // Remove the current article from the queue
    this.queue.splice(this.currentArticleIndex, 1);
    this.notifyListeners();

    // Check if there are more items
    if (this.queue.length > 0) {
      // Adjust index if needed (if we were at the end)
      if (this.currentArticleIndex >= this.queue.length) {
        this.currentArticleIndex = 0;
      }
      // Play the next item (which is now at currentArticleIndex after splice)
      this.playArticle(this.queue[this.currentArticleIndex]);
    } else {
      // No more articles - clear everything
      this.stopInternal();
    }
  }

  previous() {
    if (this.currentArticleIndex > 0 && this.queue.length > 0) {
      // Calculate the new index first
      const prevIndex = this.currentArticleIndex - 1;

      // Cancel current playback
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }
      if (this.currentAudioSource) {
        try {
          this.currentAudioSource.stop();
        } catch (e) {
          // Ignore if already stopped
        }
        this.currentAudioSource = null;
      }
      window.speechSynthesis.cancel();

      // Set the new index
      this.currentArticleIndex = prevIndex;

      // Play the previous article
      this.playArticle(this.queue[prevIndex]);
    }
  }

  // Internal stop that doesn't notify (used when transitioning between states)
  private stopInternal() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentAudioSource = null;
    }
    // Resume audio context if it was suspended for pause
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    window.speechSynthesis.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.currentUtterance = null;
    this.currentArticle = null;
    this.currentArticleIndex = -1;
    this.stopChromePauseWorkaround();
    this.notifyListeners();
  }

  stop() {
    this.stopInternal();
  }

  clearQueue() {
    this.queue = [];
    this.stop();
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getCurrentArticle(): QueuedArticle | null {
    return this.currentArticle;
  }

  getQueuedArticles(): QueuedArticle[] {
    return [...this.queue];
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  isPausedState(): boolean {
    return this.isPaused;
  }

  getCurrentIndex(): number {
    return this.currentArticleIndex;
  }

  // Check if there's a next item available (for UI button state)
  hasNext(): boolean {
    // There's a "next" if we have more than one item in queue
    // (current one will be removed, so need at least 2)
    return this.queue.length > 1;
  }

  // Check if there's a previous item available (for UI button state)
  hasPrevious(): boolean {
    return this.currentArticleIndex > 0 && this.queue.length > 0;
  }
}

// Create a singleton instance
const ttsService = new TTSService();
export default ttsService;
