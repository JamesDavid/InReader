# 📚 InReader

> A modern, keyboard-driven RSS feed reader that brings back the magic of Google Reader with AI! 🚀

InReader combines the beloved simplicity of Google Reader with modern features like AI-powered summaries, chat capabilities, and a beautiful dark mode. Perfect for power users who love keyboard shortcuts and AI enthusiasts who want to chat with their articles!

## ✨ Key Features

### 🎯 Core Features
- **Smart Feed Management** - Subscribe, organize, and refresh feeds with automatic content extraction
- **Feed Organization** - Folder support with drag-and-drop organization
- **Visual Feed Status** - Color-coded unread badges to track content freshness
- **Full Article Extraction** - Automatic fetching of complete article content
- **AI-Powered Summaries** - Local LLM summaries via Ollama integration
- **Chat with Articles** - Interactive AI discussions about article content
- **Keyboard-First Design** - Vim-style navigation and comprehensive shortcuts
- **Dark Mode** - Modern, eye-friendly dark theme
- **Text-to-Speech** - Queue-based article playback with progress tracking
- **Smart Navigation** - URL-synced navigation with keyboard and mouse support
- **Offline Support** - IndexedDB-based local storage for articles and feeds
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
- Local LLM support via Ollama for privacy
- Configurable AI models for summaries
- Streaming chat responses with history tracking
- Queue-based TTS playback with progress tracking
- Automatic duplicate detection in TTS queue

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
- `r` - Refresh all feeds
- `a` - Add new feed

#### Text-to-Speech & AI Features
- `[` - Add current article to TTS queue (when in article list)
- `[` - Add 5 most recent unread items to TTS queue (when in feed list)
- `]` - Skip to next TTS item
- `\` - Toggle TTS play/pause
- `p` - Pop to currently playing article
- `Shift+P` - Go to previous page
- `Ctrl+P` - Go to next page

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
- Ollama (optional, for AI features)

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
│   ├── Layout.tsx        # Main layout and keyboard navigation
│   ├── Sidebar.tsx       # Feed navigation and selection management
│   ├── FeedList.tsx      # Entry display and interaction
│   ├── SearchResults.tsx # Search functionality
│   ├── Header.tsx        # Search and dark mode
│   ├── ChatModal.tsx     # Article chat interface
│   └── OllamaConfigModal.tsx # AI configuration
├── services/
│   ├── db.ts            # Database operations
│   ├── articleService.ts # Content extraction
│   ├── paginationService.ts # Pagination management
│   └── ollamaService.ts # AI integration
└── App.tsx              # Root component
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
