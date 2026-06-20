export interface GitLabUser {
  id: number;
  username: string;
  email: string;
  name: string;
  state: string;
  web_url: string;
  created_at: string | null;
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
  last_activity_on: string | null;
  color_scheme_id: number;
  is_admin: boolean;
  is_auditor: boolean;
  avatar_url: string;
  can_create_group: boolean;
  can_create_project: boolean;
  can_create_organization: boolean;
  projects_limit: number;
  current_sign_in_at: string | null;
  current_sign_in_ip: string | null;
  last_sign_in_at: string | null;
  last_sign_in_ip: string | null;
  confirmed_at: string | null;
  two_factor_enabled: boolean;
  note: string;
  identities: any[] | null;
  external: boolean;
  private_profile: boolean;
  shared_runners_minutes_limit: number;
  extra_shared_runners_minutes_limit: number;
  using_license_seat: boolean;
  custom_attributes: any[] | null;
  namespace_id: number;
  locked: boolean;
  created_by: number | null;
}

export interface ContainerExpirationPolicy {
  cadence: string;
  keep_n: number;
  older_than: string;
  name_regex_delete: string;
  name_regex_keep: string;
  enabled: boolean;
  next_run_at: string;
  name_regex: string;
}

export interface ProjectNamespace {
  id: number;
  name: string;
  path: string;
  kind: string;
  full_path: string;
  parent_id: number;
  avatar_url: string;
  web_url: string;
}

export interface ProjectPermissions {
  project_access: {
    access_level: number;
    notification_level: string;
  } | null;
  group_access: {
    access_level: number;
    notification_level: string;
  } | null;
}

export interface ProjectLinks {
  self: string;
  issues: string;
  merge_requests: string;
  repo_branches: string;
  labels: string;
  events: string;
  members: string;
  cluster_agents: string;
}

export interface GitLabProject {
  id: number;
  description: string;
  default_branch: string;
  visibility: string;
  ssh_url_to_repo: string;
  http_url_to_repo: string;
  web_url: string;
  readme_url: string;
  topics: string[];
  owner: GitLabUser;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  open_issues_count: number;
  resolve_outdated_diff_discussions: boolean;
  container_expiration_policy: ContainerExpirationPolicy;
  container_registry_access_level: string;
  container_registry_image_prefix: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  creator_id: number;
  namespace: ProjectNamespace;
  permissions: ProjectPermissions;
  marked_for_deletion_on: string | null;
  empty_repo: boolean;
  archived: boolean;
  avatar_url: string;
  license_url: string;
  license: any | null;
  shared_runners_enabled: boolean;
  group_runners_enabled: boolean;
  resource_group_default_process_mode: string;
  runner_token_expiration_interval: number;
  forks_count: number;
  star_count: number;
  runners_token: string;
  allow_merge_on_skipped_pipeline: boolean;
  allow_pipeline_trigger_approve_deployment: boolean;
  only_allow_merge_if_pipeline_succeeds: boolean;
  only_allow_merge_if_all_discussions_are_resolved: boolean;
  remove_source_branch_after_merge: boolean;
  prevent_merge_without_jira_issue: boolean;
  printing_merge_request_link_enabled: boolean;
  lfs_enabled: boolean;
  repository_storage: string;
  request_access_enabled: boolean;
  merge_method: string;
  can_create_merge_request_in: boolean;
  forked_from_project: any | null;
  mirror: boolean;
  mirror_user_id: number;
  mirror_trigger_builds: boolean;
  only_mirror_protected_branches: boolean;
  mirror_overwrites_diverged_branches: boolean;
  packages_enabled: boolean;
  service_desk_enabled: boolean;
  service_desk_address: string;
  issues_access_level: string;
  releases_access_level: string;
  repository_access_level: string;
  merge_requests_access_level: string;
  forking_access_level: string;
  wiki_access_level: string;
  builds_access_level: string;
  snippets_access_level: string;
  pages_access_level: string;
  operations_access_level: string;
  analytics_access_level: string;
  environments_access_level: string;
  feature_flags_access_level: string;
  infrastructure_access_level: string;
  monitor_access_level: string;
  autoclose_referenced_issues: boolean;
  suggestion_commit_message: string;
  squash_option: string;
  enforce_auth_checks_on_uploads: boolean;
  shared_with_groups: any[];
  statistics: any | null;
  _links: ProjectLinks;
  import_url: string;
  import_type: string;
  import_status: string;
  import_error: string;
  ci_default_git_depth: number;
  ci_forward_deployment_enabled: boolean;
  ci_forward_deployment_rollback_allowed: boolean;
  ci_push_repository_for_job_token_allowed: boolean;
  ci_id_token_sub_claim_components: string[];
  ci_separated_caches: boolean;
  ci_job_token_scope_enabled: boolean;
  ci_opt_in_jwt: boolean;
  ci_allow_fork_pipelines_to_run_in_parent_project: boolean;
  ci_restrict_pipeline_cancellation_role: string;
  public_jobs: boolean;
  build_timeout: number;
  auto_cancel_pending_pipelines: string;
  ci_config_path: string;
  custom_attributes: any | null;
  compliance_frameworks: any[];
  build_coverage_regex: string;
  issues_template: string;
  merge_requests_template: string;
  issue_branch_template: string;
  keep_latest_artifact: boolean;
  merge_pipelines_enabled: boolean;
  merge_trains_enabled: boolean;
  merge_trains_skip_train_allowed: boolean;
  ci_pipeline_variables_minimum_override_role: string;
  merge_commit_template: string;
  squash_commit_template: string;
  auto_devops_deploy_strategy: string;
  auto_devops_enabled: boolean;
  build_git_strategy: string;
  emails_enabled: boolean;
  external_authorization_classification_label: string;
  requirements_enabled: boolean;
  requirements_access_level: string;
  security_and_compliance_enabled: boolean;
  security_and_compliance_access_level: string;
  mr_default_target_self: boolean;
  model_experiments_access_level: string;
  model_registry_access_level: string;
  pre_receive_secret_detection_enabled: boolean;
  auto_duo_code_review_enabled: boolean;
  tag_list: string[];
  issues_enabled: boolean;
  merge_requests_enabled: boolean;
  approvals_before_merge: number;
  jobs_enabled: boolean;
  wiki_enabled: boolean;
  snippets_enabled: boolean;
  container_registry_enabled: boolean;
  marked_for_deletion_at: string | null;
  restrict_user_defined_variables: boolean;
  emails_disabled: boolean;
  public_builds: boolean;
}

export interface GitlabProjectLabel {
  id: number;
  name: string;
  color: string;
  text_color: string;
  description: string;
  open_issues_count: number;
  closed_issues_count: number;
  open_merge_requests_count: number;
  subscribed: boolean;
  priority: number;
  is_project_label: boolean;
}

export interface GitLabProjectMember {
  id: number;
  username: string;
  email: string;
  name: string;
  state: string;
  created_at: string;
  created_by: {
    id: number;
    username: string;
    name: string;
    state: string;
    avatar_url: string;
    web_url: string;
  };
  expires_at: null;
  access_level: number;
  web_url: string;
  avatar_url: string;
  member_role: null;
}
