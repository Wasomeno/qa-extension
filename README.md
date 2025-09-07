# QA Command Center

An AI-powered quality assurance platform that revolutionizes bug reporting and testing workflows through intelligent automation and seamless integrations.

![QA Command Center](https://img.shields.io/badge/status-active-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🎯 Smart Issue Creation
- **AI-Powered Analysis**: Automatically generate comprehensive bug reports from user recordings
- **Context-Aware Descriptions**: Include browser info, console errors, and reproduction steps
- **Intelligent Classification**: Auto-assign severity, priority, and relevant labels
- **Acceptance Criteria**: Generate testable acceptance criteria for every issue

 

### 🔗 Seamless Integrations
- **GitLab Integration**: Automatic issue creation, project synchronization, and webhook support
- **Slack Notifications**: Real-time alerts and team collaboration features
- **OAuth Authentication**: Secure single sign-on with GitLab and Slack
- **API-First Design**: RESTful API with comprehensive webhook support

### 🤖 AI-Driven Automation
- **Issue Generation**: Transform captured context into detailed bug reports
- **Test Script Creation**: Generate Playwright, Cypress, or Selenium test scripts
- **Smart Classification**: Automatic severity and priority assignment
- **Content Enhancement**: Improve existing issue descriptions with AI insights

### 🌐 Cross-Platform Support
- **Browser Extension**: Chrome extension for seamless web testing
- **Web Dashboard**: Comprehensive project and issue management interface
- **Mobile Ready**: Responsive design for mobile testing workflows
- **API Access**: Full programmatic access to all features

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 13+
- Redis 6+
- Docker and Docker Compose (recommended)

### 1. Clone Repository

```bash
git clone https://github.com/your-org/qa-extension.git
cd qa-extension
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

Required environment variables:
```env
# Database
DATABASE_URL=postgresql://qa_user:qa_password@localhost:5432/qa_command_center
REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key_here
REFRESH_TOKEN_SECRET=your_refresh_token_secret_here

# GitLab Integration
GITLAB_CLIENT_ID=your_gitlab_client_id
GITLAB_CLIENT_SECRET=your_gitlab_client_secret

# OpenAI
OPENAI_API_KEY=your_openai_api_key
```

### 3. Quick Setup with Docker

```bash
# Start all services
docker-compose up -d

# Wait for services to be ready
docker-compose logs -f backend
```

### 4. Manual Setup

```bash
# Install dependencies
npm install

# Setup backend
cd backend
npm install
npm run db:migrate
npm run db:seed

# Setup extension
cd ../extension
npm install
npm run build

# Start development servers
npm run dev
```

### 5. Load Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `extension/dist/`
4. Pin the QA Command Center extension

## Architecture

```
QA Command Center
├── backend/              # Node.js/Express API server
│   ├── src/
│   │   ├── controllers/  # Request handlers
│   │   ├── services/     # Business logic
│   │   ├── models/       # Database models
│   │   ├── routes/       # API routes
│   │   └── middleware/   # Custom middleware
│   └── tests/           # Backend tests
├── extension/           # Chrome extension
│   ├── src/
│   │   ├── background/  # Service worker
│   │   ├── content/     # Content scripts  
│   │   ├── popup/       # Extension popup
│   │   ├── options/     # Settings page
│   │   └── components/  # React components
│   └── public/         # Static assets
├── database/           # Database schemas and migrations
├── docs/              # Documentation
└── scripts/           # Build and deployment scripts
```

## Development

### Backend Development

```bash
cd backend

# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Database operations
npm run db:migrate
npm run db:rollback
npm run db:seed

# Code quality
npm run lint
npm run lint:fix
npm run typecheck
```

### Extension Development

```bash
cd extension

# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Run tests
npm test
npm run test:watch

# Code quality
npm run lint
npm run lint:fix
npm run typecheck

# Clean build artifacts
npm run clean
```

### Docker Development

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# View logs
docker-compose logs -f backend
docker-compose logs -f postgres

# Run database migrations
docker-compose exec backend npm run db:migrate

# Restart specific service
docker-compose restart backend
```

### Testing

#### Unit Tests
```bash
# Backend unit tests
cd backend && npm test

# Extension unit tests  
cd extension && npm test

# Run all tests
npm run test:all
```

#### Integration Tests
```bash
# API integration tests
cd backend && npm run test:integration

# End-to-end tests
npm run test:e2e
```

#### Load Testing
```bash
# Performance testing
cd tests/load
npm install
npm run load-test
```

## Usage

### 1. Setup and Authentication

1. **Install Extension**: Load the Chrome extension from the releases page
2. **Create Account**: Register at the web dashboard or through the extension
3. **Connect GitLab**: OAuth integration for automatic issue creation
4. **Configure Slack**: Optional Slack integration for team notifications

### 2. Recording User Interactions

1. **Start Recording**: Click the extension icon and select "Start Recording"
2. **Perform Actions**: Navigate and interact with your web application
3. **Encounter Issues**: The system automatically detects errors and unusual behavior
4. **Stop Recording**: End the session when you've captured the issue

### 3. AI-Powered Issue Creation

1. **Review Recording**: The AI analyzes your recording and detected issues
2. **Generated Report**: Review the automatically generated bug report
3. **Customize Details**: Add additional context, expected behavior, or severity
4. **Create Issue**: Submit directly to GitLab or save locally

### 4. Test Script Generation

1. **Select Issue**: Choose an existing issue from your project
2. **Configure Framework**: Select Playwright, Cypress, or Selenium
3. **Generate Script**: AI creates a complete test script
4. **Review and Integrate**: Add the script to your test suite

### 5. Team Collaboration

1. **Share Recordings**: Send recording links to team members
2. **Slack Notifications**: Automatic alerts for new issues and updates
3. **Project Management**: Organize issues by project and team
4. **Status Tracking**: Monitor issue resolution progress

## API Documentation

The QA Command Center provides a comprehensive REST API. Full documentation is available at:

- **Local Development**: http://localhost:3000/api/docs
- **API Reference**: [docs/api/README.md](docs/api/README.md)
- **Postman Collection**: [docs/api/postman-collection.json](docs/api/postman-collection.json)

### Quick API Examples

#### Authentication
```javascript
// Register new user
const response = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    username: 'testuser',
    fullName: 'Test User',
    password: 'SecurePass123!'
  })
});
```

#### Create Issue
```javascript
// Create new issue
const issue = await fetch('/api/issues', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Login button not working',
    description: 'Detailed description...',
    projectId: 'project-uuid',
    severity: 'high',
    priority: 'urgent'
  })
});
```

#### Start Recording
```javascript
// Start new recording session
const recording = await fetch('/api/recordings', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Login flow recording',
    projectId: 'project-uuid',
    url: 'https://myapp.com/login'
  })
});
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | API server port | `3000` | No |
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `REDIS_URL` | Redis connection string | - | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `REFRESH_TOKEN_SECRET` | Refresh token secret | - | Yes |
| `GITLAB_CLIENT_ID` | GitLab OAuth client ID | - | Yes* |
| `GITLAB_CLIENT_SECRET` | GitLab OAuth secret | - | Yes* |
| `SLACK_CLIENT_ID` | Slack OAuth client ID | - | No |
| `SLACK_CLIENT_SECRET` | Slack OAuth secret | - | No |
| `OPENAI_API_KEY` | OpenAI API key | - | Yes |
| `OPENAI_MODEL` | OpenAI model to use | `gpt-4.1-mini` | No |

*Required for GitLab integration

### Extension Configuration

The extension can be configured through the options page:

- **API Endpoint**: Backend server URL
- **Auto-Recording**: Automatic recording triggers
- **Notification Settings**: Alert preferences
- **Privacy Settings**: Data collection preferences
- **GitLab Integration**: Project selection and settings
- **Slack Integration**: Channel and notification settings

### Database Configuration

```javascript
// knexfile.js configuration
module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './database/migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  }
};
```

## Deployment

### Production Deployment with Docker

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with environment variables
docker-compose -f docker-compose.prod.yml up -d

# Check service health
docker-compose ps
curl http://localhost:3000/api/health
```

