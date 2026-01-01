import React, { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MOCK_ISSUES, CURRENT_USER } from './mock-data';
import { IssueFilterState, MockIssue } from './types';
import { IssueDetailPage } from './issue-detail-page';
import { IssueFilterBar } from './issue-filter-bar';
import { IssueList } from './issue-list';
import { QuickFilterChips } from './quick-filter-chips';

export const IssuesContent: React.FC = () => {
  const [filters, setFilters] = useState<IssueFilterState>({
    search: '',
    projectId: 'ALL',
    status: 'ALL',
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

  const [selectedIssue, setSelectedIssue] = useState<MockIssue | null>(null);

  const handleFilterChange = <K extends keyof IssueFilterState>(
    key: K,
    value: IssueFilterState[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleQuickFilterToggle = (
    key: keyof IssueFilterState['quickFilters']
  ) => {
    setFilters(prev => ({
      ...prev,
      quickFilters: {
        ...prev.quickFilters,
        [key]: !prev.quickFilters[key],
      },
    }));
  };

  // Filter Logic (Client-side mock)
  const filteredIssues = useMemo(() => {
    return MOCK_ISSUES.filter(issue => {
      // Search
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          issue.title.toLowerCase().includes(searchLower) ||
          String(issue.iid).includes(searchLower) ||
          issue.project.name.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Project
      if (filters.projectId !== 'ALL' && issue.project.id !== filters.projectId)
        return false;

      // Status
      if (filters.status !== 'ALL' && issue.status !== filters.status)
        return false;

      // Quick Filters
      if (
        filters.quickFilters.assignedToMe &&
        issue.assignee?.id !== CURRENT_USER.id
      )
        return false;
      if (
        filters.quickFilters.createdByMe &&
        issue.author.id !== CURRENT_USER.id
      )
        return false;
      if (
        filters.quickFilters.highPriority &&
        !issue.labels.some(l => l.name === 'P1' || l.name === 'P2')
      )
        return false;
      if (filters.quickFilters.inQa && issue.status !== 'IN_QA') return false;
      if (filters.quickFilters.blocked && issue.status !== 'BLOCKED')
        return false;
      if (filters.quickFilters.hasOpenMr && issue.mrStatus !== 'OPEN')
        return false;
      if (filters.quickFilters.unassigned && !!issue.assignee) return false;

      return true;
    }).sort((a, b) => {
      switch (filters.sort) {
        case 'NEWEST':
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case 'OLDEST':
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case 'PRIORITY':
          // Mock priority sort: P1 > P2 > others
          const getPriority = (i: MockIssue) => {
            if (i.labels.some(l => l.name === 'P1')) return 3;
            if (i.labels.some(l => l.name === 'P2')) return 2;
            return 1;
          };
          return getPriority(b) - getPriority(a);
        case 'UPDATED':
        default:
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
      }
    });
  }, [filters]);

  // If an issue is selected, show the detail page instead of the list
  if (selectedIssue) {
    return (
      <AnimatePresence mode="wait">
        <IssueDetailPage
          key={selectedIssue.id}
          issue={selectedIssue}
          onBack={() => setSelectedIssue(null)}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header & Filters */}
      <div className="flex-none space-y-4 px-8 pt-8 pb-4 border-b border-gray-100 bg-white z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issues Updated</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage issues across your projects
          </p>
        </div>

        <IssueFilterBar filters={filters} onFilterChange={handleFilterChange} />
        <QuickFilterChips
          filters={filters.quickFilters}
          onToggle={handleQuickFilterToggle}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto mt-2 px-8 pb-8">
        <IssueList
          issues={filteredIssues}
          isProjectFiltered={filters.projectId !== 'ALL'}
          onIssueClick={setSelectedIssue}
          onPin={issue => console.log('Pinned from list:', issue.id)}
        />
      </div>
    </div>
  );
};
