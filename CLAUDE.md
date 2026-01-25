# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Start development (runs frontend + backend concurrently)
npm run dev

# Individual servers
npm run dev:frontend  # Vite dev server (port 5173)
npm run dev:backend   # Express API (port 3000)

# Build for production
npm run build         # TypeScript compile + Vite build

# Linting
npm run lint          # ESLint for .ts/.tsx files

# Docker (HTTPS with self-signed certificate)
docker-compose up --build    # Build and run (available at https://localhost:8443)
PORT=9443 docker-compose up  # Use custom port
docker-compose up -d         # Run in background
docker-compose down          # Stop containers
# Note: Accept the browser's certificate warning for self-signed cert
```

## Architecture Overview

InReader is a keyboard-driven RSS feed reader with AI integration, built as a local-first application.

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js (feed parsing + article extraction)
- **Database**: Dexie.js (IndexedDB wrapper) - all data stored locally in browser
- **AI**: Ollama (local LLM for summaries and chat)
- **Sync**: Gun.js (optional decentralized peer-to-peer feed sharing)

### Key Directories

```
src/
├── components/       # React UI components
│   ├── Layout.tsx    # Main layout, keyboard navigation hub (j/k/h/l vim keys)
│   ├── Sidebar.tsx   # Feed/folder navigation with drag-drop
│   ├── FeedList.tsx  # Entry list with pagination
│   ├── FeedListEntry.tsx  # Individual entry actions (read, star, TTS, AI)
│   ├── ChatModal.tsx # AI chat interface
│   └── sidebar/      # Sidebar sub-components
│
├── services/         # Business logic layer
│   ├── db.ts         # Dexie database schema & operations (schema v62020)
│   ├── feedParser.ts # RSS parsing, entry processing
│   ├── articleService.ts   # Full article extraction
│   ├── ollamaService.ts    # LLM streaming requests
│   ├── ttsService.ts       # Text-to-speech queue management
│   ├── gunService.ts       # Peer-to-peer sync
│   └── requestQueueService.ts  # p-queue concurrency control
│
└── types/            # TypeScript interfaces

server.js             # Express backend (POST /api/parse-feed, POST /api/fetch-article)
```

### Database Schema (db.ts)

Four main tables in IndexedDB:
- **feeds**: RSS feed subscriptions with folder organization
- **entries**: Feed items with content variants (RSS abstract, full article, AI summary)
- **folders**: Hierarchical folder structure
- **savedSearches**: Persisted search queries

Entry content is stored in three forms:
- `content_rssAbstract`: Original RSS content
- `content_fullArticle`: Extracted full article (Markdown)
- `content_aiSummary`: AI-generated summary

### Routes (React Router)

```
/                    → All entries
/feed/:feedId        → Single feed
/folder/:folderId    → Folder entries
/starred             → Starred entries
/listened            → TTS listened entries
/search/:query       → Search results
/chats               → Saved AI conversations
/gun/:pubKey         → Shared feed list (Gun.js)
```

### State Management

- **React hooks**: Local component state
- **localStorage**: User preferences (darkMode, ollamaConfig, gunConfig, selectedVoice)
- **IndexedDB**: All structured data via Dexie
- **CustomEvent**: Entry update notifications across components

### Key Patterns

1. **Keyboard Navigation**: Layout.tsx handles vim-style keys (j/k/h/l/o/s/m) via keydown handlers
2. **Request Queuing**: requestQueueService.ts uses p-queue for concurrent API/LLM requests
3. **Content Processing Pipeline**: RSS → Full Article Extraction → AI Summary (each optional)
4. **Entry Listeners**: db.ts exports listener system for real-time UI updates when entries change
