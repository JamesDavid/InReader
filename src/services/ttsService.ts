import { type FeedEntry } from './db';
import { db, markAsListened } from './db';

interface QueuedArticle {
  id: number;
  title: string;
  source: string;
  summary?: string;
  content: string;
}

class TTSService {
  private queue: QueuedArticle[] = [];
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private rate: number = 1;
  private currentArticle: QueuedArticle | null = null;
  private currentArticleIndex: number = -1;
  private listeners: Set<() => void> = new Set();
  private audioContext: AudioContext | null = null;

  constructor() {
    // Initialize AudioContext
    this.audioContext = new AudioContext();

    // Load saved preferences
    const savedVoice = localStorage.getItem('selectedVoice');
    const savedRate = localStorage.getItem('speechRate');
    
    if (savedRate) {
      this.rate = parseFloat(savedRate);
    }

    // Initialize voice when available
    const loadVoice = () => {
      if (savedVoice) {
        const voices = window.speechSynthesis.getVoices();
        this.voice = voices.find(v => v.name === savedVoice) || null;
      }
    };

    loadVoice();
    window.speechSynthesis.onvoiceschanged = loadVoice;
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
  }

  updateRate(rate: number) {
    this.rate = rate;
  }

  private playAddToQueueSound() {
    if (!this.audioContext) return;
    
    // Create oscillator and gain nodes
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    // Set up oscillator
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5 note
    oscillator.frequency.setValueAtTime(1108.73, this.audioContext.currentTime + 0.1); // C#6 note
    
    // Set up gain (volume envelope)
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, this.audioContext.currentTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.2);
    
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    // Play sound
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.2);
  }

  private playDuplicateSound() {
    if (!this.audioContext) return;
    
    // Create oscillator and gain nodes
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    // Set up oscillator for a descending tone (sad sound)
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4 note
    oscillator.frequency.linearRampToValueAtTime(330, this.audioContext.currentTime + 0.2); // E4 note
    
    // Set up gain (volume envelope)
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, this.audioContext.currentTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
    
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    // Play sound
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.3);
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

    // If not currently playing, start playing
    if (!this.isPlaying) {
      this.currentArticleIndex = this.queue.length - 1;
      this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.isPaused = false;
      this.currentArticle = null;
      this.currentArticleIndex = -1;
      this.notifyListeners();
      return;
    }

    if (this.currentArticleIndex === -1) {
      this.currentArticleIndex = 0;
    }

    const article = this.queue[this.currentArticleIndex];
    await this.playArticle(article);
  }

  private async playArticle(article: QueuedArticle) {
    this.isPlaying = true;
    this.currentArticle = article;
    this.notifyListeners();
    
    // Create introduction utterance
    const intro = new SpeechSynthesisUtterance(
      `Now reading: ${article.title} from ${article.source}`
    );
    if (this.voice) intro.voice = this.voice;
    intro.rate = this.rate;

    // Create summary utterance if available
    let summary: SpeechSynthesisUtterance | null = null;
    if (article.summary) {
      summary = new SpeechSynthesisUtterance(
        `Summary: ${article.summary}`
      );
      if (this.voice) summary.voice = this.voice;
      summary.rate = this.rate;
    }

    // Create content utterance
    const content = new SpeechSynthesisUtterance(article.content);
    if (this.voice) content.voice = this.voice;
    content.rate = this.rate;

    // Set up completion handling
    content.onend = async () => {
      // Mark article as listened
      await markAsListened(article.id);

      // Remove the current article from the queue
      this.queue = this.queue.filter((_, index) => index !== this.currentArticleIndex);

      // Adjust current index if needed
      if (this.queue.length > 0) {
        // If we were at the end, go back to start
        if (this.currentArticleIndex >= this.queue.length) {
          this.currentArticleIndex = 0;
        }
        // Otherwise keep the same index (next article has shifted down)
        this.playNext();
      } else {
        // No more articles in queue
        this.isPlaying = false;
        this.isPaused = false;
        this.currentUtterance = null;
        this.currentArticle = null;
        this.currentArticleIndex = -1;
        this.notifyListeners();
      }
    };

    // Handle errors
    content.onerror = (event) => {
      console.error('TTS Error:', event);
      // Remove the problematic article from queue
      this.queue = this.queue.filter((_, index) => index !== this.currentArticleIndex);
      
      if (this.queue.length > 0) {
        // If we were at the end, go back to start
        if (this.currentArticleIndex >= this.queue.length) {
          this.currentArticleIndex = 0;
        }
        // Otherwise keep the same index (next article has shifted down)
        this.playNext();
      } else {
        // No more articles in queue
        this.isPlaying = false;
        this.isPaused = false;
        this.currentUtterance = null;
        this.currentArticle = null;
        this.currentArticleIndex = -1;
        this.notifyListeners();
      }
    };

    // Play the sequence
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
        this.playNext();
      }
      return;
    }

    if (this.isPaused) {
      // Resume speech
      window.speechSynthesis.resume();
      this.isPaused = false;
      this.isPlaying = true;
    } else {
      // Pause speech
      window.speechSynthesis.pause();
      this.isPaused = true;
      this.isPlaying = true;
    }
    this.notifyListeners();
  }

  next() {
    // Stop current speech first
    window.speechSynthesis.cancel();

    // Check if there's a next article after the current one
    if (this.currentArticleIndex < this.queue.length - 1) {
      // Remove the current article from the queue
      if (this.currentArticleIndex >= 0) {
        this.queue.splice(this.currentArticleIndex, 1);
        // Don't increment the index since we removed the current item
        // and the next item has shifted down to the current index
      }

      // Start playing the next item (which is now at the current index)
      if (this.currentArticleIndex < this.queue.length) {
        const nextArticle = this.queue[this.currentArticleIndex];
        this.playArticle(nextArticle);
      } else {
        // Safety check: if index is somehow out of bounds, stop
        this.stop();
      }
    } else {
      // If we're at the end, stop and clear the queue
      this.clearQueue();
    }
  }

  previous() {
    if (this.currentArticleIndex > 0) {
      this.currentArticleIndex--;
      this.stop();
      this.playArticle(this.queue[this.currentArticleIndex]);
    }
  }

  stop() {
    window.speechSynthesis.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.currentUtterance = null;
    this.currentArticle = null;
    this.currentArticleIndex = -1;
    this.notifyListeners();
  }

  clearQueue() {
    this.queue = [];
    this.stop();
    this.currentArticleIndex = -1;
    this.notifyListeners();
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
}

// Create a singleton instance
const ttsService = new TTSService();
export default ttsService; 