import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMergeRequestCreator } from '../useMergeRequestCreator';

jest.mock('@/utils/mrPresets', () => ({
  getLastUsedPreset: jest.fn(),
  saveLastUsedPreset: jest.fn(),
}));

const mockApi = {
  getProjects: jest.fn(),
  getProjectBranches: jest.fn(),
  getUsersInProject: jest.fn(),
  createMergeRequest: jest.fn(),
};

jest.mock('@/services/api', () => ({
  apiService: mockApi,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useMergeRequestCreator', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockApi.getProjects.mockResolvedValue({ success: true, data: [] });
    mockApi.getProjectBranches.mockResolvedValue({
      success: true,
      data: { items: [{ name: 'main', default: true }] },
    });
    mockApi.getUsersInProject.mockResolvedValue({ success: true, data: [] });
  });

  it('submits merge request payload including Slack fields and updates success state', async () => {
    mockApi.createMergeRequest.mockResolvedValue({
      success: true,
      data: {
        mergeRequest: {
          iid: 1,
          title: 'Test MR',
          web_url: 'https://gitlab.com/group/project/-/merge_requests/1',
          source_branch: 'feat/test',
          target_branch: 'main',
        },
        slackNotification: {
          status: 'sent',
          channel: 'C123',
          ts: '123.456',
        },
      },
    });

    const wrapper = createWrapper();
    const { result } = renderHook(() => useMergeRequestCreator({}), {
      wrapper,
    });

    await act(async () => {
      result.current.setValue('projectId', '123');
      result.current.setValue('sourceBranch', 'feat/test');
      result.current.setValue('targetBranch', 'main');
      result.current.setValue('title', 'Test MR');
      result.current.setValue('labelIds', ['backend']);
      result.current.setValue('slackChannelId', 'C123');
      result.current.setValue('slackUserIds', ['U123']);
    });

    const submitEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.handleSubmit(submitEvent);
    });

    expect(mockApi.createMergeRequest).toHaveBeenCalledWith('123', {
      source_branch: 'feat/test',
      target_branch: 'main',
      title: 'Test MR',
      description: '',
      assignee_ids: [],
      reviewer_ids: [],
      labels: '',
      remove_source_branch: true,
      squash: false,
      slack_channel_id: 'C123',
      slack_user_ids: ['U123'],
    });

    expect(result.current.success).toBe(
      'Merge request created and shared to Slack.'
    );
    expect(result.current.error).toBeNull();
    expect(result.current.slackNotification).toEqual({
      status: 'sent',
      channel: 'C123',
      ts: '123.456',
    });
  });

  it('exposes error state when merge request creation fails', async () => {
    mockApi.createMergeRequest.mockResolvedValue({
      success: false,
      error: 'Failed to create merge request',
    });

    const wrapper = createWrapper();
    const { result } = renderHook(() => useMergeRequestCreator({}), {
      wrapper,
    });

    await act(async () => {
      result.current.setValue('projectId', '123');
      result.current.setValue('sourceBranch', 'feat/test');
      result.current.setValue('targetBranch', 'main');
      result.current.setValue('title', 'Test MR');
    });

    const submitEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.handleSubmit(submitEvent);
    });

    expect(result.current.error).toBe('Failed to create merge request');
    expect(result.current.success).toBeNull();
  });
});
