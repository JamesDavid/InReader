# 📚 InReader

> A modern, keyboard-driven RSS feed reader that brings back the magic of Google Reader with AI! 🚀

InReader combines the beloved simplicity of Google Reader with modern features like AI-powered summaries, chat capabilities, and a beautiful dark mode. Perfect for power users who love keyboard shortcuts and AI enthusiasts who want to chat with their articles!

**All data is stored locally in your browser.** Feeds, articles, read/star state, AI summaries, chat history, and your interest profile all live in IndexedDB — nothing is sent to a remote server. Your reading data stays on your device.

## ✨ Key Features

### 🎯 Core Features
- **Smart Feed Management** - Subscribe, organize, and refresh feeds with automatic content extraction
- **Feed Organization** - Folder support with drag-and-drop organization
- **OPML Import/Export** - Import feeds from other readers or export your subscriptions as standard OPML files
- **Visual Feed Status** - Color-coded unread badges to track content freshness
- **Full Article Extraction** - Automatic fetching of complete article content
- **AI-Powered Summaries** - LLM summaries via Ollama (local/LAN), OpenAI, or Anthropic Claude
- **AI Interest Tagging & Recommendations** - Articles are automatically tagged by the AI during summarization. Star or listen to articles to build an interest profile, and discover new content in the Recommended view
- **Chat with Articles** - Interactive AI discussions about article content
- **Keyboard-First Design** - Vim-style navigation and comprehensive shortcuts
- **Mobile Touch Gestures** - Swipe left to mark read & advance, swipe right for quick actions, long press for all actions
- **Mobile-Responsive UI** - Collapsible sidebar with hamburger menu, gesture-driven entry management
- **Dark Mode** - Modern, eye-friendly dark theme
- **Text-to-Speech** - Queue-based article playback with progress tracking
- **Smart Navigation** - URL-synced navigation with keyboard and mouse support
- **Local-First Storage** - All data stored in IndexedDB in your browser; nothing leaves your device
- **Search** - Full-text search with saved search history

### 🔄 Technical Features
#### Feed System
- Parallel feed refresh with stalled entry detection
- Smart duplicate entry detection
- Automatic metadata extraction
- Unread count tracking with visual indicators

#### Article Management
- Full article content extraction with RSS preview fallback
- Read/unread and star/favorite system
- Multiple viewing options (inline, new tab, reusable window)
- Processing status indicators with error handling

#### AI & TTS Integration
- **Three AI providers** — Ollama (local/LAN), OpenAI, or Anthropic Claude
- **Ollama** runs entirely on your own hardware for full privacy; supports LAN servers (e.g., `http://192.168.x.x:11434`)
- **OpenAI / Claude** require an API key and send article content to external APIs for processing
- Configurable models per task (separate models for summaries and chat)
- Streaming chat responses with history tracking
- Queue-based TTS playback with progress tracking
- Automatic duplicate detection in TTS queue

#### Interest Tagging & Recommendations
- AI summaries automatically extract topic tags from each article (3–8 tags per article)
- Starring or listening to an article adds its tags to your interest profile
- All tagged articles are scored against your profile — higher overlap means a higher score
- The **Recommended** sidebar view surfaces unread articles ranked by interest score
- Manage your interest profile in the AI Configuration → Recommendations tab: view collected tags with counts, delete individual tags, re-score entries, or clear the entire profile

#### OPML Import & Export
- **Import** — Load subscriptions from any standard OPML file exported by another feed reader. Feeds are mapped to folders based on the OPML outline structure, and duplicates are skipped automatically.
- **Export** — Download all your current subscriptions as an `.opml` file for backup or migration to another reader.
- Access both via the folder icon in the Subscriptions sidebar header.

#### Data & Search
- IndexedDB storage with automatic migrations
- Efficient batch operations and caching
- Full-text search with history tracking
- Result count and recency tracking

### ⌨️ Keyboard Shortcuts

#### Navigation
- `j` - Move down one item
- `k` - Move up one item
- `h` - Return to feed list/sidebar
- `l` - Open selected article/move to article list or open chat with current article
- `/` - Focus search bar
- `Escape` - Clear search/Close modals
- `Space` - Scroll article / expand article content

#### Article Management
- `m` - Toggle read/unread status
- `i` - Toggle star status
- `o` - Open article in new tab
- `0` - Open article in reusable window
- `u` - Refresh current article content and summary
- `'` - Copy article to clipboard
- `-` - Email article
- `r` - Refresh all feeds
- `a` - Add new feed

