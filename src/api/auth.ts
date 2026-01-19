import { api } from '@/services/api';

export async function gitlabLogin() {
  return api.post<{ url: string }>(`/auth/login`);
}

export async function getGitlabLoginSession() {
  return api.get<{ url: string }>(`/auth/session`);
}
