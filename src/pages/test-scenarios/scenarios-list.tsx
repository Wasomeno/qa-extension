import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Terminal, Info } from 'lucide-react';

import { testScenarioApi } from '@/api/test-scenario';
import { getProjects } from '@/api/project';
import { useNavigation } from '@/contexts/navigation-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { SearchablePicker } from '../issues/components/searchable-picker';
import { UploadWizard } from './components/upload-wizard';
import { ScenarioItem } from './components/scenario-item';

const ScenarioSkeleton = () => (
  <div className="flex flex-col border rounded-xl overflow-hidden bg-white shadow-sm h-full">
    <div className="p-4 flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2 pr-16">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-12 rounded-full shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-1 py-3 border-y border-zinc-50 mb-4">
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="flex flex-col items-center gap-1 border-x border-zinc-50">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>
      <div className="mt-auto pt-2 flex items-center gap-2">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  </div>
);

export const TestScenariosPage: React.FC<{
  portalContainer?: HTMLElement | null;
}> = ({ portalContainer }) => {
  const { push } = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [projectSearch, setProjectSearch] = useState('');

  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Queries
  const {
    data: scenarios = [],
    refetch,
    isLoading: isScenariosLoading,
  } = useQuery({
    queryKey: ['test-scenarios'],
    queryFn: testScenarioApi.listScenarios,
    refetchInterval: 5000, // Poll every 5s for generation status updates
  });

  const { data: projectsData, isLoading: isProjectsLoading } = useQuery({
    queryKey: ['projects', projectSearch],
    queryFn: () => getProjects(projectSearch),
  });

  const isLoading = isScenariosLoading || isProjectsLoading;
  const projects = projectsData?.data?.projects || [];

  // Handlers
  const handleDelete = async (id: string) => {
    try {
      await testScenarioApi.deleteScenario(id);
      refetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerate = (id: string, sheetNames: string[]) => {
    // Triggers generation for selected sheets from the outer view
    testScenarioApi.generateTests(id, sheetNames).then(() => refetch());
  };

  const filteredItems = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return scenarios.filter(s => {
      const matchesSearch = s.fileName.toLowerCase().includes(searchLower);
      const matchesProject =
        selectedProjectId === 'all' ||
        s.projectId?.toString() === selectedProjectId ||
        (selectedProjectId === 'unassigned' && !s.projectId);
      return matchesSearch && matchesProject;
    });
  }, [scenarios, selectedProjectId, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      {/* Header & Filters */}
      <div className="flex-none space-y-4 px-8 pt-8 pb-4 bg-white z-20">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Test Scenarios</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full p-0 text-gray-400 hover:text-gray-600"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs" container={portalContainer}>
                  <p>
                    Review and oversee AI-generated test scenarios imported from
                    XLSX files. Facilitates the transition from manual test requirements
                    to automated AI-driven scripts.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Review and manage AI-generated test scenarios
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search scenarios..."
                className="pl-9 w-64 h-10 bg-white border-theme-border rounded-xl focus-visible:ring-2 focus-visible:ring-zinc-900"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <SearchablePicker
              options={[
                { label: 'Unassigned', value: 'unassigned' },
                ...projects.map((p: any) => ({
                  label: p.name_with_namespace || p.name,
                  value: p.id.toString(),
                })),
              ]}
              value={selectedProjectId}
              onSelect={val => setSelectedProjectId(val as string)}
              placeholder="All Projects"
              searchPlaceholder="Search projects by name..."
              allOption={{ label: 'All Projects', value: 'all' }}
              portalContainer={portalContainer}
              onSearchChange={setProjectSearch}
              shouldFilter={false}
            />
          </div>

          <Button
            variant="ghost"
            className="hover:bg-zinc-50 border text-zinc-900 rounded-full gap-2 px-4 h-10"
            onClick={e => {
              e.stopPropagation();
              setIsWizardOpen(true);
            }}
          >
            <Plus className="w-5 h-5" /> Import Scenarios (.xlsx)
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            <div className="p-6">
              <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <ScenarioSkeleton key={i} />
                    ))
                  ) : filteredItems.length > 0 ? (
                    filteredItems.map(item => (
                      <div key={item.id} onClick={e => e.stopPropagation()}>
                        <ScenarioItem
                          scenario={item}
                          isSelected={false}
                          onClick={() => {
                            push('test-scenario-detail', item);
                          }}
                          onGenerate={e => {
                            e.stopPropagation();
                            // default to first sheet if hitting play from outer
                            if (item.sheets.length > 0) {
                              handleGenerate(item.id, [item.sheets[0].name]);
                            }
                          }}
                          onDelete={e => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200">
                      <Terminal className="w-12 h-12 mb-2 opacity-20" />
                      <p>
                        No test scenarios found. Import an XLSX file to get
                        started.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>
      </div>

      <UploadWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => refetch()}
        portalContainer={portalContainer}
      />
    </div>
  );
};
