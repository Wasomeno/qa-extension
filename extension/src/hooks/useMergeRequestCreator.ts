import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import useAuth from '@/hooks/useAuth';
import { MergeRequestData } from '@/types/messages';
import {
  getLastUsedPreset,
  saveLastUsedPreset,
  type MRPreset,
} from '@/utils/mrPresets';

interface UseMergeRequestCreatorOptions {
  initialData?: Partial<MergeRequestData>;
  onSubmit?: (mr: MergeRequestData) => void;
  onCancel?: () => void;
}

interface MergeRequestFormData {
  projectId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  assigneeIds: number[];
  reviewerIds: number[];
  removeSourceBranch: boolean;
  squash: boolean;
  slackChannelId?: string;
  slackUserIds?: string[];
}

interface SlackNotificationState {
  status: 'sent' | 'failed';
  channel: string;
  ts?: string;
  error?: string;
}

type CreateMergeRequestPayload = {
  source_branch: string;
  target_branch: string;
  title: string;
  description?: string;
  assignee_ids?: number[];
  reviewer_ids?: number[];
  remove_source_branch?: boolean;
  squash?: boolean;
  slack_channel_id?: string;
  slack_user_ids?: string[];
};

export function useMergeRequestCreator(options: UseMergeRequestCreatorOptions) {
  const { initialData = {}, onSubmit, onCancel } = options;
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [usedPreset, setUsedPreset] = useState(false);
  const [lastCreatedMr, setLastCreatedMr] = useState<any | null>(null);
  const [slackNotification, setSlackNotification] =
    useState<SlackNotificationState | null>(null);
  const [lastProjectId, setLastProjectId] = useState<string | undefined>(
    initialData.projectId
  );

  // Form setup
  const {
    register,
    handleSubmit: rhfHandleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<MergeRequestFormData>({
    defaultValues: {
      projectId: initialData.projectId || '',
      sourceBranch: initialData.sourceBranch || '',
      targetBranch: initialData.targetBranch || '',
      title: initialData.title || '',
      description: initialData.description || '',
      assigneeIds: initialData.assigneeIds || [],
      reviewerIds: initialData.reviewerIds || [],
      removeSourceBranch: initialData.removeSourceBranch ?? true,
      squash: initialData.squash ?? false,
      slackChannelId: initialData.slackChannelId || '',
      slackUserIds: initialData.slackUserIds || [],
    },
  });

  const watchedValues = watch();

  // Fetch projects with recent projects priority
  const { data: projectsData } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: async () => {
      const res = await apiService.getProjects();
      if (!res.success) throw new Error(res.error || 'Failed to load projects');

      let combinedProjects = res.data || [];

      // If user is authenticated, fetch recent projects and combine
      if (user?.id) {
        try {
          const recentRes = await apiService.getRecentProjects(user.id);
          if (recentRes.success && recentRes.data) {
            const recentProjects = recentRes.data || [];

            // Combine recent projects with all projects, deduping by ID
            const projectMap = new Map<string, any>();

            // Add recent projects first (higher priority)
            recentProjects.forEach(project => {
              projectMap.set(String(project.id), project);
            });

            // Add all projects, only if not already added
            combinedProjects.forEach(project => {
              const id = String(project.id);
              if (!projectMap.has(id)) {
                projectMap.set(id, project);
              }
            });

            combinedProjects = Array.from(projectMap.values());
          }
        } catch (error) {
          // Ignore errors, just use the regular projects
          console.warn('Failed to fetch recent projects:', error);
        }
      }

      return combinedProjects;
    },
    staleTime: 300_000, // 5 minutes
  });

  const projects = projectsData || [];

  // Fetch branches for selected project
  const { data: branchesData } = useQuery({
    queryKey: ['branches', watchedValues.projectId],
    queryFn: async () => {
      if (!watchedValues.projectId) return [];
      const res = await apiService.getProjectBranches(watchedValues.projectId);
      if (!res.success) throw new Error(res.error || 'Failed to load branches');
      return res.data?.items || [];
    },
    enabled: !!watchedValues.projectId,
    staleTime: 180_000, // 3 minutes
  });

  const branches = branchesData || [];

  // Fetch project members (for assignees/reviewers)
  const { data: usersData } = useQuery({
    queryKey: ['project-members', watchedValues.projectId],
    queryFn: async () => {
      if (!watchedValues.projectId) return [];
      const res = await apiService.getUsersInProject(watchedValues.projectId);
      if (!res.success) throw new Error(res.error || 'Failed to load members');
      return res.data || [];
    },
    enabled: !!watchedValues.projectId,
    staleTime: 300_000, // 5 minutes
  });

  const users = usersData || [];

  useEffect(() => {
    const currentProjectId = watchedValues.projectId || '';
    if (lastProjectId !== undefined && lastProjectId !== currentProjectId) {
      setValue('sourceBranch', '', { shouldValidate: false });
      setValue('targetBranch', '', { shouldValidate: false });
      setValue('assigneeIds', [], { shouldValidate: false });
      setValue('reviewerIds', [], { shouldValidate: false });
      setValue('slackChannelId', '', { shouldValidate: false });
      setValue('slackUserIds', [], { shouldValidate: false });
    }
    setLastProjectId(currentProjectId);
  }, [watchedValues.projectId, lastProjectId, setValue]);

  // Auto-select default branch as target if available
  useEffect(() => {
    if (branches.length > 0 && !watchedValues.targetBranch) {
      const defaultBranch = branches.find(b => b.default);
      if (defaultBranch) {
        setValue('targetBranch', defaultBranch.name, { shouldValidate: false });
      }
    }
  }, [branches, watchedValues.targetBranch, setValue]);

  // Load last used preset when project is selected
  useEffect(() => {
    if (!watchedValues.projectId) return;

    const preset = getLastUsedPreset(watchedValues.projectId);
    if (!preset) return;

    let applied = false;

    if (preset.assigneeIds?.length && !watchedValues.assigneeIds?.length) {
      setValue('assigneeIds', preset.assigneeIds, { shouldValidate: false });
      applied = true;
    }
    if (preset.reviewerIds?.length && !watchedValues.reviewerIds?.length) {
      setValue('reviewerIds', preset.reviewerIds, { shouldValidate: false });
      applied = true;
    }
    if (preset.targetBranch && !watchedValues.targetBranch) {
      setValue('targetBranch', preset.targetBranch, { shouldValidate: false });
      applied = true;
    }
    if (preset.sourceBranch && !watchedValues.sourceBranch) {
      setValue('sourceBranch', preset.sourceBranch, { shouldValidate: false });
      applied = true;
    }

    if (preset.removeSourceBranch !== undefined) {
      setValue('removeSourceBranch', preset.removeSourceBranch, {
        shouldValidate: false,
      });
    }
    if (preset.squash !== undefined) {
      setValue('squash', preset.squash, { shouldValidate: false });
    }
    if (preset.slackChannelId) {
      setValue('slackChannelId', preset.slackChannelId, {
        shouldValidate: false,
      });
      applied = true;
    }
    if (preset.slackUserIds?.length) {
      setValue('slackUserIds', preset.slackUserIds, { shouldValidate: false });
      applied = true;
    }

    if (applied) {
      setUsedPreset(true);
      setTimeout(() => setUsedPreset(false), 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.projectId, setValue]);

  // Submit handler with duplicate prevention
  const handleSubmit = rhfHandleSubmit(async data => {
    // Prevent duplicate submissions
    if (isLoading) {
      console.warn(
        'Submission already in progress, ignoring duplicate request'
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setLastCreatedMr(null);
    setSlackNotification(null);

    try {
      const payload: CreateMergeRequestPayload = {
        source_branch: data.sourceBranch,
        target_branch: data.targetBranch,
        title: data.title,
        description: data.description || '',
        assignee_ids: data.assigneeIds || [],
        reviewer_ids: data.reviewerIds || [],
        remove_source_branch: data.removeSourceBranch,
        squash: data.squash,
      };

      if (data.slackChannelId) {
        payload.slack_channel_id = data.slackChannelId;
      }

      if (data.slackUserIds && data.slackUserIds.length > 0) {
        payload.slack_user_ids = data.slackUserIds;
      }

      const result = await apiService.createMergeRequest(
        data.projectId,
        payload
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create merge request');
      }

      const responseData = (result.data || {}) as {
        mergeRequest?: any;
        slackNotification?: SlackNotificationState | null;
      };
      const mergeRequest =
        responseData.mergeRequest !== undefined
          ? responseData.mergeRequest
          : responseData;
      const slackResult =
        responseData.slackNotification !== undefined
          ? responseData.slackNotification
          : null;

      setLastCreatedMr(mergeRequest);
      setSlackNotification(slackResult);

      let successMessage = 'Merge request created successfully!';
      if (slackResult?.status === 'sent') {
        successMessage = 'Merge request created and shared to Slack.';
      } else if (slackResult?.status === 'failed') {
        successMessage = 'Merge request created. Slack notification failed.';
      }

      setSuccess(successMessage);

      // Save preset for future use
      if (data.projectId) {
        const projectName =
          projects.find(p => p.id === data.projectId)?.name ||
          (mergeRequest?.project?.name as string | undefined) ||
          data.projectId;

        const presetData: MRPreset = {
          projectId: data.projectId,
          projectName,
          removeSourceBranch: data.removeSourceBranch,
          squash: data.squash,
        };

        if (data.sourceBranch) {
          presetData.sourceBranch = data.sourceBranch;
        }
        if (data.targetBranch) {
          presetData.targetBranch = data.targetBranch;
        }
        if (Array.isArray(data.assigneeIds)) {
          presetData.assigneeIds = data.assigneeIds;
        }
        if (Array.isArray(data.reviewerIds)) {
          presetData.reviewerIds = data.reviewerIds;
        }
        if (data.slackChannelId) {
          presetData.slackChannelId = data.slackChannelId;
        }
        if (Array.isArray(data.slackUserIds)) {
          presetData.slackUserIds = data.slackUserIds;
        }

        saveLastUsedPreset(data.projectId, presetData);
      }

      // Call onSubmit callback if provided
      if (onSubmit) {
        onSubmit(data as MergeRequestData);
      }

      // Reset form after short delay
      setTimeout(() => {
        setSuccess(null);
      }, 6000);
    } catch (err: any) {
      console.error('Failed to create merge request:', err);
      setError(err.message || 'Failed to create merge request');
      setLastCreatedMr(null);
      setSlackNotification(null);
    } finally {
      setIsLoading(false);
    }
  });

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  return {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    watchedValues,
    errors,
    isLoading,
    error,
    success,
    projects,
    branches,
    users,
    handleCancel,
    usedPreset,
    lastCreatedMr,
    slackNotification,
  };
}
