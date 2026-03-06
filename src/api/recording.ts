import { api } from '@/services/api';
import { TestRecording } from '@/types/recording';

export const saveRecording = async (recording: TestRecording) => {
  const response = await api.post<any>('/recordings', {
    body: recording,
  });
  if (!response.success) {
    throw new Error(response.error || 'Failed to save recording');
  }
  return response.data;
};

export const listRecordings = async (): Promise<TestRecording[]> => {
  const response = await api.get<TestRecording[]>('/recordings');
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
