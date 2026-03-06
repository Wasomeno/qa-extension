import { api } from '@/services/api';
import { TestRecording, ListRecordingsParams } from '@/types/recording';

export const saveRecording = async (recording: TestRecording) => {
  console.log('[Recording API] Saving recording payload:', recording);
  const response = await api.post<any>('/recordings', {
    body: recording as any,
  });
  if (!response.success) {
    throw new Error(response.error || 'Failed to save recording');
  }
  return response.data;
};

export const listRecordings = async (params?: ListRecordingsParams): Promise<TestRecording[]> => {
  const url = new URL('/recordings', window.location.origin);
  if (params) {
    if (params.project_id) url.searchParams.append('project_id', params.project_id);
    if (params.issue_id) url.searchParams.append('issue_id', params.issue_id);
    if (params.sort_by) url.searchParams.append('sort_by', params.sort_by);
    if (params.order) url.searchParams.append('order', params.order);
  }

  const queryPath = url.pathname + url.search;

  const response = await api.get<TestRecording[]>(queryPath);
  if (!response.success) {
    throw new Error(response.error || 'Failed to list recordings');
  }
  return response.data || [];
};

export const deleteRecording = async (id: string) => {
  const response = await api.delete<any>(`/recordings/${id}`);
  if (!response.success) {
    throw new Error(response.error || 'Failed to delete recording');
  }
  return response.data;
};

export const updateRecording = async (id: string, data: Partial<TestRecording>) => {
  const response = await api.patch<any>(`/recordings/${id}`, {
    body: data as any,
  });
  if (!response.success) {
    throw new Error(response.error || 'Failed to update recording');
  }
  return response.data;
};
