import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { IssueFilterState } from '@/types/issues';
import { useDebounce } from '@/utils/useDebounce';
import { IssueDetailPage } from './detail';
import { IssueFilterBar } from './components/filter-bar';
import { IssueList } from './components/issue-list';
import { FixIssueModal } from './components/fix-issue-modal';
import { useGetLabels } from '@/hooks/use-get-labels';
import { useGetIssues } from './hooks/use-get-issues';
import { useGetLoggedInUser } from '@/hooks/use-get-logged-in-user';
import { usePinnedIssues } from '@/hooks/use-pinned-issues';
import { Issue } from '@/api/issue';
import { useNavigation } from '@/contexts/navigation-context';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface IssuesPageProps {
  initialIssue?: Issue | null;
  portalContainer?: HTMLElement | null;
}

export const IssuesPage: React.FC<IssuesPageProps> = ({
  initialIssue,
  portalContainer,
}) => {
  const { current, push, pop } = useNavigation();
  const [filters, setFilters] = useLocalStorage<IssueFilterState>(
    'qa-extension-issues-filters',
    {
      search: '',
      projectIds: [],
      status: 'ALL',
      labels: [],
      assigneeIds: ['ALL'],
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
    }
  );

  const debouncedSearch = useDebounce(filters.search, 300);

  const memoizedFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [filters, debouncedSearch]
  );

  // Fetch filter options
  // For labels, we use the first project if only one is selected, otherwise 'ALL'
  const labels = useGetLabels(
    filters.projectIds.length === 1 ? filters.projectIds[0] : 'ALL'
  );

  const issues = useGetIssues(memoizedFilters);
  const { togglePin, isPinned } = usePinnedIssues();

  // State for Fix with Agent modal
  const [fixingIssue, setFixingIssue] = useState<Issue | null>(null);

  // Track if user is still loading - we need this to show proper loading state
  const isUserLoading = useGetLoggedInUser().isLoading;

  // Show loading skeleton while either user is loading or issues are fetching
  const isInitialLoading = isUserLoading || issues.isLoading;

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

  const selectedIssue =
    current.view === 'issue-detail'
      ? (current.params as Issue)
      : initialIssue || null;

  // If an issue is selected, show the detail page instead of the list
  if (selectedIssue) {
    return (
      <AnimatePresence mode="wait">
        <IssueDetailPage
          key={selectedIssue.id}
          issue={selectedIssue}
          onBack={pop}
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
          labelOptions={labelOptions}
          portalContainer={portalContainer}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full overflow-y-auto overscroll-contain mt-2 px-8 pb-8">
        <IssueList
          issues={issues.data}
          isLoading={isInitialLoading}
          isProjectFiltered={filters.projectIds.length === 1}
          onIssueClick={issue => push('issue-detail', issue)}
          onPin={togglePin}
          isPinned={isPinned}
          onFixIssue={setFixingIssue}
        />
      </div>
      {fixingIssue && (
        <FixIssueModal
          issue={fixingIssue}
          isOpen={true}
          onClose={() => setFixingIssue(null)}
          portalContainer={portalContainer}
        />
      )}
    </div>
  );
};

export default IssuesPage;
