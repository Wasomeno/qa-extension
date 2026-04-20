import { api } from '@/services/api';
import {
  GitLabProject,
  GitlabProjectLabel,
  GitLabProjectMember,
  GetProjectBoardsResponse,
} from '@/types/project';
import { MessageType } from '@/types/messages';

export async function getProjects(searchParam?: string | any) {
  const search = typeof searchParam === 'string' ? searchParam : undefined;
  const url = search
    ? `/projects?search=${encodeURIComponent(search)}`
    : '/projects';
  return api.get<{ projects: GitLabProject[] }>(url);
}

export async function getProjectById(projectId: number | string) {
  const response = await api.get<{ project: GitLabProject }>(`/projects/${projectId}`);
  return response;
}

export async function getProjectBoards(projectId: number) {
  return api.get<GetProjectBoardsResponse>(`/projects/${projectId}/boards`);
}

export async function getProjectLabels(projectId: number) {
  return api.get<GitlabProjectLabel[]>(`/projects/${projectId}/labels`);
}

export async function getProjectMembers(projectId: number) {
  return api.get<{ members: Array<GitLabProjectMember> }>(
    `/projects/${projectId}/members`
  );
}

export async function uploadProjectFile(
  projectId: number,
  file: Blob,
  fileName: string
) {
  return new Promise<{ success: boolean; data?: any; error?: string }>(
    resolve => {
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
          response => {
            resolve(response);
          }
        );
      };
      reader.onerror = () => {
        resolve({ success: false, error: 'Failed to read file' });
      };
      reader.readAsDataURL(file);
    }
  );
}

export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  developers_can_push: boolean;
  developers_can_merge: boolean;
  can_push: boolean;
  web_url: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
    author_name: string;
    author_email: string;
    authored_date: string;
  };
}

export async function getProjectBranches(projectId: number | string) {
  const response = await api.get<{ branches: GitLabBranch[] }>(
    `/projects/${projectId}/branches`
  );
  return response;
}
