import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Search,
  Plus,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  Info,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/api/project';
import { listRecordings } from '@/api/recording';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { TestBlueprint } from '@/types/recording';
import { MessageType } from '@/types/messages';
import { RecordingItem } from './components/recording-item';
import { DetailsPanel } from './components/details-panel';
import { SearchablePicker } from '../issues/components/searchable-picker';
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const { push } = useNavigation();

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

      if (selectedProjectId !== 'all' && selectedProjectId !== 'unassigned') {
        params.project_id = selectedProjectId;
      }

      return (await listRecordings(params)) as unknown as TestBlueprint[];
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

  const { data: projectsData, isLoading: isProjectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const isLoading = isBlueprintsLoading || isProjectsLoading;

  const projects = projectsData?.data?.projects || [];

  const handleRunTest = (blueprint: TestBlueprint) => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint, active: false },
    });
  };

  const handleDelete = async (id: string) => {
    chrome.runtime.sendMessage(
      {
        type: MessageType.DELETE_BLUEPRINT,
        data: { id },
      },
      () => {
        refetchBlueprints();
      }
    );
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
  };

  const handleSaveLastBlueprint = async () => {
    if (!lastBlueprint) return;
    chrome.runtime.sendMessage(
      {
        type: MessageType.SAVE_BLUEPRINT,
        data: { blueprint: lastBlueprint },
      },
      () => {
        refetchBlueprints();
        refetchLastBlueprint();
      }
    );
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
            selectedProjectId === 'all' || selectedProjectId === 'unassigned'
              ? undefined
              : parseInt(selectedProjectId),
        },
      });
    }, 300);
  };

  const filteredItems = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return blueprints.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(searchLower);
      const matchesProject =
        selectedProjectId === 'all' ||
        b.project_id?.toString() === selectedProjectId ||
        (selectedProjectId === 'unassigned' && !b.project_id);
      return matchesSearch && matchesProject;
    });
  }, [blueprints, selectedProjectId, searchQuery]);

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
            <SearchablePicker
              options={[
                { label: 'Unassigned', value: 'unassigned' },
                ...projects.map(p => ({
                  label: p.name,
                  value: p.id.toString(),
                })),
              ]}
              value={selectedProjectId}
              onSelect={val => setSelectedProjectId(val as string)}
              placeholder="All Projects"
              searchPlaceholder="Search projects..."
              allOption={{ label: 'All Projects', value: 'all' }}
              portalContainer={portalContainer}
            />
          </div>

          <Button
            variant="ghost"
            className="hover:bg-zinc-50 border text-zinc-900 rounded-full gap-2 px-4 h-10"
            onClick={handleStartRecording}
          >
            <Plus className="w-5 h-5" /> Test Recording
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
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
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <RecordingSkeleton key={i} />
                    ))
                  ) : filteredItems.length > 0 ? (
                    filteredItems.map(item => (
                      <div key={item.id} onClick={e => e.stopPropagation()}>
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
                          portalContainer={portalContainer}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200">
                      <Terminal className="w-12 h-12 mb-2 opacity-20" />
                      <p>No test recordings found for this project</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

