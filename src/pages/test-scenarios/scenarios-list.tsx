import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Terminal, Info, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { testScenarioApi } from '@/api/test-scenario';

import { useNavigation } from '@/contexts/navigation-context';
import { useLocalStorage } from '@/hooks/use-local-storage';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ProjectSelect } from '@/components/project-select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StyledCheckbox, SelectAllCheckbox } from '@/components/ui/styled-checkbox';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Track individual deletion states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Use local project state for this page
  const [selectedProjectId, setSelectedProjectId] = useLocalStorage<string | null>(
    'qa-extension-test-scenarios-project-id',
    null
  );

  const handleProjectSelect = (project: { id: number; name: string } | null) => {
    setSelectedProjectId(project?.id.toString() ?? null);
  };

  // Queries
  const {
    data: scenariosResponse,
    refetch,
    isLoading: isScenariosLoading,
  } = useQuery({
    queryKey: ['test-scenarios'],
    queryFn: async () => {
      const result = await testScenarioApi.listScenarios();
      console.log('API Response for scenarios:', result);
      // Handle both array response and paginated response { data: [...] }
      if (result && typeof result === 'object' && !Array.isArray(result) && 'data' in result) {
        return (result as any).data || [];
      }
      return Array.isArray(result) ? result : [];
    },
    refetchInterval: 5000, // Poll every 5s for generation status updates
  });

  const scenarios = Array.isArray(scenariosResponse) ? scenariosResponse : [];

  // Projects are fetched by ProjectSelect component internally
  const isLoading = isScenariosLoading;

  // Handlers
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    
    try {
      await testScenarioApi.deleteScenario(id);
      toast.success('Test scenario deleted successfully');
      refetch();
    } catch (e: any) {
      console.error(e);
      const errorMessage = e?.message || 'Failed to delete test scenario';
      setDeleteError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    
    try {
      await testScenarioApi.bulkDeleteScenarios(Array.from(selectedIds));
      toast.success(`${selectedIds.size} test scenario(s) deleted successfully`);
      setSelectedIds(new Set());
      refetch();
    } catch (e: any) {
      console.error('Failed to bulk delete scenarios:', e);
      const errorMessage = e?.message || 'Failed to delete test scenarios';
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(item => item.id)));
    }
  };

  const handleGenerate = (id: string, sheetNames: string[]) => {
    // Triggers generation for selected sheets from the outer view
    testScenarioApi.generateTests(id, sheetNames).then(() => refetch());
  };

  const filteredItems = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    const items = Array.isArray(scenarios) ? scenarios : [];
    return items.filter(s => {
      const matchesSearch = s.fileName.toLowerCase().includes(searchLower);
      const matchesProject =
        !selectedProjectId ||
        s.projectId?.toString() === selectedProjectId;
      return matchesSearch && matchesProject;
    });
  }, [scenarios, selectedProjectId, searchQuery]);

  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredItems.length;

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
            <ProjectSelect
              value={selectedProjectId}
              onSelect={handleProjectSelect}
              mode="single"
              portalContainer={portalContainer}
              placeholder="All Projects"
              extraOptions={{ allProjects: true }}
            />
          </div>

          <AnimatePresence mode="wait">
            {selectedIds.size > 0 ? (
              <motion.div
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex items-center gap-3"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-sm font-medium text-zinc-900 bg-zinc-100 px-3 py-1.5 rounded-full">
                    {selectedIds.size} selected
                  </span>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    className="h-10 px-4 border-zinc-300 hover:bg-zinc-50 rounded-full"
                  >
                    Clear
                  </Button>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    className="h-10 px-4 bg-red-600 hover:bg-red-700 border-none rounded-full shadow-lg shadow-red-600/20"
                  >
                    {isDeleting ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="w-4 h-4" />
                      </motion.div>
                    ) : (
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.div>
                    )}
                    <span className="ml-1">Delete</span>
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <ScenarioSkeleton key={i} />
                  ))}
                </div>
              </div>
            ) : filteredItems.length > 0 ? (
              <div className="p-6">
                <section>
                  {filteredItems.length > 0 && (
                    <div className="mb-4">
                      <SelectAllCheckbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={toggleSelectAll}
                        label="Select all"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        onClick={e => e.stopPropagation()}
                        className="relative"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.2 }}
                      >
                        <AnimatePresence>
                          {selectedIds.size > 0 && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.15 }}
                              className="absolute bottom-3 right-3 z-20"
                            >
                              <StyledCheckbox
                                checked={selectedIds.has(item.id)}
                                onChange={e => {
                                  e.stopPropagation();
                                  toggleSelection(item.id);
                                }}
                                size="lg"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
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
                          isDeleting={deletingId === item.id}
                          deleteError={deletingId === item.id ? deleteError : null}
                        />
                      </motion.div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <EmptyState
                icon={Terminal}
                title="No test scenarios found"
                description="Import an XLSX file to get started."
                className="h-full min-h-[400px]"
              />
            )}
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
