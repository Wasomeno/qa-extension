import { api } from '@/services/api';
import { Issue } from '@/api/issue';

export interface ActivityFeedItem {
  issue_id: number;
  issue_iid: number;
  project_id: number;
  title: string;
  web_url: string;
  action_type: 'comment' | 'system_note' | 'issue_update';
  actor_name: string;
  actor_avatar: string;
  description: string;
  created_at: string;
}

export interface DashboardStats {
  recent_issues: Issue[];
  recent_activities: ActivityFeedItem[];
}

export async function getDashboardStats() {
  return api.get<DashboardStats>('/dashboard');
}
