# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Root Level (Workspace Management)
- `npm run dev` - Start both backend and extension in development mode concurrently
- `npm run build` - Build both backend and extension for production
- `npm test` - Run tests for both backend and extension
- `npm run lint` - Lint both backend and extension
- `npm run typecheck` - Type check both backend and extension
- `npm run clean` - Clean all build artifacts and node_modules

### Backend Development
- `cd backend && npm run dev` - Start backend API server with hot reload using tsx
- `cd backend && npm run build` - Build TypeScript to JavaScript in `dist/`
- `cd backend && npm run check` - Check availability of external services (PostgreSQL, Redis, OpenAI, etc.)
- `cd backend && npm run checklist:demo` - Run demo checklist script
- `cd backend && npm run db:migrate` - Run Knex migrations to latest
- `cd backend && npm run db:rollback` - Rollback last migration
- `cd backend && npm run db:seed` - Run database seeds

### Extension Development
- `cd extension && npm run dev` - Start development build with watch mode
- `cd extension && npm run dev:hot` - Start development with hot reload (includes auto-dependency installation)
- `cd extension && npm run build` - Production build for Chrome & Firefox bundles
- Load unpacked extension from `extension/dist/chrome/` in Chrome (Firefox: load temporary add-on from `extension/dist/firefox/manifest.json`)

## Architecture Overview

This is a **monorepo** containing a QA Command Center platform with two main components:

### 1. Backend (`backend/`) - Express.js API Server
**Core Framework**: Express.js with TypeScript, Socket.io for real-time communication
**Database Stack**: PostgreSQL with Knex.js query builder, Redis for caching/sessions
**AI Integration**: OpenAI API for AI-powered issue generation, Anthropic Claude for advanced capabilities
**External Services**: GitLab API (OAuth + issue creation), Slack API (notifications)

**Key Design Patterns**:
- **Graceful degradation** - Server starts even when external services are unavailable
- **Service availability checking** - Built-in validation via `npm run check`
- **Zero configuration development** - Sensible defaults with auto-generated JWT secrets
- **Centralized environment management** - `EnvConfig` class with validation

**Critical Services**:
- `database.ts` - PostgreSQL connection with connection pooling
- `redis.ts` - Redis client for caching and session management
- `openai.ts` - OpenAI API integration for AI features
- `gitlab.ts` - GitLab API integration for issue management and OAuth
- `slack.ts` - Slack API for team notifications
- `websocket.ts` - Socket.io real-time communication
- `auth.ts` - JWT authentication with refresh tokens

### 2. Extension (`extension/`) - Chrome MV3 / Firefox MV2
**Framework**: React 18 + TypeScript with Webpack 5 build system
**UI Library**: Tailwind CSS + shadcn/ui components with Radix UI primitives
**State Management**: Redux Toolkit + React Query for server state
**Architecture**: Chrome ships a service-worker background (MV3) while Firefox uses a persistent background script (MV2), alongside shared content scripts, popup, and options page

**Key Components**:
- **Background Service Worker** (`src/background/index.ts`) - Handles API requests, authentication, file uploads
- **Content Scripts** (`src/content/`) - Injected into web pages for context capture and floating UI
- **Popup** (`src/popup/`) - Extension popup interface for quick actions
- **Options Page** (`src/options/`) - Settings and configuration interface

**Critical Design Patterns**:
- **Fetch Bridge Pattern** - Routes UI requests through background script to avoid CORS
- **Message Passing System** - Typed interfaces for all extension communication
- **Manifest Differences** - Guard MV3-only APIs (e.g., `chrome.scripting`) for Firefox MV2, and avoid relying on long-lived globals in Chrome's service worker
- **Auto Token Refresh** - Automatic JWT refresh on 401 responses

## Development Workflow

### Initial Setup
1. **Service Check**: Run `cd backend && npm run check` to validate external service availability
2. **Environment Setup**: Copy `.env.example` to `.env` in backend directory
3. **Development**: Use `npm run dev` from root to start both services concurrently
4. **Extension Loading**: Load unpacked extension from `extension/dist/chrome/` in Chrome (or `extension/dist/firefox/manifest.json` in Firefox)

### Common Development Tasks
1. **Database Changes**: Use `cd backend && npm run db:migrate` after schema modifications
2. **New Backend Routes**: Follow existing patterns in `backend/src/routes/`
3. **Extension Features**: Use message passing system defined in `extension/src/types/messages.ts`
4. **Testing**: Run tests individually via `cd backend && npm test` or `cd extension && npm test`

### Code Quality
- **Linting**: Both projects use ESLint with TypeScript rules
- **Type Checking**: Strict TypeScript configuration enabled
- **Path Aliases**: Use `@/` for `src/` imports in both projects

## Key Integration Points

