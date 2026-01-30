import { api } from '@/services/api';
import {
  GitLabProject,
  GitlabProjectLabel,
  GitLabProjectMember,
  GetProjectBoardsResponse,
} from '@/types/project';

// Assuming backend returns direct array based on other endpoints
export async function getProjects() {
  return api.get<{ projects: GitLabProject[] }>(
    '/projects?membership=true&order_by=updated_at&per_page=100'
  );
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
