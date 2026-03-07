export interface AuthConfig {
  baseUrl: string;
  loginUrl: string;
  username: string;
  password?: string;
}

export interface ParsedStep {
  action: string;
  inputData: string;
  expectedResult: string;
}

export interface ParsedTestCase {
  id: string;
  name: string;
  preCondition: string;
  steps: ParsedStep[];
  status: string;
  note: string;
}

export interface TestScenarioSheet {
  name: string;
  testCases: ParsedTestCase[];
}

export interface TestScenario {
  id: string;
  fileName: string;
  projectId?: string;
  projectName?: string;
  sheets: TestScenarioSheet[];
  generatedTests: { id: string; name: string }[];
  status: 'uploaded' | 'generating' | 'ready' | 'failed';
  error?: string;
  authConfig: AuthConfig;
  createdAt: string;
}
