# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Extension Development

- `npm run dev` - Start development build with watch mode for the extension
- `npm run dev:extension` - Alias for `npm run dev` targeting the extension
- `npm run build` - Production build for Chrome & Firefox bundles
- `npm test` - Run extension test suite
- `npm run lint` - Lint extension code
- `npm run typecheck` - Type check extension code
- `npm run clean` - Clean build artifacts and node_modules

## Architecture Overview

This is a **standalone browser extension** for GitLab management. It interacts directly with the GitLab API and does not require a private backend.

### Extension Components (extension/)

**Framework**: React 18 + TypeScript with Webpack 5 build system
**UI Library**: Tailwind CSS + shadcn/ui components with Radix UI primitives
**State Management**: Local storage-based session management
**Architecture**: Chrome MV3 (service-worker) / Firefox MV2 (persistent background)

**Key Components**:

- **Background Service Worker** (`src/background/index.ts`) - Handles API requests, authentication, and cross-context communication
- **Content Scripts** (`src/content/`) - Injected into web pages for context capture and floating UI
- **Popup** (`src/popup/`) - Extension popup interface for quick actions
- **Options Page** (`src/options/`) - Settings and configuration interface

**Critical Design Patterns**:

- **Direct API Integration**: Communicates directly with `https://gitlab.com/api/v4` or private GitLab instances
- **Fetch Bridge Pattern**: Routes UI requests through background script to avoid CORS issues on content scripts
- **Message Passing System**: Typed interfaces for all extension communication via `src/types/messages.ts`
- **Manifest Portability**: Guarded logic for MV3/MV2 differences (e.g., `chrome.scripting` vs `chrome.tabs.executeScript`)

## Development Workflow

### Extension Loading

1. Run `npm run dev` to start the build process
2. Open Chrome/Edge: navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `extension/dist/chrome/` directory

### Common Tasks

- **Adding UI Components**: Use shadcn/ui patterns in `extension/src/components/`
- **New API Methods**: Add direct GitLab API calls to `extension/src/services/api.ts`
- **Communication**: Use the message system in `extension/src/types/messages.ts`
- **Persistence**: Use `extension/src/services/storage.ts` for all configuration

## Security & Privacy

- **Direct Auth**: Tokens are stored locally in encoded browser storage
- **No Private Backend**: All data remains between the user's browser and GitLab
- **Host Permissions**: Limited to GitLab domains and `<all_urls>` for self-hosted instances

## Testing Strategy

- **Unit Tests**: Jest with React Testing Library
- **Component Tests**: shadcn/ui component integration testing in isolation
- **Integration Tests**: Verification of message passing between background and content contexts

## Key File Locations

- **Background Entry**: `extension/src/background/index.ts`
- **API Service**: `extension/src/services/api.ts`
- **Storage Service**: `extension/src/services/storage.ts`
- **Message Types**: `extension/src/types/messages.ts`
- **Webpack Config**: `extension/webpack.config.js`
