# QA Command Center Backend

The backend API server for the QA Command Center extension.

## 🚀 Quick Start

### 1. Check Service Availability
```bash
npm run check
```
This will show you which services are available and provide setup instructions for missing ones.

### 2. Start Development Server
```bash
npm run dev
```
The server will start even if some services (like PostgreSQL/Redis) are not available. Missing services will be disabled with clear warnings.

### 3. Access the API
- **Health Check**: http://localhost:3000/health
- **API Docs**: http://localhost:3000/api (if available)

## 📋 Service Requirements

### ✅ Always Works
The server starts with zero configuration and provides clear error messages.

### 🔧 Optional Services

#### PostgreSQL (Database)
- **Required for**: User data, projects, issues, recordings
- **Setup**: 
  ```bash
  # macOS
  brew install postgresql
  brew services start postgresql
  createdb qa_command_center
  
  # Docker
  docker run -d --name postgres -p 5432:5432 \
    -e POSTGRES_PASSWORD=qa_password \
    -e POSTGRES_USER=qa_user \
    -e POSTGRES_DB=qa_command_center \
    postgres:13
  ```

#### Redis (Caching & Sessions)
- **Required for**: Session management, caching, rate limiting
- **Setup**:
  ```bash
  # macOS
  brew install redis
  brew services start redis
  
  # Docker
  docker run -d --name redis -p 6379:6379 redis:6-alpine
  ```

#### OpenAI (AI Features)
- **Required for**: AI-powered issue generation, smart suggestions
- **Setup**: 
  1. Get API key from https://platform.openai.com/api-keys
  2. Add to `.env`: `OPENAI_API_KEY=sk-your-key-here`

#### GitLab Integration
- **Required for**: GitLab issue creation, OAuth login
- **Setup**: Create OAuth app at https://gitlab.com/-/profile/applications

#### Slack Integration  
- **Required for**: Slack notifications, team collaboration
- **Setup**: Create Slack app at https://api.slack.com/apps

## 🔧 Configuration

### Environment Variables
Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

**Critical (Production only):**
- `JWT_SECRET` - Secure random string
- `DB_PASSWORD` - Secure database password

**Optional:**
- `OPENAI_API_KEY` - For AI features
- `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` - For GitLab integration
- `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` - For Slack integration

### Default Configuration
Without any environment variables, the server uses:
- **Database**: `postgresql://qa_user:qa_password@localhost:5432/qa_command_center`
- **Redis**: `redis://localhost:6379`
- **Port**: `3000`
- **JWT Secret**: Auto-generated in development

## 📖 Available Scripts

```bash
npm run dev          # Development with auto-reload
npm run check        # Check service availability  
npm run build        # Build for production
npm start            # Start production server
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database with test data
npm test             # Run tests
npm run lint         # Lint code
```

## 🐛 Troubleshooting

### "Database connection timeout"
- PostgreSQL is not running
- Run: `brew services start postgresql` (macOS) or start your PostgreSQL service
- Or start with Docker (see setup instructions above)

### "Redis connection timeout"  
- Redis is not running
- Run: `brew services start redis` (macOS) or start your Redis service
- Or start with Docker (see setup instructions above)

### "JWT_SECRET required in production"
- Set `JWT_SECRET` environment variable in production
- Generate secure secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### Features not working
- Check `npm run check` to see which services are available
- Missing services disable related features but don't break the server

## 🏗️ Architecture

- **Express.js** - Web framework
- **TypeScript** - Type safety
- **PostgreSQL** - Primary database
- **Redis** - Caching & sessions
- **Socket.io** - Real-time communication
- **JWT** - Authentication
- **OpenAI** - AI features
- **Graceful degradation** - Works with missing services

## 📦 Development

The backend is designed to work in any environment:
- ✅ **Zero config**: Starts with sensible defaults
- ✅ **Graceful degradation**: Disables features when services unavailable
- ✅ **Clear errors**: Helpful error messages and setup guidance
- ✅ **Hot reload**: Automatic restart in development
- ✅ **Type safety**: Full TypeScript support