# QA Command Center API Documentation

## Overview

The QA Command Center API provides comprehensive endpoints for managing issues, recordings, projects, users, and integrations with GitLab and Slack. This RESTful API supports both web applications and browser extensions.

## Base URL

```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Most endpoints require authentication via the `Authorization` header.

### Authentication Header

```http
Authorization: Bearer <your_jwt_token>
```

### Token Lifecycle

- **Access Token**: Valid for 15 minutes
- **Refresh Token**: Valid for 30 days
- **Auto-refresh**: Use refresh token to get new access token

## Endpoints

### Authentication Endpoints

#### POST /auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "testuser",
  "fullName": "Test User",
  "password": "SecurePass123!"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "testuser",
      "fullName": "Test User",
      "role": "user",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt_access_token",
      "refreshToken": "jwt_refresh_token",
      "expiresIn": "15m"
    }
  }
}
```

#### POST /auth/login

Authenticate user and obtain tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "testuser",
      "fullName": "Test User",
      "role": "user"
    },
    "tokens": {
      "accessToken": "jwt_access_token",
      "refreshToken": "jwt_refresh_token",
      "expiresIn": "15m"
    }
  }
}
```

#### POST /auth/refresh

Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "tokens": {
      "accessToken": "new_jwt_access_token",
      "refreshToken": "new_jwt_refresh_token",
      "expiresIn": "15m"
    }
  }
}
```

#### POST /auth/logout

Logout user and invalidate tokens.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

#### GET /auth/me

Get current user information.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "User info retrieved",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "testuser",
      "fullName": "Test User",
      "role": "user",
      "oauthConnections": {
        "gitlab": true,
        "slack": false
      }
    }
  }
}
```

### OAuth Integration Endpoints

#### GET /auth/gitlab

Initiate GitLab OAuth flow.

**Response (200):**
```json
{
  "success": true,
  "message": "GitLab OAuth URL generated",
  "data": {
    "authUrl": "https://gitlab.com/oauth/authorize?client_id=...&redirect_uri=..."
  }
}
```

#### POST /auth/gitlab/callback

Handle GitLab OAuth callback.

**Request Body:**
```json
{
  "code": "authorization_code_from_gitlab",
  "state": "state_parameter"
}
```

#### GET /auth/slack

Initiate Slack OAuth flow.

**Response (200):**
```json
{
  "success": true,
  "message": "Slack OAuth URL generated",
  "data": {
    "authUrl": "https://slack.com/oauth/v2/authorize?client_id=...&scope=..."
  }
}
```

#### POST /auth/slack/callback

Handle Slack OAuth callback.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "code": "authorization_code_from_slack",
  "state": "state_parameter"
}
```

### Project Management Endpoints

#### GET /projects

List user's projects.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `search` (string): Search query
- `source` (string): Filter by source ('gitlab', 'manual')

**Response (200):**
```json
{
  "success": true,
  "message": "Projects retrieved",
  "data": {
    "projects": [
      {
        "id": "uuid",
        "name": "My Project",
        "description": "Project description",
        "gitlabProjectId": "123",
        "url": "https://gitlab.com/user/project",
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "issueCount": 15,
        "recordingCount": 8
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

#### POST /projects

Create a new project.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "New Project",
  "description": "Project description",
  "gitlabProjectId": "123",
  "url": "https://gitlab.com/user/project"
}
```

#### GET /projects/:id

