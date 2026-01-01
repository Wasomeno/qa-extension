# AGENTS.md

This file provides guidance to AI coding agents (e.g., Claude, Cursor, Copilot Chat) when working with code in this repository.

## Project Overview

QA Command Center is a standalone browser extension for GitLab management.

- **Extension**: Chrome browser extension built with React and TypeScript.
- **Architecture**: Standalone (No Private Backend).
- **Integration**: Communicates directly with GitLab API.

This repository is an extension-only workspace.

## Development Commands

### Common Commands

```bash
npm run dev                    # Start extension development build (watch mode)
npm run build                  # Build extension for production (dist/)
npm test                       # Run extension test suite
npm run lint                   # Lint extension code
npm run typecheck              # Type check extension code
npm run format                 # Format code with Prettier
npm run clean                  # Clean all build artifacts and node_modules
```

## Architecture

### Extension Architecture (`extension/src/`)

- **React + TypeScript** with modern UI components (Radix UI + Tailwind CSS).
- **Webpack 5** build system with hot reload.
- **Multi-entry points**:
  - `background/` - Service worker (Chrome MV3) or background script (Firefox MV2).
  - `content/` - Content scripts injected into web pages.
  - `popup/` - Extension popup interface.
  - `options/` - Settings/configuration page.
- **State Management**: Local storage-based session management (`services/storage.ts`).
- **Communication**: Fetch Bridge pattern routes UI requests through the background script to bypass CORS.

## Key Technologies

- **React 18** for UI.
- **Tailwind CSS + Radix UI** for styling and components.
- **GitLab API v4** for direct integration.
- **Webpack 5** build system.
- **Chrome Extension Manifest V3** (with MV2 support for Firefox/Zen).

## Environment Configuration

Environment variables are managed at build time via Webpack's DefinePlugin.
Currently, no private backend URL is required.

## Testing Strategy

- **Unit Tests**: Jest with React Testing Library.
- **Component Tests**: Verification of UI components in isolation.
- **Integration**: Verification of message passing between extension contexts.

## Extension Development Notes

- Load the extension in Chrome: navigate to `chrome://extensions/`, enable Developer mode, and load the `extension/dist/chrome/` folder.
- Firefox: load temporary add-on from `extension/dist/firefox/manifest.json`.
- The extension uses a **Fetch Bridge** to make requests from content scripts.
- Authentication data (GitLab tokens) is stored locally in `chrome.storage.local`.

## Common Development Workflow

1. Start development: `npm run dev`
2. Load extension in Chrome from `extension/dist/chrome/`.
3. Modify code and wait for Webpack to rebuild.
4. If modifying the background script, you may need to reload the extension via the Chrome extensions page.
5. Run tests: `npm test`
6. Check types and lint: `npm run typecheck && npm run lint`