### Manual Production Deployment

```bash
# Build backend
cd backend
npm install --production
npm run build

# Build extension
cd ../extension  
npm install --production
npm run build

# Setup database
npm run db:migrate

# Start with PM2
pm2 start ecosystem.config.js
```

### Environment-Specific Configuration

#### Staging
```env
NODE_ENV=staging
DATABASE_URL=postgresql://user:pass@staging-db:5432/qa_staging
CORS_ORIGIN=https://staging.qa-command-center.com
```

#### Production
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/qa_production
CORS_ORIGIN=https://qa-command-center.com
RATE_LIMIT_MAX_REQUESTS=1000
```

## Security

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- OAuth 2.0 integration with GitLab and Slack
- Role-based access control (RBAC)
- Session management with secure cookies

### Data Protection
- HTTPS enforcement in production
- Input validation and sanitization
- SQL injection prevention with parameterized queries
- XSS protection with content security policies

### API Security
- Rate limiting on all endpoints
- Request size limits
- CORS configuration
- Security headers with Helmet.js

### Extension Security
- Content Security Policy (CSP)
- Secure communication with HTTPS
- Permission-based access model
- Data encryption for sensitive information

## Monitoring & Logging

### Application Monitoring
- Health check endpoints
- Performance metrics with Prometheus
- Error tracking with Sentry
- Uptime monitoring

### Logging Strategy
```javascript
// Structured logging with Winston
logger.info('User action', {
  userId: 'uuid',
  action: 'create_issue',
  projectId: 'project-uuid',
  timestamp: new Date().toISOString()
});
```

### Metrics Collection
- API response times
- Database query performance
- Extension usage statistics
- Error rates and types

## Troubleshooting

### Common Issues

#### Backend Won't Start
```bash
# Check database connection
npm run db:ping

