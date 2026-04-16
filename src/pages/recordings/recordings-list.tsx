import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Search,
  Plus,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  Info,
  Trash2,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listRecordings, bulkDeleteRecordings } from '@/api/recording';
import { storageService } from '@/services/storage';
import {
  generatePlaywrightTest,
  generateTestFilename,
  generateBlueprintFilename,
} from '@/lib/test-generator';
import { downloadTextFile, downloadJsonFile } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useNavigation } from '@/contexts/navigation-context';
import { useLocalStorage } from '@/hooks/use-local-storage';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { TestBlueprint } from '@/types/recording';
import { MessageType } from '@/types/messages';
import { RecordingItem } from './components/recording-item';
import { DetailsPanel } from './components/details-panel';
import { ProjectSelect } from '@/components/project-select';
import { StyledCheckbox, SelectAllCheckbox } from '@/components/ui/styled-checkbox';
import { cn } from '@/lib/utils';

const RecordingSkeleton = () => {
  return (
    <div className="flex flex-col border rounded-xl overflow-hidden bg-white shadow-sm h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="flex items-center justify-between pt-2 border-t">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
};

export const RecordingsPage: React.FC<{
  portalContainer?: HTMLElement | null;
}> = ({ portalContainer }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const { push } = useNavigation();

  // Track individual deletion states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Use local project state for this page
  const [selectedProjectId, setSelectedProjectId] = useLocalStorage<string | null>(
    'qa-extension-recordings-project-id',
    null
  );

  const handleProjectSelect = (project: { id: number; name: string } | null) => {
    setSelectedProjectId(project?.id.toString() ?? null);
  };

  const {
    data: blueprints = [],
    refetch: refetchBlueprints,
    isLoading: isBlueprintsLoading,
  } = useQuery({
    queryKey: ['recordings-blueprints', selectedProjectId],
    queryFn: async () => {
      const params: any = {
        sort_by: 'created_at',
        order: 'desc',
      };

      if (selectedProjectId) {
        params.project_id = selectedProjectId;
      }

      const result = await listRecordings(params);
      console.log('API Response for recordings:', result);
      // Handle both array response and paginated response { data: [...] }
      if (result && typeof result === 'object' && !Array.isArray(result) && 'data' in result) {
        return (result as any).data || [];
      }
      return Array.isArray(result) ? result : [];
    },
  });

  console.log('blueprints', blueprints);

  const { data: lastBlueprint, refetch: refetchLastBlueprint } = useQuery({
    queryKey: ['last-blueprint'],
    queryFn: async () => {
      return await storageService.get('lastBlueprint');
    },
  });

  React.useEffect(() => {
    const handleMessage = (message: any) => {
      if (
        message.type === MessageType.BLUEPRINT_GENERATED ||
        message.type === MessageType.BLUEPRINT_PROCESSING ||
        message.type === MessageType.BLUEPRINT_SAVED
      ) {
        refetchLastBlueprint();
        refetchBlueprints();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [refetchLastBlueprint, refetchBlueprints]);

  React.useEffect(() => {
    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes['test-blueprints']) {
        refetchBlueprints();
      }
      if (changes['lastBlueprint']) {
        refetchLastBlueprint();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [refetchBlueprints, refetchLastBlueprint]);

  const isLoading = isBlueprintsLoading;

  const handleRunTest = (blueprint: TestBlueprint) => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint, active: false },
    });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    
    try {
      // Using chrome runtime message for deletion
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: MessageType.DELETE_BLUEPRINT,
            data: { id },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          }
        );
      });
      toast.success('Test recording deleted successfully');
      refetchBlueprints();
    } catch (e: any) {
      console.error(e);
      const errorMessage = e?.message || 'Failed to delete test recording';
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
      await bulkDeleteRecordings(Array.from(selectedIds));
      toast.success(`${selectedIds.size} test recording(s) deleted successfully`);
      setSelectedIds(new Set());
      refetchBlueprints();
    } catch (e: any) {
      console.error('Failed to bulk delete recordings:', e);
      const errorMessage = e?.message || 'Failed to delete test recordings';
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

  const handleRename = async (id: string, newName: string) => {
    chrome.runtime.sendMessage(
      {
        type: MessageType.UPDATE_BLUEPRINT,
        data: { id, data: { name: newName } },
      },
      () => {
        refetchBlueprints();
      }
    );
  };

  const handleExportPlaywright = (blueprint: TestBlueprint) => {
    const code = generatePlaywrightTest(blueprint);
    const filename = generateTestFilename(blueprint);
    downloadTextFile(code, filename);
  };

  const handleExportJson = (blueprint: TestBlueprint) => {
    const filename = generateBlueprintFilename(blueprint);
    downloadJsonFile(blueprint, filename);
  };

  const handleRunInAgent = (blueprint: TestBlueprint) => {
    push('agent', {
      initialMessage: `I want to run the automation test "${blueprint.name}" (ID: ${blueprint.id}). Please execute it and let me know the result.`,
    });
  };

  const handleShareCopyScript = (blueprint: TestBlueprint) => {
    const code = generatePlaywrightTest(blueprint);
    navigator.clipboard.writeText(code);
    toast.success('Test script copied to clipboard');
  };

  const handleCopyVideoLink = (blueprint: TestBlueprint) => {
    if (blueprint.video_url) {
      navigator.clipboard.writeText(blueprint.video_url);
      toast.success('Video link copied to clipboard');
    } else {
      toast.error('No video available for this recording');
    }
  };

  const handleSaveLastBlueprint = async () => {
    try {
      // CRITICAL: Fetch the LATEST blueprint from storage to ensure we have enriched xpath data
      const latestBlueprint = await storageService.get('lastBlueprint');
      if (!latestBlueprint) {
        toast.error('No recording to save. Please record a test first.');
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: MessageType.SAVE_BLUEPRINT,
          data: { blueprint: latestBlueprint },
        },
        () => {
          refetchBlueprints();
          refetchLastBlueprint();
        }
      );
    } catch (e: any) {
      toast.error(e.message || 'Failed to save blueprint');
    }
  };

  const handleViewDetails = (id: string) => {
    const url = chrome.runtime.getURL(`recording-detail.html?id=${id}`);
    chrome.runtime.sendMessage({
      type: MessageType.OPEN_URL,
      data: { url },
    });
  };

  const handleStartRecording = () => {
    chrome.runtime.sendMessage({
      type: MessageType.CLOSE_MAIN_MENU,
    });
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: MessageType.START_RECORDING,
        data: {
          projectId:
            selectedProjectId
              ? parseInt(selectedProjectId)
              : undefined,
        },
      });
    }, 300);
  };

  const filteredItems = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    const items = Array.isArray(blueprints) ? blueprints : [];
    return items.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(searchLower);
      const matchesProject =
        !selectedProjectId ||
        b.project_id?.toString() === selectedProjectId;
      return matchesSearch && matchesProject;
    });
  }, [blueprints, selectedProjectId, searchQuery]);

  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredItems.length;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      {/* Header & Filters */}
      <div className="flex-none space-y-4 px-8 pt-8 pb-4 bg-white z-20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Test Recordings</h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full p-0 text-gray-400 hover:text-gray-600">
                      <Info className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs" container={portalContainer}>
                    <p>Capture and manage browser interactions. AI generates test steps from your recordings for automated playback.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Manage and run your captured test flows
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search recordings..."
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
                  onClick={handleStartRecording}
                >
                  <Plus className="w-5 h-5" /> Test Recording
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-6">
                {/* Processing Section */}
                {lastBlueprint && (
                  <section className="mb-8 p-4 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center shrink-0">
                        {lastBlueprint.status === 'processing' ? (
                          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                        ) : (
                          <Terminal className="w-5 h-5 text-zinc-600" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900">
                          {lastBlueprint.status === 'processing'
                            ? 'Processing Test Script...'
                            : 'New Test Script Ready'}
                        </h3>
                        <p className="text-sm text-zinc-600">
                          {lastBlueprint.status === 'processing'
                            ? 'We are generating your test steps using AI...'
                            : 'You have a recently captured flow. Save it to your library.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {lastBlueprint.status === 'ready' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-white"
                            onClick={() => handleRunTest(lastBlueprint)}
                          >
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            className="bg-zinc-900 hover:bg-black text-white border-none"
                            onClick={handleSaveLastBlueprint}
                          >
                            Save
                          </Button>
                        </>
                      )}
                    </div>
                  </section>
                )}

                {/* Recordings Section */}
                <section>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <RecordingSkeleton key={i} />
                    ))}
                  </div>
                </section>
              </div>
            ) : filteredItems.length > 0 ? (
              <div className="p-6">
                {/* Processing Section */}
                {lastBlueprint && (
                  <section className="mb-8 p-4 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center shrink-0">
                        {lastBlueprint.status === 'processing' ? (
                          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                        ) : (
                          <Terminal className="w-5 h-5 text-zinc-600" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900">
                          {lastBlueprint.status === 'processing'
                            ? 'Processing Test Script...'
                            : 'New Test Script Ready'}
                        </h3>
                        <p className="text-sm text-zinc-600">
                          {lastBlueprint.status === 'processing'
                            ? 'We are generating your test steps using AI...'
                            : 'You have a recently captured flow. Save it to your library.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {lastBlueprint.status === 'ready' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-white"
                            onClick={() => handleRunTest(lastBlueprint)}
                          >
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            className="bg-zinc-900 hover:bg-black text-white border-none"
                            onClick={handleSaveLastBlueprint}
                          >
                            Save
                          </Button>
                        </>
                      )}
                    </div>
                  </section>
                )}

                {/* Recordings Section */}
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
                        <RecordingItem
                          recording={item}
                          viewMode="grid"
                          onClick={() => handleViewDetails(item.id)}
                          onRun={e => {
                            e.stopPropagation();
                            handleRunTest(item);
                          }}
                          onDelete={e => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                          onRename={handleRename}
                          onExportPlaywright={e => {
                            e.stopPropagation();
                            handleExportPlaywright(item);
                          }}
                          onExportJson={e => {
                            e.stopPropagation();
                            handleExportJson(item);
                          }}
                          onRunInAgent={e => {
                            e.stopPropagation();
                            handleRunInAgent(item);
                          }}
                          onCopyScript={e => {
                            e.stopPropagation();
                            handleShareCopyScript(item);
                          }}
                          onCopyVideoLink={e => {
                            e.stopPropagation();
                            handleCopyVideoLink(item);
                          }}
                          portalContainer={portalContainer}
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
                title="No test recordings found"
                description="Start a new recording to capture your browser interactions."
                className="h-full min-h-[400px]"
              />
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

