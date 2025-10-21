# AGENTS.md

This file provides guidance to AI coding agents (e.g., OpenAI Codex CLI, Claude, Cursor, Copilot Chat) when working with code in this repository.

## Project Overview

QA Command Center is an AI-powered quality assurance platform consisting of:
- **Backend**: Node.js/Express API server with PostgreSQL database
- **Extension**: Chrome browser extension built with React and TypeScript
- **Integration**: GitLab, Slack, and OpenAI integrations for automated testing workflows

This is a monorepo with two main workspaces (`backend/` and `extension/`) managed through npm workspaces.

## Development Commands

### Root Level Commands (runs both backend and extension)
```bash
npm run dev                    # Start both backend and extension in development mode
npm run build                  # Build both backend and extension for production
npm run test                   # Run tests for both projects
npm run lint                   # Lint both projects
npm run typecheck              # Type check both projects
npm run format                 # Format code with Prettier
npm run clean                  # Clean all build artifacts and node_modules
```

### Backend Commands
```bash
cd backend
npm run dev                    # Start development server with hot reload (tsx watch)
npm run build                  # Build TypeScript to dist/
npm run start                  # Start production server from dist/
npm run check                  # Check service dependencies (database, Redis)
npm test                       # Run Jest tests
npm run test:watch             # Run tests in watch mode
npm run test:coverage          # Run tests with coverage
npm run lint                   # ESLint with TypeScript support
npm run lint:fix               # Auto-fix linting issues
npm run typecheck              # TypeScript type checking without emit
npm run db:migrate             # Run database migrations
npm run db:rollback            # Rollback last migration
npm run db:seed                # Run database seeds
```

### Extension Commands
```bash
cd extension
npm run dev                    # Webpack development build with watch mode
npm run dev:hot                # Development with hot reload and file watching
npm run build                  # Webpack production build
npm test                       # Run Jest tests
npm run test:watch             # Run tests in watch mode
npm run typecheck              # TypeScript type checking
npm run lint                   # ESLint for TypeScript and React
npm run clean                  # Remove dist/ directory
```

### Docker Commands
```bash
docker-compose up -d           # Start all services (PostgreSQL, Redis, backend)
docker-compose -f docker-compose.dev.yml up  # Development environment
docker-compose logs -f backend # View backend logs
docker-compose exec backend npm run db:migrate  # Run migrations in container
```

## Architecture

### Backend Architecture (`backend/src/`)
- **Express.js** server with TypeScript
- **Database**: PostgreSQL with Knex.js migrations and query builder
- **Authentication**: JWT-based with passport strategies for GitLab OAuth
- **Real-time**: WebSocket support via Socket.IO
- **Services**: 
  - `services/database.ts` - Database connection and queries
  - `services/redis.ts` - Redis caching and sessions
  - `services/gitlab.ts` - GitLab API integration
  - `services/openai.ts` - AI-powered issue generation
  - `services/slack.ts` - Slack notifications
  - `services/websocket.ts` - Real-time communication
- **Routes**: RESTful API endpoints in `routes/` (auth, users, projects, issues, webhooks)
- **Middleware**: Rate limiting, error handling, authentication

### Extension Architecture (`extension/src/`)
- **React + TypeScript** with modern UI components (Radix UI + Tailwind CSS)
- **Webpack** build system with hot reload capabilities
- **Multi-entry points**:
  - `background/` - Service worker for extension lifecycle
  - `content/` - Content scripts injected into web pages
  - `popup/` - Extension popup interface
  - `options/` - Settings/configuration page
- **State Management**: Redux Toolkit with React Query for API calls
- **UI Components**: Comprehensive component library in `components/ui/`
- **Services**: API communication and browser storage management

### Database Schema (`database/`)
- **Migrations**: Knex.js migrations in `migrations/` (users, teams, projects, issues)
- **Seeds**: Development data in `seeds/`
- **Schemas**: SQL schema definitions in `schemas/`

## Key Technologies

### Backend Stack
- Node.js 18+ with Express.js
- TypeScript with strict mode
- PostgreSQL with Knex.js
- Redis for caching and sessions
- OpenAI API for AI features
- GitLab API for issue management
- WebSocket (Socket.IO) for real-time features

### Extension Stack
- React 18 with TypeScript
- Tailwind CSS + Radix UI components
- Webpack 5 with hot reload
- Chrome Extension Manifest V3
- Redux Toolkit + React Query

### Development Tools
- Jest for testing (both backend and extension)
- ESLint + TypeScript ESLint
- Prettier for code formatting
- Docker and Docker Compose

## Environment Configuration

Required environment variables (create `.env` in project root):
```env
# Database
DATABASE_URL=postgresql://qa_user:qa_password@localhost:5432/qa_command_center
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your_jwt_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret

# Integrations
GITLAB_CLIENT_ID=your_gitlab_client_id
GITLAB_CLIENT_SECRET=your_gitlab_client_secret
OPENAI_API_KEY=your_openai_api_key

# Optional
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
```

## Testing Strategy

- **Backend**: Jest with Supertest for API testing
- **Extension**: Jest with React Testing Library
- **Database**: Test migrations and seeds in `database/`
- **Integration**: API integration tests in `backend/tests/`
- **E2E**: End-to-end tests planned in `tests/e2e/`

Run `npm run test:coverage` to ensure good test coverage across the codebase.

## Extension Development Notes

- Load the extension in Chrome by enabling Developer mode at `chrome://extensions/` and loading the `extension/dist/chrome/` folder (Firefox: load temporary add-on from `extension/dist/firefox/manifest.json`)
- The extension uses Manifest V3 with service workers for Chrome and a Manifest V2 background script fallback for Firefox
- Hot reload is available in development mode via `npm run dev:hot`
- Content scripts communicate with the background script via Chrome messaging API
- UI components follow the established Radix UI + Tailwind pattern

## Common Development Workflow

1. Start services: `docker-compose up -d` (PostgreSQL, Redis)
2. Run migrations: `cd backend && npm run db:migrate`
3. Start development: `npm run dev` (both backend and extension)
4. Load extension in Chrome from `extension/dist/chrome/` (or Firefox from `extension/dist/firefox/`)
5. Run tests: `npm test`
6. Check types and lint: `npm run typecheck && npm run lint`
