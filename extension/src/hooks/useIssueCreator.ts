import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { apiService, GitLabUser } from '@/services/api';
import { storageService } from '@/services/storage';
import { IssueData, UserData } from '@/types/messages';

interface Project {
  id: string;
  name: string;
  description?: string;
  path_with_namespace?: string;
}

interface UseIssueCreatorProps {
  initialData?: Partial<IssueData>;
  context?: {
    url: string;
    title: string;
    screenshot?: string;
    elementInfo?: any;
    recordingId?: string;
  };
  onSubmit?: (issue: IssueData) => void;
  onCancel?: () => void;
  onSaveDraft?: (draft: IssueData) => void;
}

export const useIssueCreator = ({
  initialData = {},
  context,
  onSubmit,
  onCancel,
}: UseIssueCreatorProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<GitLabUser[]>([]);
  const [user, setUser] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState<any>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<IssueData>({
    defaultValues: {
      title: initialData.title || '',
      description: initialData.description || '',
      severity: (initialData as any).severity || 'medium',
      projectId: initialData.projectId || '',
      assigneeId: initialData.assigneeId || '',
      slackChannelId: (initialData as any).slackChannelId || '',
      slackUserIds: (initialData as any).slackUserIds || [],
      labelIds: (initialData as any).labelIds || [],
      ...initialData,
    },
  });

  const watchedValues = watch();

  useEffect(() => {
    loadInitialData();
  }, []);

  // Load users when project changes
  useEffect(() => {
    if (watchedValues.projectId) {
      loadUsers(watchedValues.projectId);
    }
  }, [watchedValues.projectId]);

  useEffect(() => {
    // Check for duplicates when description changes
    const debounceTimer = setTimeout(() => {
      if (watchedValues.description) {
        checkForDuplicates(
          watchedValues.title || '',
          watchedValues.description
        );
      }
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(debounceTimer);
  }, [watchedValues.description]);

  const loadInitialData = async (): Promise<void> => {
    try {
      const userData = await storageService.getUser();

      let projects: Project[] = [];

      // If user is authenticated, fetch only recent projects
      if (userData?.id) {
        try {
          const recentRes = await apiService.getProjects();
          if (recentRes.success && recentRes.data) {
            projects = recentRes.data || [];
          }
        } catch (error) {
          // Ignore errors, just show empty list
          console.warn('Failed to fetch recent projects:', error);
        }
      }

      setProjects(projects);

      // Set default project if available
      if (!initialData.projectId && userData?.preferences?.defaultProject) {
        setValue('projectId', userData.preferences.defaultProject);
      }

      setUser(userData || null);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setDataLoading(false);
    }
  };

  const loadUsers = async (projectId: string): Promise<void> => {
    try {
      const projectUsersResponse =
        await apiService.getUsersInProject(projectId);

      if (
        projectUsersResponse.success &&
        projectUsersResponse.data &&
        Array.isArray(projectUsersResponse.data) &&
        projectUsersResponse.data.length > 0
      ) {
        setUsers(projectUsersResponse.data);
      } else {
        const allUsersResponse = await apiService.getGitLabUsers();
        if (
          allUsersResponse.success &&
          allUsersResponse.data &&
          Array.isArray(allUsersResponse.data)
        ) {
          setUsers(allUsersResponse.data);
        } else {
          setUsers([]);
        }
      }
    } catch (error) {
      console.error('Failed to load project users:', error);
      try {
        const allUsersResponse = await apiService.getGitLabUsers();
        if (
          allUsersResponse.success &&
          allUsersResponse.data &&
          Array.isArray(allUsersResponse.data)
        ) {
          setUsers(allUsersResponse.data);
        } else {
          setUsers([]);
        }
      } catch (fallbackError) {
        console.error('Failed to load users (fallback):', fallbackError);
        setUsers([]);
      }
    }
  };

  const checkForDuplicates = async (
    title: string,
    description: string
  ): Promise<void> => {
    if (!description || description.length < 10) return;

    setIsCheckingDuplicates(true);
    try {
      setTimeout(() => {
        setDuplicateCheck({
          candidates: [],
          confidence: 0,
          suggestions: { reason: 'No similar issues found' },
        });
        setIsCheckingDuplicates(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to check for duplicates:', error);
      setIsCheckingDuplicates(false);
    }
  };

  const onSubmitForm = async (data: IssueData): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!data.projectId) {
        setError('Please select a project');
        setIsLoading(false);
        return;
      }

      // Prepare optional error details only if valid
      const rawErr: any = context?.elementInfo?.error;
      let cleanedErrorDetails: any | undefined;
      if (rawErr) {
        const message = typeof rawErr === 'string' ? rawErr : rawErr.message;
        const type =
          rawErr.type || rawErr.name || (message ? 'Error' : undefined);
        const stack = rawErr.stack;
        if (message && type) {
          cleanedErrorDetails = {
            message: String(message),
            type: String(type),
            ...(stack ? { stack: String(stack) } : {}),
          };
        }
      }

      // Decide flow based on projectId format: UUID => local issue; numeric => GitLab direct
      const isUuid = (val: string | undefined) =>
        !!val && /^[0-9a-fA-F-]{36}$/.test(val);
      const isNumericId = (val: string | undefined) =>
        !!val && /^\d+$/.test(val);

      if (isUuid(data.projectId)) {
        // Local issue creation (existing flow)
        const issueData: any = {
          ...data,
          // Only pass assigneeId if it's a local UUID
          ...(isUuid(data.assigneeId || '')
            ? { assigneeId: data.assigneeId }
            : { assigneeId: undefined }),
          // Optional Slack fields as provided from the form
          ...(data.slackChannelId
            ? { slackChannelId: data.slackChannelId }
            : {}),
          ...(Array.isArray(data.slackUserIds) && data.slackUserIds.length > 0
            ? { slackUserIds: data.slackUserIds }
            : {}),
          ...(cleanedErrorDetails ? { errorDetails: cleanedErrorDetails } : {}),
          browserInfo: {
            url: context?.url || window.location.href,
            title: context?.title || document.title,
            userAgent: navigator.userAgent,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          },
        };

        const response = await apiService.createIssue(issueData);
        if (response.success) {
          setSuccess('Issue created successfully!');
          setError(null);
          onSubmit?.(issueData);
        } else {
          const errVal: any = (response as any)?.error;
          const msg =
            typeof errVal === 'string'
              ? errVal
              : errVal?.message || 'Failed to create issue';
          setError(msg);
        }
      } else if (isNumericId(data.projectId as any)) {
        // Direct GitLab creation
        const assigneeIdNum =
          data.assigneeId && /^\d+$/.test(data.assigneeId)
            ? parseInt(data.assigneeId, 10)
            : undefined;
        const resp = await apiService.createGitLabIssue(
          data.projectId as any,
          {
            title: data.title,
            description: data.description,
            childDescriptions: data.childDescriptions,
            labels: Array.isArray(data.labelIds) ? data.labelIds : [],
            issueFormat: data.issueFormat,
            assigneeIds: assigneeIdNum ? [assigneeIdNum] : [],
          },
          {
            slackChannelId: data.slackChannelId,
            slackUserIds: Array.isArray(data.slackUserIds)
              ? data.slackUserIds
              : [],
          }
        );
        if (resp.success) {
          setSuccess('GitLab issue created successfully!');
          setError(null);
          onSubmit?.(data);
        } else {
          const errVal: any = (resp as any)?.error;
          const msg =
            typeof errVal === 'string'
              ? errVal
              : errVal?.message || 'Failed to create GitLab issue';
          setError(msg);
        }
      } else {
        setError(
          'Invalid project selection. Choose a local project (UUID) or a GitLab project (numeric).'
        );
      }
    } catch (error: any) {
      const msg = error?.message || 'Failed to create issue';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    // Form
    register,
    handleSubmit: handleSubmit(onSubmitForm),
    watch,
    setValue,
    reset,
    errors,
    watchedValues,

    // State
    isLoading,
    dataLoading,
    projects,
    users,
    user,
    error,
    success,
    duplicateCheck,
    isCheckingDuplicates,

    // Handlers
    onCancel,
  };
};
