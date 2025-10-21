# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build & Development
- `npm run dev` - Start development build with watch mode
- `npm run dev:hot` - Start development with hot reload (includes auto-dependency installation)
- `npm run build` - Production build
- `npm run clean` - Clean build artifacts

### Testing & Quality
- `npm run test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run typecheck` - Run TypeScript type checking

### Extension Development
- Load unpacked extension from `dist/chrome/` (Chrome) or `dist/firefox/` (Firefox temporary add-on)
- Use Chrome DevTools for debugging:
  - Background script: chrome://extensions/ → "background page"
  - Popup: Right-click extension popup → "Inspect"
  - Content script: Regular page DevTools, filter by extension ID

## Architecture Overview

### Browser Extension Structure
Chrome ships as a Manifest V3 extension, while the Firefox build uses a Manifest V2 background page fallback. Key components:

- **Background Service Worker** (`src/background/index.ts`) - Handles API requests, authentication, file uploads, and cross-context communication
- **Content Scripts** (`src/content/`) - Injected into web pages to capture context and show floating UI
- **Popup** (`src/popup/`) - Extension popup interface for quick actions
- **Options Page** (`src/options/`) - Settings and configuration interface

### Core Services Architecture

**API Service** (`src/services/api.ts`):
- Singleton service for all backend communication
- Handles authentication token management and auto-refresh
- Uses fetch bridge pattern to route requests through background script (avoids CORS)
- Supports both service worker and UI context execution

**Storage Service** (`src/services/storage.ts`):
- Wraps Chrome storage APIs with typed interfaces
- Manages user sessions, auth tokens, and settings
- Provides reactive updates via `onChanged` listeners

**Background Fetch Bridge** (`src/services/fetch-bridge.ts`):
- Routes UI context HTTP requests through background service worker
- Handles authentication headers automatically
- Supports file uploads and transcription requests

### Message Passing System

**Message Types** (`src/types/messages.ts`):
- Centralized enum for all extension message types
- Typed interfaces for requests and responses
- Covers authentication, issue creation, file operations, and AI services

**Communication Flow**:
- UI → Background: Uses `chrome.runtime.sendMessage()`
- Background → Content: Uses `chrome.tabs.sendMessage()`
- Port-based bridge for reliable background communication

### Technology Stack

**Frontend Framework**:
- React 18 with TypeScript
- Tailwind CSS + shadcn/ui component library
- Radix UI primitives for accessibility
- React Hook Form + Zod for form validation

**State Management**:
- Redux Toolkit for global state
- React Query for server state and caching
- Chrome storage for persistence

**Build System**:
- Webpack 5 with hot reload support
- TypeScript compilation with path aliases
- PostCSS with Tailwind processing
- Separate builds for each extension context

## Key Patterns & Conventions

### File Organization
- Use path aliases: `@/`, `@components/`, `@services/`, `@utils/`, `@types/`
- Group related functionality in feature folders
- Separate UI components from business logic

### Component Architecture
- Use shadcn/ui components for consistent design
- Implement compound component patterns for complex UI
- Prefer controlled components with React Hook Form
- Use TypeScript interfaces for all props

### Error Handling
- All API responses use consistent `ApiResponse<T>` interface
- Background script implements automatic token refresh on 401 errors
- Content script injection includes retry logic and error recovery

### Authentication Flow
- JWT tokens stored in Chrome storage
- Automatic refresh using refresh tokens
- OAuth integration for GitLab connection
- Session management across all extension contexts

### Development Environment
- Hot reload server for automatic extension reloading
- Source maps enabled for debugging
- File system caching for fast rebuilds
- ESLint + TypeScript for code quality

## Extension-Specific Considerations

### Content Script Limitations
- Cannot access extension storage directly
- Must communicate via message passing
- Injection may fail on certain pages (chrome://, extension pages)
- Always check for content script availability before messaging

### Manifest Requirements
- Chrome (MV3): background runs as a stateless service worker, so avoid global mutable state
- Firefox/Zen (MV2): background runs persistently via `background.scripts`, allowing long-lived state but no MV3-only APIs (`chrome.scripting` guarded already)
- In both builds, file uploads go through the background bridge and CSP disallows inline scripts

### Security Patterns
- All sensitive operations happen in background script
- Content scripts sanitize any injected HTML
- CSP restrictions prevent inline scripts
- API keys never exposed to content contexts

### Performance Considerations
- Background script may terminate unexpectedly
- Use port-based connections for long-running communications
- Implement debouncing for frequent operations
- Cache frequently accessed data in Chrome storage
