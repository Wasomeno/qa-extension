import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wrench, ArrowRight, Loader2, GitBranch, FolderGit2 } from 'lucide-react';
import { Issue } from '@/api/issue';
import { useStartFixIssue } from '@/pages/agent/hooks/use-fix-sessions';
import { getProjectBranches, GitLabBranch } from '@/api/project';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@/contexts/navigation-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProjectSelect } from '@/components/project-select';
import { GitLabProject } from '@/types/project';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FixIssueModalProps {
  issue: Issue;
  isOpen: boolean;
  onClose: () => void;
  portalContainer?: HTMLElement | null;
}

export const FixIssueModal: React.FC<FixIssueModalProps> = ({
  issue,
  isOpen,
  onClose,
  portalContainer,
}) => {
  const [selectedProject, setSelectedProject] = useState<GitLabProject | null>(null);
  const [targetBranch, setTargetBranch] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startFixMutation = useStartFixIssue();
  const { push } = useNavigation();

  // Initialize with the issue's project
  useEffect(() => {
    if (isOpen && !selectedProject) {
      setSelectedProject({
        id: issue.project_id,
        name: issue.project_name,
        path_with_namespace: issue.project_name,
      } as GitLabProject);
    }
  }, [isOpen, issue, selectedProject]);

  // Fetch branches for selected project
  const { data: branchesData, isLoading: isLoadingBranches } = useQuery({
    queryKey: ['project-branches', selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject?.id) return [];
      const response = await getProjectBranches(selectedProject.id);
      return response.data?.branches || [];
    },
    enabled: isOpen && !!selectedProject?.id,
    staleTime: 30000, // Cache for 30 seconds
  });

  const branches = branchesData || [];
  
  // Set default branch when branches are loaded
  useEffect(() => {
    if (branches.length > 0 && !targetBranch) {
      const defaultBranch = branches.find(b => b.default);
      setTargetBranch(defaultBranch?.name || branches[0]?.name || 'main');
    }
  }, [branches, targetBranch]);

  const handleStartFix = async () => {
    if (!selectedProject) {
      toast.error('Please select a project');
      return;
    }

    if (!targetBranch) {
      toast.error('Please select a target branch');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await startFixMutation.mutateAsync({
        projectId: issue.project_id,
        issueIid: issue.iid,
        repoProjectId: selectedProject.id,
        targetBranch: targetBranch,
      });

      toast.success('Fix agent started in background', {
        description: 'You can track progress in the Fix Agent Sessions page',
        action: {
          label: 'View Sessions',
          onClick: () => {
            onClose();
            push('agent-sessions' as any, { tab: 'fix' });
          },
        },
      });

      onClose();
    } catch (error: any) {
      toast.error('Failed to start fix agent', {
        description: error.message || 'Please try again',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isSubmitting]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedProject(null);
      setTargetBranch('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000000]"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-[1000001] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ 
                duration: 0.25,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden pointer-events-auto mx-4"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gray-100 rounded-xl">
                    <Wrench className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      Fix Issue with Agent
                    </h3>
                    <p className="text-xs text-gray-500">
                      Configure and start the fix process
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className={cn(
                    "p-2 hover:bg-gray-100 rounded-lg transition-colors",
                    isSubmitting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-5">
                {/* Issue Info */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
                      #{issue.iid}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">
                        {issue.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {issue.project_name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Project Selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <FolderGit2 className="w-3.5 h-3.5" />
                    Repository Project
                  </label>
                  <ProjectSelect
                    value={selectedProject?.id || null}
                    onSelect={(project) => {
                      setSelectedProject(project);
                      setTargetBranch(''); // Reset branch when project changes
                    }}
                    mode="single"
                    size="default"
                    placeholder="Select repository..."
                    portalContainer={portalContainer}
                    stopPropagation
                  />
                  <p className="text-xs text-gray-500">
                    The project where the fix will be applied
                  </p>
                </div>

                {/* Branch Selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <GitBranch className="w-3.5 h-3.5" />
                    Target Branch
                  </label>
                  
                  {!selectedProject ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-sm text-gray-400">Select a project first</span>
                    </div>
                  ) : isLoadingBranches ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      <span className="text-sm text-gray-500">Loading branches...</span>
                    </div>
                  ) : (
                    <Select
                      value={targetBranch}
                      onValueChange={setTargetBranch}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Select target branch" />
                      </SelectTrigger>
                      <SelectContent container={portalContainer}>
                        {branches.map(branch => (
                          <SelectItem key={branch.name} value={branch.name}>
                            <div className="flex items-center gap-2">
                              <span>{branch.name}</span>
                              {branch.default && (
                                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                  DEFAULT
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-gray-500">
                    The branch to create the fix from
                  </p>
                </div>

                {/* Info Message */}
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-gray-600">i</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    The fix agent will run in the background. You can monitor its progress in the{' '}
                    <button
                      onClick={() => {
                        onClose();
                        push('agent-sessions' as any, { tab: 'fix' });
                      }}
                      className="text-gray-700 hover:text-gray-900 font-medium underline"
                    >
                      Fix Agent Sessions
                    </button>{' '}
                    page.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className={cn(
                    "px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors",
                    isSubmitting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartFix}
                  disabled={isSubmitting || !targetBranch || !selectedProject || isLoadingBranches}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-sm",
                    (isSubmitting || !targetBranch || !selectedProject || isLoadingBranches) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      Start Fix Agent
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