Get project details.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Project retrieved",
  "data": {
    "project": {
      "id": "uuid",
      "name": "My Project",
      "description": "Project description",
      "gitlabProjectId": "123",
      "url": "https://gitlab.com/user/project",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "members": [
        {
          "userId": "uuid",
          "role": "admin"
        }
      ],
      "recentIssues": [],
      "recentRecordings": []
    }
  }
}
```

### Issue Management Endpoints

#### GET /issues

List issues.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `projectId` (string): Filter by project
- `status` (string): Filter by status ('open', 'closed', 'in_progress')
- `severity` (string): Filter by severity ('critical', 'high', 'medium', 'low')
- `priority` (string): Filter by priority ('urgent', 'high', 'normal', 'low')
- `page` (number): Page number
- `limit` (number): Items per page

**Response (200):**
```json
{
  "success": true,
  "message": "Issues retrieved",
  "data": {
    "issues": [
      {
        "id": "uuid",
        "title": "Login button not working",
        "description": "User cannot click login button on mobile devices",
        "status": "open",
        "severity": "high",
        "priority": "urgent",
        "projectId": "uuid",
        "gitlabIssueId": "456",
        "assigneeId": "uuid",
        "reporterId": "uuid",
        "labels": ["bug", "mobile"],
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

#### POST /issues

Create a new issue.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Login button not working",
  "description": "User cannot click login button on mobile devices",
  "projectId": "uuid",
  "severity": "high",
  "priority": "urgent",
  "labels": ["bug", "mobile"],
  "assigneeId": "uuid",
  "reproductionSteps": [
    "Navigate to login page",
    "Enter credentials",
    "Click login button",
    "Nothing happens"
  ],
  "expectedBehavior": "User should be logged in",
  "actualBehavior": "Login button appears unresponsive",
  "browserInfo": {
    "userAgent": "Mozilla/5.0...",
    "url": "https://example.com/login",
    "viewport": "375x667"
  },
  "attachments": ["recording_id_1", "screenshot_id_2"]
}
```

#### GET /issues/:id

Get issue details.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Issue retrieved",
  "data": {
    "issue": {
      "id": "uuid",
      "title": "Login button not working",
      "description": "User cannot click login button on mobile devices",
      "status": "open",
      "severity": "high",
      "priority": "urgent",
      "projectId": "uuid",
      "gitlabIssueId": "456",
      "assigneeId": "uuid",
      "reporterId": "uuid",
      "labels": ["bug", "mobile"],
      "acceptanceCriteria": [
        "Login button should be clickable on all devices",
        "Login should redirect to dashboard after successful auth"
      ],
      "attachments": [],
      "comments": [],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

#### PUT /issues/:id

Update issue.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Updated title",
  "status": "in_progress",
  "assigneeId": "uuid"
}
```

### Recording Management Endpoints

#### GET /recordings

List recordings.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `projectId` (string): Filter by project
- `status` (string): Filter by status ('active', 'completed', 'failed')
- `page` (number): Page number
- `limit` (number): Items per page

**Response (200):**
```json
{
  "success": true,
  "message": "Recordings retrieved",
  "data": {
    "recordings": [
      {
        "id": "uuid",
        "name": "User login flow",
        "description": "Recording of login process",
        "status": "completed",
        "projectId": "uuid",
        "userId": "uuid",
        "duration": 45000,
        "url": "https://example.com",
        "steps": [
          {
            "type": "click",
            "selector": "#login-btn",
            "timestamp": 1000
          }
        ],
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### POST /recordings

Create a new recording.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "User login flow",
  "description": "Recording of login process",
  "projectId": "uuid",
  "url": "https://example.com",
  "browserInfo": {
    "userAgent": "Mozilla/5.0...",
    "viewport": "1920x1080"
  }
}
```

#### POST /recordings/:id/steps

Add steps to recording.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "steps": [
    {
      "type": "click",
      "selector": "#login-btn",
      "timestamp": 1000,
      "coordinates": { "x": 100, "y": 200 }
    },
    {
      "type": "input",
      "selector": "#username",
      "value": "testuser",
      "timestamp": 2000
    }
  ]
}
```

#### POST /recordings/:id/complete

Mark recording as completed.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Recording completed",
  "data": {
    "recording": {
      "id": "uuid",
      "status": "completed",
      "duration": 45000,
      "stepCount": 10
    }
  }
}
```

### AI-Powered Features

#### POST /ai/generate-issue

Generate issue from recording data.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "recordingId": "uuid",
  "userDescription": "Login button not working",
  "expectedBehavior": "User should be logged in",
  "actualBehavior": "Nothing happens when clicking login"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Issue generated successfully",
  "data": {
    "generatedIssue": {
      "title": "Login Button Unresponsive on Mobile Devices",
      "description": "Users are unable to successfully log in when clicking the login button on mobile devices...",
      "acceptanceCriteria": [
        "Login button should be clickable on all devices",
        "Successful login should redirect to dashboard"
      ],
      "severity": "high",
      "priority": "urgent",
      "labels": ["bug", "mobile", "authentication"],
      "estimatedEffort": "1-2 days"
    }
  }
}
```

#### POST /ai/generate-test-script

Generate test script from issue.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "issueId": "uuid",
  "framework": "playwright",
  "language": "typescript"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Test script generated",
  "data": {
    "testScript": {
      "framework": "playwright",
      "language": "typescript",
      "script": "import { test, expect } from '@playwright/test';\n\ntest('login functionality', async ({ page }) => {\n  // Test code here\n});",
      "description": "Tests login functionality on mobile devices",
      "prerequisites": ["Test user account", "Mobile viewport"],
      "expectedOutcome": "Login should work correctly"
    }
  }
}
```

### User Management Endpoints

#### GET /users

List users (Admin only).

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Users retrieved",
  "data": {
    "users": [
      {
        "id": "uuid",
        "email": "user@example.com",
        "username": "testuser",
        "fullName": "Test User",
        "role": "user",
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### GET /users/:id

Get user details.

**Headers:** `Authorization: Bearer <token>`

### Health Check Endpoints

#### GET /health

Check API health status.

**Response (200):**
```json
{
  "success": true,
  "message": "API is healthy",
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "services": {
      "database": "healthy",
      "redis": "healthy",
      "gitlab": "healthy"
    },
    "version": "1.0.0"
  }
}
```

### Webhook Endpoints

#### POST /webhooks/gitlab

Handle GitLab webhooks.

**Headers:** 
- `X-Gitlab-Token: <webhook_secret>`
- `X-Gitlab-Event: <event_type>`

**Request Body:**
```json
{
  "object_kind": "issue",
  "event_type": "issue",
  "project": {
    "id": 123,
    "name": "My Project"
  },
  "object_attributes": {
    "id": 456,
    "title": "Issue title",
    "state": "opened"
  }
}
```

#### POST /webhooks/slack

Handle Slack webhooks.

**Headers:** 
- `X-Slack-Signature: <signature>`
- `X-Slack-Request-Timestamp: <timestamp>`

## Error Responses

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": "Additional error details if available"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400): Request validation failed
- `AUTHENTICATION_ERROR` (401): Authentication required or failed
- `AUTHORIZATION_ERROR` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `CONFLICT_ERROR` (409): Resource conflict (e.g., duplicate email)
- `RATE_LIMIT_ERROR` (429): Rate limit exceeded
- `INTERNAL_ERROR` (500): Internal server error
- `GITLAB_ERROR` (502): GitLab integration error
- `SLACK_ERROR` (502): Slack integration error

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Authentication endpoints**: 5 requests per minute
- **General endpoints**: 100 requests per 15 minutes
- **Password reset**: 3 requests per hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Time when rate limit resets

## WebSocket Events

Real-time events are available via WebSocket connection at `/ws`.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => {
  // Send authentication
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your_jwt_token'
  }));
};
```

### Event Types

- `recording_started`: Recording session started
- `recording_step`: New step added to recording
- `recording_completed`: Recording session completed
- `issue_created`: New issue created
- `issue_updated`: Issue status changed
- `notification`: General notification

### Example Event

```json
{
  "type": "issue_created",
  "data": {
    "issueId": "uuid",
    "title": "New issue title",
    "projectId": "uuid",
    "createdBy": "uuid"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## SDK and Client Libraries

### JavaScript/TypeScript

```bash
npm install qa-command-center-sdk
```

```javascript
import { QACommandCenter } from 'qa-command-center-sdk';

const client = new QACommandCenter({
  baseUrl: 'http://localhost:3000/api',
  token: 'your_jwt_token'
});

// List issues
const issues = await client.issues.list({ projectId: 'uuid' });

// Create issue
const newIssue = await client.issues.create({
  title: 'Bug report',
  description: 'Issue description',
  projectId: 'uuid'
});
```

## Postman Collection

A complete Postman collection is available at `/docs/api/postman-collection.json` with:
- All endpoints configured
- Environment variables for different stages
- Example requests and responses
- Authentication workflows

## Testing

### Integration Tests

Run the API integration tests:

```bash
cd backend
npm run test:integration
```

### Load Testing

Performance test scripts are available in `/tests/load/`:
- Authentication flow: 100 concurrent users
- Issue creation: 50 requests/second
- Recording operations: 25 concurrent sessions

## Support

For API support:
- GitHub Issues: [Repository Issues](https://github.com/your-org/qa-extension/issues)
- Documentation: [Full Documentation](https://docs.qa-command-center.com)
- Email: api-support@qa-command-center.com

## Changelog

### v1.0.0 (Current)
- Initial API release
- Full CRUD operations for all resources
- OAuth integration with GitLab and Slack
- AI-powered issue generation
- Real-time WebSocket events
- Comprehensive error handling