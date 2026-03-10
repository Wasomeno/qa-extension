import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Terminal } from 'lucide-react';

import { testScenarioApi } from '@/api/test-scenario';
import { getProjects } from '@/api/project';
import { MessageType } from '@/types/messages';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

import { SearchablePicker } from '../issues/components/searchable-picker';
import { UploadWizard } from './components/upload-wizard';
import { ScenarioItem } from './components/scenario-item';
import { ScenarioDetail } from './components/scenario-detail';

const ScenarioSkeleton = () => (
  <div className="flex flex-col border rounded-xl overflow-hidden bg-white shadow-sm h-full">
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex items-center pt-2 border-t">
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  </div>
);

export const TestScenariosPage: React.FC<{
  portalContainer?: HTMLElement | null;
}> = ({ portalContainer }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [projectSearch, setProjectSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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
      if (selectedId === id) setSelectedId(null);
      refetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerate = (id: string, sheetNames: string[]) => {
    // Triggers generation for selected sheets from the detail view
    testScenarioApi.generateTests(id, sheetNames).then(() => refetch());
  };

  const selectedScenario = useMemo(() => {
    return scenarios.find(s => s.id === selectedId) || null;
  }, [selectedId, scenarios]);

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
      {/* Top Header */}
      <header className="px-6 py-4 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Test Scenarios</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search scenarios..."
                className="pl-9 w-64 h-10 bg-gray-100 border-none rounded-lg focus-visible:ring-2 focus-visible:ring-zinc-900"
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
              className="h-10 w-[180px] bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-zinc-900 pointer-events-auto"
              onSearchChange={setProjectSearch}
              shouldFilter={false}
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 min-h-0 relative">
        <div
          className="flex-1 flex flex-col min-w-0"
          onClick={() => setSelectedId(null)}
        >
          {/* Breadcrumbs & Actions */}
          <div className="px-6 py-3 flex items-center justify-end shrink-0">
            <Button
              variant="ghost"
              className="hover:bg-zinc-50 border text-zinc-900 rounded-full gap-2 px-4"
              onClick={e => {
                e.stopPropagation();
                setIsWizardOpen(true);
              }}
            >
              <Plus className="w-5 h-5" /> Import Scenarios (.xlsx)
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div
              className="p-6"
              onClick={e => {
                if (e.target === e.currentTarget) {
                  setSelectedId(null);
                }
              }}
            >
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
                          isSelected={selectedId === item.id}
                          onClick={() => {
                            setSelectedId(item.id);
                            setShowDetails(true);
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

        {/* Floating Right Details Panel */}
        <AnimatePresence>
          {showDetails && selectedScenario && (
            <motion.div
              initial={{ x: 480, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 480, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-[480px] z-50 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] bg-white border-l"
              onClick={e => e.stopPropagation()}
            >
              <ScenarioDetail
                scenario={selectedScenario}
                onClose={() => {
                  setShowDetails(false);
                  setSelectedId(null);
                }}
                onGenerate={sheetNames => {
                  if (sheetNames.length > 0) {
                    handleGenerate(selectedScenario.id, sheetNames);
                  }
                }}
                onDelete={() => handleDelete(selectedScenario.id)}
                onViewGeneratedId={id => {
                  // Navigate to recording details logic reusing recordings feature
                  const url = chrome.runtime.getURL(
                    `generated-test-detail.html?id=${id}`
                  );
                  chrome.runtime.sendMessage({
                    type: MessageType.OPEN_URL,
                    data: { url },
                  });
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