# Verify environment variables
node -e "console.log(process.env.DATABASE_URL)"

# Check service dependencies
docker-compose ps
```

#### Extension Not Loading
1. Verify Chrome developer mode is enabled
2. Check extension manifest.json validity
3. Review browser console for errors
4. Ensure proper CORS configuration

#### Database Connection Issues
```bash
# Test database connectivity
psql $DATABASE_URL

# Run pending migrations
npm run db:migrate

# Check database status
npm run db:status
```

#### GitLab Integration Issues
1. Verify OAuth application settings in GitLab
2. Check redirect URI configuration
3. Confirm client ID and secret are correct
4. Review GitLab webhook settings

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
NODE_ENV=development
```

Check application logs:
```bash
# Backend logs
npm run logs

# Docker logs
docker-compose logs -f backend

# Extension logs
Open Chrome DevTools > Extensions > QA Command Center
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork Repository**: Create your own fork
2. **Create Branch**: `git checkout -b feature/amazing-feature`
3. **Make Changes**: Implement your feature or fix
4. **Add Tests**: Ensure good test coverage
5. **Run Tests**: `npm run test:all`
6. **Commit Changes**: Use conventional commit messages
7. **Push Branch**: `git push origin feature/amazing-feature`
8. **Create PR**: Submit pull request with detailed description

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb configuration with custom rules
- **Prettier**: Consistent code formatting
- **Jest**: Unit and integration testing
- **Conventional Commits**: Semantic commit messages

### Pull Request Guidelines

- Include comprehensive tests for new features
- Update documentation for API changes
- Follow existing code style and patterns
- Provide clear PR description with examples
- Link related issues and discussions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

### Getting Help

- **Documentation**: [Full Documentation](docs/)
- **API Reference**: [API Documentation](docs/api/README.md)
- **GitHub Issues**: [Report Issues](https://github.com/your-org/qa-extension/issues)
- **Discussions**: [Community Discussions](https://github.com/your-org/qa-extension/discussions)

### Commercial Support

For enterprise support, custom integrations, or professional services:
- Email: enterprise@qa-command-center.com
- Website: https://qa-command-center.com/enterprise

## Roadmap

### Version 1.1 (Q2 2024)
- [ ] Advanced recording filters and smart detection
- [ ] Mobile testing support with device emulation
- [ ] Jira integration alongside GitLab
- [ ] Custom test framework support
- [ ] Performance testing integration

### Version 1.2 (Q3 2024)
- [ ] Multi-language support (i18n)
- [ ] Advanced analytics dashboard
- [ ] Custom AI model fine-tuning
- [ ] Enterprise SSO integration
- [ ] Advanced reporting and exports

### Version 2.0 (Q4 2024)
- [ ] Visual regression testing
- [ ] Cross-browser testing automation
- [ ] API testing capabilities
- [ ] Advanced team collaboration features
- [ ] Custom integration marketplace

## Acknowledgments

- **OpenAI**: For providing the AI capabilities that power our intelligent features
- **GitLab**: For the robust Git platform and excellent API
- **Slack**: For seamless team communication integration
- **Playwright Team**: For the excellent browser automation framework
- **Open Source Community**: For the many libraries and tools that make this project possible

---

Built with ❤️ by the QA Command Center team. Making quality assurance intelligent, automated, and accessible for everyone.
