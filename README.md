# 📚 InReader

> A modern, keyboard-driven RSS feed reader that brings back the magic of Google Reader with AI superpowers! 🚀

InReader combines the beloved simplicity of Google Reader with modern features like AI-powered summaries, chat capabilities, and a beautiful dark mode. Perfect for power users who love keyboard shortcuts and AI enthusiasts who want to chat with their articles!

## ✨ Key Features

### 🎯 Core Features
- **Smart Feed Management** - Subscribe, organize, and never miss important content
- **AI-Powered Summaries** - Get the TL;DR with intelligent article summaries
- **Chat with Articles** - Have conversations about any article with AI
- **Keyboard Warrior Mode** - Navigate at the speed of thought with vim-style shortcuts
- **Dark Mode** - Easy on the eyes, day or night
- **Text-to-Speech** - Listen to your articles while multitasking
- **Synchronized Navigation** - Seamless keyboard and mouse navigation with URL sync

### ⌨️ Keyboard Shortcuts

#### Navigation
- `j` - Move down one item
- `k` - Move up one item
- `h` - Return to feed list/sidebar
- `l` - Open selected article/move to article list
- `/` - Focus search bar
- `Escape` - Clear search/Close modals
- `Tab` - Switch focus between sidebar and main content

#### Article Management
- `m` - Mark item as read/unread
- `i` - Star/unstar item
- `o` - Open article in new tab
- `Space` - Scroll article / expand RSS content
- `u` - Refresh current feed
- `r` - Refresh all feeds
- `a` - Add new feed

#### Text-to-Speech & AI Features
- `[` - When article is in focus, add the current article to TTS queue
- `l` - When article is in focus, chat with current article
- `[` - When a feed is in focus, add 5 most recent unread items from current feed to TTS queue
- `]` - Skip to next TTS item
- `\` - Toggle TTS play/pause
- `p` - Pop to currently playing article

#### Playback Controls
- `]` - Next TTS item
- `\` - Play/Pause TTS
- `p` - Jump to currently playing article

### 🤖 AI Capabilities
- Local LLM support via Ollama for privacy
- Intelligent content extraction
- Streaming chat responses
- Configurable AI models

### 🎧 TTS Features
- Queue management for articles
- Automatic duplicate detection
- Progress tracking
- Queue status indicator in header

### ⌨️ Power User Features
- Vim-style keyboard navigation (`j`, `k`, `h`, `l`)
- Quick search with `/`
- Smart content interaction with `Space`
- Full keyboard control for everything!
- Smooth selection syncing between keyboard and mouse interactions
- Smart URL state management

## 🚀 Getting Started

### Prerequisites
- Node.js
- npm or yarn
- Ollama (for AI features)

### Quick Start
```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Start the development server
npm run dev
```

## 🛠️ Tech Stack
- ⚛️ React
- 📘 TypeScript
- 🎨 Tailwind CSS
- 💾 Dexie.js (IndexedDB)
- ⚡ Vite
- 🤖 React Router

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

## 🔄 State Management
- Uses React's built-in state management with hooks
- IndexedDB for persistent storage via Dexie.js
- Real-time feed refresh tracking
- Efficient unread count management
- Smart selection state synchronization
- URL-based navigation state

## 🎯 Implementation Details
- **Feed Parsing**: Server-side feed parsing with error handling
- **Folder Management**: Drag-and-drop ready folder structure
- **Search Integration**: Built-in search with history tracking
- **Responsive Design**: Mobile-friendly layout with Tailwind CSS
- **Type Safety**: Full TypeScript implementation
- **Navigation**: Synchronized keyboard and mouse navigation with URL state
- **Selection Management**: Smart selection handling to prevent conflicts

## 🤝 Contributing
Contributions are welcome! Whether it's a bug fix, feature enhancement, or documentation improvement, feel free to make a pull request.

## 📝 License
MIT License - feel free to use this project however you'd like!

---
<p align="center">Made with ❤️ for RSS enthusiasts and AI explorers</p>
