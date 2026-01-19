import { api } from '@/services/api';

export interface UserBasic {
  id: number | string;
  username: string;
  name: string;
  state?: string;
  web_url?: string;
  avatar_url?: string;
}

export interface User extends UserBasic {
  email: string;
  created_at: string;
  bio: string;
  bot: boolean;
  location: string;
  public_email: string;
  skype: string;
  linkedin: string;
  twitter: string;
  website_url: string;
  organization: string;
  job_title: string;
  extern_uid: string;
  provider: string;
  theme_id: number;
  last_activity_on: string;
  color_scheme_id: number;
  is_admin: boolean;
  is_auditor: boolean;
  can_create_group: boolean;
  can_create_project: boolean;
  can_create_organization: boolean;
  projects_limit: number;
  current_sign_in_at: string;
  current_sign_in_ip: string | null;
  last_sign_in_at: string;
  last_sign_in_ip: string | null;
  confirmed_at: string;
  two_factor_enabled: boolean;
  note: string;
  identities: Array<{
    provider: string;
    extern_uid: string;
  }>;
  external: boolean;
  private_profile: boolean;
  shared_runners_minutes_limit: number;
  extra_shared_runners_minutes_limit: number;
  using_license_seat: boolean;
  custom_attributes: any | null;
  namespace_id: number;
  locked: boolean;
  created_by: any | null;
}

export async function getCurrentUser() {
  return api.get<User>('/current-user');
}
