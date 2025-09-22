# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development & Testing
- `npm run dev` - Start development server with hot reload using tsx
- `npm run build` - Build TypeScript to JavaScript in `dist/`
- `npm start` - Start production server from built files
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Lint TypeScript files in `src/` directory
- `npm run lint:fix` - Auto-fix linting issues
- `npm run typecheck` - Type check without building

### Database Operations
- `npm run db:migrate` - Run Knex migrations to latest
- `npm run db:rollback` - Rollback last migration
- `npm run db:seed` - Run database seeds

### Service Management
- `npm run check` - Check availability of external services (PostgreSQL, Redis, OpenAI, etc.)
- `npm run checklist:demo` - Run demo checklist script

## Architecture Overview

### Core Framework & Libraries
- **Express.js** with TypeScript for the REST API
- **Socket.io** for real-time WebSocket communication
- **Knex.js** as the SQL query builder with PostgreSQL
- **Redis** for caching and session management
- **JWT** for authentication with refresh tokens
- **Joi** for request validation
- **Winston** for structured logging

### Service Integration
- **OpenAI API** - AI-powered issue generation and smart suggestions
- **GitLab API** - Issue creation and OAuth authentication
- **Slack API** - Team notifications and webhooks
- **Anthropic Claude** - Advanced AI capabilities

### Key Design Principles
- **Graceful degradation** - Server starts even when external services (PostgreSQL, Redis, OpenAI) are unavailable
- **Zero configuration** - Sensible defaults allow immediate development without setup
- **Service availability checking** - Built-in service status validation via `npm run check`
- **Clear error messaging** - Helpful setup instructions when services are missing

### Directory Structure
```
src/
├── config/          # Environment configuration (env.ts)
├── controllers/     # Request handlers
├── middleware/      # Express middleware (auth, error handling)
├── models/          # Data models
├── routes/          # API route definitions
├── services/        # Business logic services
├── scripts/         # Utility scripts (service checking, demos)
├── templates/       # Response templates
├── types/           # TypeScript type definitions
├── utils/           # Shared utilities
└── server.ts        # Main application entry point
```

### Key Services
- `database.ts` - PostgreSQL connection with Knex.js ORM
- `redis.ts` - Redis client for caching/sessions
- `openai.ts` - OpenAI API integration for AI features
- `gitlab.ts` - GitLab API integration
- `slack.ts` - Slack API integration
- `websocket.ts` - Socket.io real-time communication
- `auth.ts` - JWT authentication service

### Route Organization
- `/api/auth` - Authentication endpoints (login, register, refresh)
- `/api/users` - User management
- `/api/projects` - Project CRUD operations
- `/api/issues` - Issue tracking and management
- `/api/files` - File upload/download
- `/api/slack` - Slack integration webhooks
- `/api/scenarios` - Test scenario generation
- `/api/webhooks` - External service webhooks
- `/health` - Service health checks

### Environment Configuration
- Uses `EnvConfig` class in `src/config/env.ts` for centralized environment management
- Supports both individual env vars and `DATABASE_URL` connection string
- Auto-generates JWT secrets in development
- Comprehensive `.env.example` with setup instructions

### Testing Setup
- Jest with ts-jest for TypeScript support
- Test files: `**/*.test.ts` or `**/*.spec.ts`
- Coverage threshold: 70% for branches, functions, lines, statements
- Setup file: `tests/setup.ts`

### Database Management
- Uses Knex.js migrations (referenced in `database.ts` but migrations directory not found in backend)
- PostgreSQL as primary database
- Connection pooling and SSL support for production

### Authentication Flow
- JWT-based authentication with refresh tokens
- Passport.js for GitLab OAuth integration
- Protected routes via middleware in `src/middleware/auth.ts`

## Development Workflow

1. **Service Check**: Always run `npm run check` first to see which services are available
2. **Environment Setup**: Copy `.env.example` to `.env` and configure as needed
3. **Development**: Use `npm run dev` for hot reload development
4. **Testing**: Run `npm test` before committing changes
5. **Linting**: Use `npm run lint` and `npm run typecheck` to ensure code quality
6. **Database**: Use `npm run db:migrate` to apply schema changes

## Common Patterns

### Error Handling
- Centralized error handling via `src/middleware/errorHandler.ts`
- Joi validation for request schemas
- Structured logging with Winston

### API Response Format
- Consistent JSON response structure
- Proper HTTP status codes
- Error responses include helpful messages

### Service Availability
- Services gracefully degrade when dependencies are unavailable
- `npm run check` script validates all external service connections
- Clear logging when services are disabled

### Path Aliases
- Uses `@/*` alias for `./src/*` imports (configured in tsconfig.json)
- Enables cleaner import statements throughout the codebase