### Authentication Flow
1. **OAuth Initiation**: Extension popup → Background service → Backend `/auth/gitlab`
2. **Token Management**: Background service manages JWT refresh automatically
3. **Cross-Context Auth**: All extension contexts receive auth updates via message passing

### Issue Creation Workflow
1. **Context Capture**: Content script captures page context, screenshots, console errors
2. **AI Processing**: Backend OpenAI service generates intelligent issue descriptions
3. **GitLab Integration**: Direct issue creation via GitLab API with webhook support
4. **Real-time Updates**: Socket.io broadcasts issue status changes

### File Upload System
1. **Extension Capture**: Content scripts capture screenshots and attachments
2. **Background Upload**: Service worker handles file uploads with auth retry
3. **Backend Processing**: Sharp for image processing, Supabase/local storage options
4. **AI Enhancement**: File content can be analyzed for better issue descriptions

## Service Dependencies & Fallbacks

### Required Services
- **PostgreSQL** - Primary database (graceful startup failure if unavailable)
- **Redis** - Session storage and caching (optional, fallback to in-memory)

### Optional Services (with graceful degradation)
- **OpenAI API** - AI features disabled if API key not provided
- **GitLab OAuth** - GitLab integration disabled if credentials missing
- **Slack API** - Notifications disabled if credentials missing

### Development vs Production
- **Development**: Auto-generates JWT secrets, relaxed CORS, detailed logging
- **Production**: Requires explicit JWT secrets, strict security headers, optimized builds

## Testing Strategy

### Backend Testing
- **Unit Tests**: Jest with supertest for API endpoint testing
- **Integration Tests**: Database and external service integration
- **Service Tests**: Individual service unit testing with mocks

### Extension Testing
- **Unit Tests**: Jest with React Testing Library
- **Component Tests**: shadcn/ui component integration testing
- **E2E Considerations**: Content script injection testing across different page types

## Security Considerations

### Backend Security
- **JWT Authentication** with refresh tokens and automatic rotation
- **CORS Configuration** with wildcard support for chrome-extension:// origins
- **Input Validation** via Joi schemas on all API endpoints
- **Rate Limiting** removed at application level (GitLab API limits apply upstream)

### Extension Security
- **Manifest V3 Compliance** with service worker architecture
- **Content Security Policy** with secure-by-default directives
- **Message Validation** with typed interfaces for all communications
- **Permission Minimization** only requesting necessary Chrome APIs

## Deployment Notes

### Backend Deployment
- **Database Migrations**: Run `npm run db:migrate` before deployment
- **Environment Validation**: `EnvConfig.validate()` ensures critical variables are set
- **Health Checks**: `/health` endpoint validates all service dependencies
- **Graceful Shutdown**: Proper cleanup of database and Redis connections

### Extension Deployment
- **Build Process**: `npm run build` creates production-optimized bundle
- **Asset Optimization**: Webpack code splitting (disabled for background/content scripts)
- **Hot Reload**: Development-only WebSocket connection for auto-reload
- **Chrome Store**: Extension manifest includes all required permissions and CSP

## Known Limitations & Workarounds

### Extension Limitations
- **Content Script Injection**: Fails on chrome://, extension://, and some restricted pages
- **Service Worker Lifecycle**: May terminate unexpectedly, requiring port-based keepalive
- **CORS Restrictions**: UI contexts must route requests through background script
- **File Upload Size**: Limited by Chrome extension message passing (handled via FormData in background)

### Backend Limitations
- **External Service Dependencies**: OpenAI rate limits may affect AI feature performance
- **GitLab API Limits**: Upstream rate limiting affects issue creation frequency
- **WebSocket Scaling**: Single-server Socket.io setup (not horizontally scalable without Redis adapter)

## Integration Examples

### Creating New API Endpoints
```typescript
// backend/src/routes/example.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware); // Protected routes
router.post('/endpoint', async (req, res) => {
  // Implementation with proper error handling
});
export { router as exampleRouter };
```

### Extension Message Handling
```typescript
// extension/src/background/index.ts
case MessageType.NEW_FEATURE:
  const result = await apiService.callBackend(message.data);
  sendResponse({ success: true, data: result });
  break;

// extension/src/content/feature.ts
const response = await chrome.runtime.sendMessage({
  type: MessageType.NEW_FEATURE,
  data: payload
});
```

## Important File Locations

### Backend
- **Main Entry**: `backend/src/server.ts` - Express app initialization
- **Environment Config**: `backend/src/config/env.ts` - Centralized configuration
- **Database Schema**: Referenced in `database.ts` but migrations not found in repo
- **Service Checking**: `backend/src/scripts/check-services.ts`

### Extension
- **Background Worker**: `extension/src/background/index.ts` - Service worker entry
- **Content Script**: `extension/src/content/simple-trigger.ts` - Page injection entry
- **Message Types**: `extension/src/types/messages.ts` - All extension communication interfaces
- **Webpack Config**: `extension/webpack.config.js` - Build configuration with path aliases