#### Text-to-Speech & AI Features
- `[` - Add current article to TTS queue (when in article list)
- `[` - Add 5 most recent unread items to TTS queue (when in feed list)
- `]` - Skip to next TTS item
- `\` - Toggle TTS play/pause
- `p` - Pop to currently playing article

### 📱 Mobile Touch Gestures
- **Swipe Left** - Mark entry as read and advance to next
- **Swipe Right** - Reveal quick-action strip (Star, Chat, Listen)
- **Long Press** - Open bottom sheet with all actions (read/unread, star, chat, listen, copy, email, share, refresh, open in browser)
- **Tap** - Select entry
- **Tap outside strip** - Close revealed action strip

> Tap the "InReader" title on mobile to see the gesture guide.

### 🎨 Visual Indicators

#### Feed Badge Colors
The unread count badge for each feed changes color based on the most recent unread entry:
- **Dark Purple** - Content from the last hour
- **Dark Blue** - Content from the last 24 hours
- **Light Blue** - Content from the last week
- **Gray** - Older content

This color-coding system helps you quickly identify feeds with fresh content and prioritize your reading.

## 🚀 Getting Started

### Prerequisites
- Node.js (for development)
- Docker (for production deployment)
- AI provider (optional): Ollama (local), an OpenAI API key, or an Anthropic API key

### Quick Start - Development
```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Start the development server (frontend + backend)
npm run dev
```

### Vercel Deployment (Recommended)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/JamesDavid/InReader)

Or deploy manually:
```bash
npm i -g vercel
vercel
```

### Docker Deployment (Self-hosted)
```bash
# Build and run with HTTPS (self-signed certificate)
docker-compose up --build

# Access at https://localhost:8443
# For network access: https://YOUR_IP:8443

# Use a custom port
PORT=9443 docker-compose up --build

# Run in background
docker-compose up -d

# Stop
docker-compose down
```

> **Note:** Docker uses a self-signed SSL certificate. Accept the browser warning on first access.

### AI Configuration
Click the lightning bolt icon in InReader to choose a provider and configure models.

#### Ollama (local / LAN — fully private)
1. Install [Ollama](https://ollama.ai/) on your machine or a server on your LAN
2. Pull a model: `ollama pull llama3.2` (or any preferred model)
3. For LAN access, start Ollama with: `OLLAMA_HOST=0.0.0.0 ollama serve`
4. Enter your Ollama server URL:
   - Local: `http://localhost:11434`
   - LAN: `http://192.168.x.x:11434` (your server's IP)

> **Note:** For Vercel deployments, your Ollama server must be publicly accessible. For Docker/self-hosted, LAN servers work via the built-in proxy.

#### OpenAI
1. Enter your OpenAI API key
2. Select models for summaries and chat (e.g., `gpt-4o-mini`, `gpt-4o`)

#### Anthropic Claude
1. Enter your Anthropic API key
2. Select models for summaries and chat (e.g., `claude-sonnet-4-20250514`)

> **Privacy note:** Ollama keeps all processing on your own hardware. OpenAI and Claude send article content to external APIs. All other data (feeds, read state, stars, interest profile) is always stored locally regardless of AI provider.

## Tech Stack
- React 18
- TypeScript
- Tailwind CSS
- Dexie.js (IndexedDB)
- Vite
- Express.js (backend API)
- Docker + nginx
- HTTPS with self-signed certificates

## Project Structure

```
src/
├── components/
│   ├── Layout.tsx          # Main layout with modal management
│   ├── Sidebar.tsx         # Feed navigation and selection management
│   ├── FeedList.tsx        # Entry display and interaction
│   ├── FeedListEntry.tsx   # Individual entry orchestration
│   ├── Toast.tsx           # Toast notification component
│   ├── entry/              # Entry sub-components
│   │   ├── EntryHeader.tsx    # Status badges, title, action buttons
│   │   ├── EntryContent.tsx   # AI summary, markdown, action bar
│   │   └── EntryMobileActions.tsx # Swipe-revealed action strip
│   ├── SearchResults.tsx   # Search functionality
│   ├── Header.tsx          # Search and dark mode
│   ├── ChatModal.tsx       # Article chat interface
│   ├── AIConfigModal.tsx   # AI provider and recommendation config
│   └── FeedManagementModal.tsx # OPML import/export and feed management
├── hooks/
│   ├── useKeyboardNavigation.ts # All keyboard shortcut handling
│   ├── useEntryState.ts    # Entry state sync with events and DB
│   ├── useEntryScroll.ts   # Entry scroll behavior management
│   ├── useMobileDetection.ts # Mobile viewport detection
│   ├── useSwipeGesture.ts  # Touch swipe gesture handling
│   └── usePullToRefresh.ts # Pull-to-refresh gesture
├── utils/
│   ├── dateFormatters.ts   # Date formatting utilities
│   ├── contentFormatters.ts # Content formatting for sharing
│   ├── ttsHelpers.ts       # TTS queue item helpers
│   └── eventDispatcher.ts  # Type-safe custom event utilities
├── types/
│   └── events.ts           # Custom event type definitions
├── services/
│   ├── db.ts              # Database schema, operations, and queries
│   ├── aiService.ts       # AI provider integration (Ollama, OpenAI, Anthropic)
│   ├── interestService.ts # Tag extraction, interest profile, and scoring
│   ├── feedParser.ts      # Feed parsing, entry processing, and summarization
│   ├── articleService.ts  # Full article content extraction
│   ├── ttsService.ts      # Text-to-speech queue management
│   ├── opmlService.ts     # OPML import and export
│   └── paginationService.ts # Pagination management
└── App.tsx                # Root component and routes
```

## 🔄 License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0).

### What this means:
- ✅ You can freely use, modify, and distribute this software for non-commercial purposes
- ✅ You must give appropriate credit and indicate if changes were made
- ❌ You cannot use this software for commercial purposes without permission
- ℹ️ The original author retains all rights for commercial use

For more information, see the [full license text](https://creativecommons.org/licenses/by-nc/4.0/).

---
<p align="center">Made with ❤️ for RSS enthusiasts and AI explorers</p>
