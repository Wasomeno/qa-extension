import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { AnimatePresence } from 'framer-motion';
import {
  FiX,
  FiSend,
  FiLoader,
  FiAlertTriangle,
  FiCheckCircle,
  FiEdit3,
} from 'react-icons/fi';

import { apiService, GitLabUser } from '@/services/api';
import { storageService } from '@/services/storage';
import { IssueData, UserData } from '@/types/messages';
import { Label } from '@/src/components/ui/ui/label';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/src/components/ui/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/ui/card';
import { Input } from '@/src/components/ui/ui/input';
import { Button } from '@/src/components/ui/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/ui/select';
import { Badge } from '@/src/components/ui/ui/badge';
import { Textarea } from '@/src/components/ui/ui/textarea';
import { formatProjectName } from '@/utils/project-formatter';

interface IssueCreatorProps {
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
  className?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  path_with_namespace?: string;
}

export const IssueCreator: React.FC<IssueCreatorProps> = ({
  initialData = {},
  context,
  onSubmit,
  onCancel,
  onSaveDraft,
  className = '',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<GitLabUser[]>([]);
  const [user, setUser] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Partial<IssueData> | null>(
    null
  );
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState<any>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IssueData>({
    defaultValues: {
      description: initialData.description || '',
      projectId: initialData.projectId || '',
      assigneeId: initialData.assigneeId || '',
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
    // Auto-save draft every 30 seconds
    const interval = setInterval(() => {
      if (watchedValues.description) {
        saveDraft();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [watchedValues]);

  useEffect(() => {
    // Check for duplicates when description changes
    const debounceTimer = setTimeout(() => {
      if (watchedValues.description) {
        checkForDuplicates('', watchedValues.description);
      }
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(debounceTimer);
  }, [watchedValues.description]);

  const loadInitialData = async (): Promise<void> => {
    try {
      const [projectsResponse, userData] = await Promise.all([
        apiService.getProjects(),
        storageService.getUser(),
      ]);

      console.log(projectsResponse);

      if (projectsResponse.success) {
        console.log('Projects loaded:', projectsResponse.data);
        setProjects(projectsResponse.data || []);

        // Set default project if available
        if (!initialData.projectId && userData?.preferences?.defaultProject) {
          setValue('projectId', userData.preferences.defaultProject);
        }
      } else {
        console.error('Failed to load projects:', projectsResponse.error);
      }

      setUser(userData || null);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadUsers = async (projectId: string): Promise<void> => {
    try {
      // First try to get project-specific users
      const projectUsersResponse =
        await apiService.getUsersInProject(projectId);

      if (
        projectUsersResponse.success &&
        projectUsersResponse.data &&
        Array.isArray(projectUsersResponse.data) &&
        projectUsersResponse.data.length > 0
      ) {
        setUsers(projectUsersResponse.data);
        console.log(
          `Loaded ${projectUsersResponse.data.length} project-specific users`
        );
      } else {
        // Fallback to all GitLab users if project-specific users fail or empty
        console.log(
          'Project-specific users failed or empty, trying GitLab users fallback'
        );
        const allUsersResponse = await apiService.getGitLabUsers();
        if (
          allUsersResponse.success &&
          allUsersResponse.data &&
          Array.isArray(allUsersResponse.data)
        ) {
          setUsers(allUsersResponse.data);
          console.log(
            `Loaded ${allUsersResponse.data.length} GitLab users as fallback`
          );
        } else {
          console.log('Both user loading methods failed, setting empty users');
          setUsers([]);
        }
      }
    } catch (error) {
      console.error('Failed to load project users:', error);
      // Try fallback to all GitLab users
      try {
        console.log('Trying GitLab users fallback after error');
        const allUsersResponse = await apiService.getGitLabUsers();
        if (
          allUsersResponse.success &&
          allUsersResponse.data &&
          Array.isArray(allUsersResponse.data)
        ) {
          setUsers(allUsersResponse.data);
          console.log(
            `Loaded ${allUsersResponse.data.length} GitLab users as fallback`
          );
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
      // This would call the duplicate detection API when implemented
      // For now, we'll simulate the check
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

  const saveDraft = async (): Promise<void> => {
    const draftData: IssueData = {
      ...watchedValues,
      errorDetails: context?.elementInfo?.error,
    };

    try {
      await storageService.addDraft(draftData);
      onSaveDraft?.(draftData);
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  };

  const onSubmitForm = async (data: IssueData): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!data.projectId) {
        setError('Please select a project');
        setIsLoading(false);
        return;
      }

      const issueData: IssueData = {
        ...data,
        errorDetails: context?.elementInfo?.error,
      };

      const response = await apiService.createIssue(issueData as any);

      if (response.success) {
        setSuccess('Issue created successfully!');
        onSubmit?.(issueData);
      } else {
        setError(response.error || 'Failed to create issue');
      }
    } catch (error) {
      setError('Failed to create issue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <div className={cn('w-full', className)}>
          <CardHeader className="pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="text-lg">Create New Issue</CardTitle>
                  <CardDescription className="text-xs">
                    Generate detailed issue reports with AI assistance
                  </CardDescription>
                </div>
              </div>
              {onCancel && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onCancel}
                  disabled={isLoading}
                  className="glass-button hover:glass-glow-red p-4"
                >
                  <FiX className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <AnimatePresence>
              {error && (
                <div>
                  <Alert variant="destructive">
                    <FiAlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              )}

              {success && (
                <div>
                  <Alert className="border-green-200 bg-green-50 text-green-800">
                    <FiCheckCircle className="h-4 w-4" />
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                </div>
              )}
            </AnimatePresence>

            {/* Duplicate Detection */}
            <AnimatePresence>
              {duplicateCheck && duplicateCheck.candidates.length > 0 && (
                <div>
                  <Card
                    className={`border-2 ${
                      duplicateCheck.confidence > 0.7
                        ? 'border-yellow-300 bg-yellow-50'
                        : 'border-blue-300 bg-blue-50'
                    }`}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <FiAlertTriangle
                          className={`h-5 w-5 mt-1 ${
                            duplicateCheck.confidence > 0.7
                              ? 'text-yellow-600'
                              : 'text-blue-600'
                          }`}
                        />
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-2">
                            {duplicateCheck.confidence > 0.7
                              ? 'Potential Duplicate Detected'
                              : 'Similar Issues Found'}
                          </h4>
                          <p className="text-sm text-gray-600 mb-3">
                            {duplicateCheck.suggestions.reason}
                          </p>

                          <div className="space-y-2">
                            {duplicateCheck.candidates
                              .slice(0, 3)
                              .map((candidate: any) => (
                                <div
                                  key={candidate.id}
                                  className="bg-white p-3 rounded border"
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h5 className="font-medium text-sm">
                                        {candidate.title}
                                      </h5>
                                      <p className="text-xs text-gray-500 mt-1">
                                        #{candidate.id} • {candidate.status} •{' '}
                                        {Math.round(
                                          candidate.similarityScore * 100
                                        )}
                                        % similar
                                      </p>
                                      <div className="flex gap-1 mt-1">
                                        {candidate.matchReasons.map(
                                          (reason: string, idx: number) => (
                                            <Badge
                                              key={idx}
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {reason}
                                            </Badge>
                                          )
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        window.open(
                                          `/issues/${candidate.id}`,
                                          '_blank'
                                        )
                                      }
                                    >
                                      View
                                    </Button>
                                  </div>
                                </div>
                              ))}
                          </div>

                          {duplicateCheck.confidence > 0.7 && (
                            <div className="mt-4 p-3 bg-yellow-100 rounded border">
                              <p className="text-sm font-medium text-yellow-800 mb-2">
                                Recommendation: Consider updating the existing
                                issue instead
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDuplicateCheck(null)}
                                >
                                  Continue Creating
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    window.open(
                                      `/issues/${duplicateCheck.candidates[0].id}`,
                                      '_blank'
                                    )
                                  }
                                >
                                  Go to Existing Issue
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-8">
              {/* Project Selection */}
              <div className="space-y-3">
                <Label htmlFor="projectId" className="mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded bg-blue-500"></div>
                    </div>
                    Project *
                  </div>
                </Label>
                <Select
                  value={watchedValues.projectId}
                  onValueChange={(value: any) => setValue('projectId', value)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent className="text-sm">
                    {projects.length === 0 ? (
                      <SelectItem value="#">No projects available</SelectItem>
                    ) : (
                      projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {formatProjectName(project)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.projectId && (
                  <p className="text-sm text-red-600 font-medium">
                    {errors.projectId.message}
                  </p>
                )}
              </div>

              {/* Assignee Selection */}
              <div className="space-y-3">
                <Label htmlFor="assigneeId" className="mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-teal-500/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded bg-teal-500"></div>
                    </div>
                    Assignee
                  </div>
                </Label>
                <Select
                  value={watchedValues.assigneeId || ''}
                  onValueChange={(value: any) =>
                    setValue('assigneeId', value === 'unassigned' ? '' : value)
                  }
                  disabled={isLoading || !watchedValues.projectId}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select an assignee (optional)" />
                  </SelectTrigger>
                  <SelectContent className="text-sm">
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.length === 0 ? (
                      <SelectItem value="#" disabled>
                        {watchedValues.projectId
                          ? 'Loading users...'
                          : 'Select a project first'}
                      </SelectItem>
                    ) : (
                      users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            {user.avatarUrl && (
                              <img
                                src={user.avatarUrl}
                                alt={user.name}
                                className="w-4 h-4 rounded-full"
                                onError={e => {
                                  (e.target as HTMLImageElement).style.display =
                                    'none';
                                }}
                              />
                            )}
                            <span>{user.name}</span>
                            <span className="text-gray-500">
                              (@{user.username})
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-4">
                <Label htmlFor="description" className="mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-purple-500/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded bg-purple-500"></div>
                    </div>
                    Description *
                  </div>
                </Label>
                <Textarea
                  {...register('description', {
                    required: 'Description is required',
                  })}
                  rows={6}
                  className="text-sm"
                  placeholder="Detailed description of the issue, steps to reproduce, expected vs actual behavior..."
                  disabled={isLoading}
                />
                {errors.description && (
                  <p className="text-sm text-red-600 font-medium">
                    {errors.description.message}
                  </p>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex flex-col gap-6 pt-8 border-t border-white/10">
                <div className="flex items-center justify-center gap-3 text-sm">
                  {isCheckingDuplicates && (
                    <div className="flex items-center gap-2 glass-subtle bg-blue-50/30 px-4 py-2 rounded-full">
                      <FiLoader className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-blue-700 font-medium">
                        Checking for duplicates...
                      </span>
                    </div>
                  )}
                  {duplicateCheck && !isCheckingDuplicates && (
                    <div className="flex items-center gap-2 glass-subtle bg-green-50/30 px-4 py-2 rounded-full">
                      <FiCheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-700 font-medium">
                        {duplicateCheck.candidates.length === 0
                          ? 'No duplicates found'
                          : `${duplicateCheck.candidates.length} similar issue(s) found`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-4 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={saveDraft}
                    disabled={isLoading}
                    className="glass-button glass-glow-blue flex-1 bg-gray-500/20 text-gray-700 border-gray-300/30 hover:bg-gray-500/30 px-6"
                  >
                    <FiEdit3 className="h-4 w-4" />
                    Save Draft
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading || !watchedValues.description}
                    className="glass-button glass-glow-green flex-1 bg-green-500/20 text-green-700 border-green-300/30 hover:bg-green-500/300"
                  >
                    {isLoading ? (
                      <>
                        <FiLoader className="h-4 w-4 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <FiSend className="h-4 w-4" />
                        Create Issue
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </div>
      </div>
    </div>
  );
};

export default IssueCreator;
