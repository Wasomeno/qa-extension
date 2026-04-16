import { api } from '@/services/api';
import { AuthConfig, TestScenario } from '@/types/test-scenario';
import { MessageType } from '@/types/messages';

export const testScenarioApi = {
  uploadScenario: async (
    file: File,
    projectId: string,
    authConfig: AuthConfig
  ): Promise<{ message: string; id: string; sheets: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        chrome.runtime.sendMessage(
          {
            type: MessageType.TEST_SCENARIO_UPLOAD,
            data: {
              base64,
              fileName: file.name,
              contentType: file.type,
              projectId,
              authConfig,
            },
          },
          response => {
            if (response?.success) {
              resolve(response.data);
            } else {
              reject(new Error(response?.error || 'Failed to upload scenario'));
            }
          }
        );
      };
      reader.onerror = () =>
        reject(new Error('Failed to read file for upload'));
      reader.readAsDataURL(file);
    });
  },

  listScenarios: async (): Promise<TestScenario[]> => {
    const response = await api.get<TestScenario[]>('/test-scenarios');
    if (!response.success) throw new Error(response.error);
    return response.data || [];
  },

  getScenario: async (id: string): Promise<TestScenario> => {
    const response = await api.get<TestScenario>(`/test-scenarios/${id}`);
    if (!response.success) throw new Error(response.error);
    return response.data!;
  },

  deleteScenario: async (
    id: string
  ): Promise<{ message: string; id: string }> => {
    const response = await api.delete<{ message: string; id: string }>(
      `/test-scenarios/${id}`
    );
    if (!response.success) throw new Error(response.error);
    return response.data!;
  },

  generateTests: async (
    id: string,
    sheetNames: string[]
  ): Promise<{ message: string; id: string }> => {
    const response = await api.post<{ message: string; id: string }>(
      `/test-scenarios/${id}/generate`,
      {
        body: { sheetNames } as any,
      }
    );
    if (!response.success) throw new Error(response.error);
    return response.data!;
  },

  bulkDeleteScenarios: async (ids: string[]) => {
    const response = await api.post<{
      message: string;
      deletedCount: number;
      notFound: string[];
      errors: string[];
    }>('/test-scenarios/bulk-delete', {
      body: { ids },
    });
    if (!response.success) throw new Error(response.error);
    return response.data!;
  },
};
