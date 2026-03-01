import { api } from '@/services/api';
import {
  GitLabProject,
  GitlabProjectLabel,
  GitLabProjectMember,
  GetProjectBoardsResponse,
} from '@/types/project';
import { MessageType } from '@/types/messages';

// Assuming backend returns direct array based on other endpoints
export async function getProjects() {
  return api.get<{ projects: GitLabProject[] }>('/projects');
}

export async function getProjectBoards(projectId: number) {
  return api.get<GetProjectBoardsResponse>(`/projects/${projectId}/boards`);
}

export async function getProjectLabels(projectId: number) {
  return api.get<GitlabProjectLabel[]>(`/projects/${projectId}/labels`);
}

export async function getProjectMembers(projectId: number) {
  return api.get<{ members: Array<GitLabProjectMember> }>(`/projects/${projectId}/members`);
}

export async function uploadProjectFile(projectId: number, file: Blob, fileName: string) {
  return new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      chrome.runtime.sendMessage(
        {
          type: MessageType.FILE_UPLOAD,
          data: {
            projectId,
            base64,
            fileName,
            contentType: file.type,
          },
        },
        (response) => {
          resolve(response);
        }
      );
    };
    reader.onerror = () => {
      resolve({ success: false, error: 'Failed to read file' });
    };
    reader.readAsDataURL(file);
  });
}
