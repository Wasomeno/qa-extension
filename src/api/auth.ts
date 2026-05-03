import { api } from '@/services/api';

export async function gitlabLogin() {
  return api.post<{ url: string }>(`/auth/login`);
}

export interface SessionResponse {
  session: any;
  session_id: string;
}

export async function getGitlabLoginSession() {
  return api.get<SessionResponse>(`/auth/session`);
}

export async function logout() {
  return api.post(`/auth/logout`);
}
