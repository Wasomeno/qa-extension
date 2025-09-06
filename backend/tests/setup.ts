import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test_user:test_password@localhost:5432/qa_command_center_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test_jwt_secret';

// Global test setup
beforeAll(async () => {
  // Any global setup before tests
});

afterAll(async () => {
  // Any global cleanup after tests
});

// Mock external services
jest.mock('../src/services/openai', () => ({
  OpenAIService: jest.fn().mockImplementation(() => ({
    generateIssueDescription: jest.fn().mockResolvedValue('Generated description'),
    generateAcceptanceCriteria: jest.fn().mockResolvedValue(['Criteria 1', 'Criteria 2']),
    classifySeverity: jest.fn().mockResolvedValue('medium')
  }))
}));

jest.mock('../src/services/gitlab', () => ({
  GitLabService: jest.fn().mockImplementation(() => ({
    createIssue: jest.fn().mockResolvedValue({ id: 1, iid: 1 }),
    getProjects: jest.fn().mockResolvedValue([]),
    authenticate: jest.fn().mockResolvedValue(true)
  }))
}));

jest.mock('../src/services/slack', () => ({
  SlackService: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue({ ok: true }),
    createThread: jest.fn().mockResolvedValue({ ts: '1234567890.123456' }),
    authenticate: jest.fn().mockResolvedValue(true)
  }))
}));