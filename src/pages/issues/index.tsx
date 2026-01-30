import React, { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { IssueFilterState } from '@/types/issues';
import { IssueDetailPage } from './detail';
import { IssueFilterBar } from './components/filter-bar';
import { IssueList } from './components/issue-list';
import { useGetProjects } from '@/hooks/use-get-projects';
import { useGetLabels } from '@/hooks/use-get-labels';
import { useGetIssues } from './hooks/use-get-issues';
import { usePinnedIssues } from '@/hooks/use-pinned-issues';
import { Issue } from '@/api/issue';

interface IssuesPageProps {
  initialIssue?: Issue | null;
  portalContainer?: HTMLElement | null;
}

export const IssuesPage: React.FC<IssuesPageProps> = ({
  initialIssue,
  portalContainer,
}) => {
  const [filters, setFilters] = useState<IssueFilterState>({
    search: '',
    projectId: 'ALL',
    status: 'ALL',
    labels: [],
    sort: 'UPDATED',
    quickFilters: {
      assignedToMe: false,
      createdByMe: false,
      highPriority: false,
      inQa: false,
      blocked: false,
      hasOpenMr: false,
      unassigned: false,
    },
  });
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(
    initialIssue || null
  );

  React.useEffect(() => {
    if (initialIssue) {
      setSelectedIssue(initialIssue);
    }
  }, [initialIssue]);

  // Fetch filter options
  const projects = useGetProjects();
  const labels = useGetLabels(filters.projectId);

  const issues = useGetIssues(filters);
  const { togglePin, isPinned } = usePinnedIssues();

  // Map options
  const projectOptions = useMemo(() => {
    if (!Array.isArray(projects.data)) return [];

    return projects.data.map(p => ({
      label: p.name_with_namespace || p.name,
      value: p.id,
    }));
  }, [projects.data]);

  const labelOptions = useMemo(() => {
    return labels.data.map(l => ({
      label: l.name,
      value: l.name,
    }));
  }, [labels.data]);

  const handleFilterChange = <K extends keyof IssueFilterState>(
    key: K,
    value: IssueFilterState[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // If an issue is selected, show the detail page instead of the list
  if (selectedIssue) {
    return (
      <AnimatePresence mode="wait">
        <IssueDetailPage
          key={selectedIssue.id}
          issue={selectedIssue}
          onBack={() => setSelectedIssue(null)}
          portalContainer={portalContainer}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="flex flex-1 w-full flex-col overflow-hidden">
      {/* Header & Filters */}
      <div className="flex-none space-y-4 px-8 pt-8 pb-4 border-b border-gray-100 bg-white z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issues</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage issues across your projects
          </p>
        </div>
        <IssueFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          projectOptions={projectOptions}
          labelOptions={labelOptions}
          portalContainer={portalContainer}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full overflow-y-auto overscroll-contain mt-2 px-8 pb-8">
        <IssueList
          issues={issues.data}
          isLoading={issues.isLoading}
          isProjectFiltered={filters.projectId !== 'ALL'}
          onIssueClick={setSelectedIssue}
          onPin={togglePin}
          isPinned={isPinned}
        />
      </div>
    </div>
  );
};

export default IssuesPage;
