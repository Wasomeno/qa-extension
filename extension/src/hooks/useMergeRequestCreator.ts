import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { MergeRequestData } from '@/types/messages';
import { getLastUsedPreset, saveLastUsedPreset } from '@/utils/mrPresets';

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
  labelIds: string[];
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
  labels?: string;
  remove_source_branch?: boolean;
  squash?: boolean;
  slack_channel_id?: string;
  slack_user_ids?: string[];
};

export function useMergeRequestCreator(options: UseMergeRequestCreatorOptions) {
  const { initialData = {}, onSubmit, onCancel } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [usedPreset, setUsedPreset] = useState(false);
  const [lastCreatedMr, setLastCreatedMr] = useState<any | null>(null);
  const [slackNotification, setSlackNotification] =
    useState<SlackNotificationState | null>(null);

  // Form setup
  const {
    register,
    handleSubmit: rhfHandleSubmit,
    setValue,
    watch,
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
      labelIds: initialData.labelIds || [],
      removeSourceBranch: initialData.removeSourceBranch ?? true,
      squash: initialData.squash ?? false,
      slackChannelId: initialData.slackChannelId || '',
      slackUserIds: initialData.slackUserIds || [],
    },
  });

  const watchedValues = watch();

  // Fetch projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiService.getProjects();
      if (!res.success) throw new Error(res.error || 'Failed to load projects');
      return res.data || [];
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

    // Skip if form already has values (from initialData)
    const hasExistingValues =
      watchedValues.labelIds?.length ||
      watchedValues.assigneeIds?.length ||
      watchedValues.reviewerIds?.length;

    if (hasExistingValues) return;

    const preset = getLastUsedPreset(watchedValues.projectId);
    if (!preset) return;

    // Apply preset values
    if (preset.labelIds?.length) {
      setValue('labelIds', preset.labelIds, { shouldValidate: false });
    }
    if (preset.assigneeIds?.length) {
      setValue('assigneeIds', preset.assigneeIds, { shouldValidate: false });
    }
    if (preset.reviewerIds?.length) {
      setValue('reviewerIds', preset.reviewerIds, { shouldValidate: false });
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
    }
    if (preset.slackUserIds?.length) {
      setValue('slackUserIds', preset.slackUserIds, { shouldValidate: false });
    }

    setUsedPreset(true);

    // Clear the indicator after 3 seconds
    setTimeout(() => setUsedPreset(false), 3000);
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
        labels: data.labelIds?.join(',') || '',
        remove_source_branch: data.removeSourceBranch,
        squash: data.squash,
      };

      if (data.slackChannelId) {
        payload.slack_channel_id = data.slackChannelId;
      }

      if (data.slackUserIds && data.slackUserIds.length > 0) {
        payload.slack_user_ids = data.slackUserIds;
      }

      console.log('Creating merge request with payload:', payload);

      const result = await apiService.createMergeRequest(
        data.projectId,
        payload
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create merge request');
      }

      console.log('Merge request created successfully:', result.data);

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
        saveLastUsedPreset(data.projectId, {
          projectId: data.projectId,
          labelIds: data.labelIds,
          assigneeIds: data.assigneeIds,
          reviewerIds: data.reviewerIds,
          removeSourceBranch: data.removeSourceBranch,
          squash: data.squash,
          slackChannelId: data.slackChannelId,
          slackUserIds: data.slackUserIds,
        });
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
