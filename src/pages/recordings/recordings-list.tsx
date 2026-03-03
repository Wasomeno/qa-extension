import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Search,
  Plus,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  ChevronRight as ChevronRightIcon,
  Info,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/api/project';
import { storageService } from '@/services/storage';
import {
  generatePlaywrightTest,
  generateTestFilename,
  exportBlueprintAsJson,
  generateBlueprintFilename,
} from '@/lib/test-generator';
import {
  downloadTextFile,
  downloadJsonFile,
} from '@/lib/download';
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
import { TestBlueprint } from '@/types/recording';
import { MessageType } from '@/types/messages';
import { FolderItem } from './components/folder-item';
import { RecordingItem } from './components/recording-item';
import { DetailsPanel } from './components/details-panel';
import { cn } from '@/lib/utils';

export const RecordingsPage: React.FC<{
  portalContainer?: HTMLElement | null;
}> = ({ portalContainer }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentFolderId, setCurrentFolderId] = useState<number | 'unassigned' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { push } = useNavigation();

  const { data: blueprints = [], refetch: refetchBlueprints } = useQuery({
    queryKey: ['recordings-blueprints'],
    queryFn: async () => {
      const data = await storageService.get('test-blueprints');
      return (data || []) as TestBlueprint[];
    },
  });

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

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

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
        if (selectedId === id) setSelectedId(null);
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

  const categorizedBlueprints = useMemo(() => {
    const categories: Record<
      number | string,
      { name: string; items: TestBlueprint[] }
    > = {
      unassigned: { name: 'Unassigned', items: [] },
    };

    projects.forEach(p => {
      categories[p.id] = { name: p.name_with_namespace, items: [] };
    });

    blueprints.forEach(b => {
      const categoryId = b.projectId || 'unassigned';
      if (!categories[categoryId]) {
        categories[categoryId] = { name: 'Unknown Project', items: [] };
      }
      categories[categoryId].items.push(b);
    });

    return Object.entries(categories).filter(
      ([id, cat]) => id === 'unassigned' || cat.items.length > 0
    );
  }, [blueprints, projects]);

  const selectedRecording = useMemo(() => {
    return blueprints.find(b => b.id === selectedId) || null;
  }, [selectedId, blueprints]);

  const currentProjectName = useMemo(() => {
    if (currentFolderId === null) return 'All Recordings';
    if (currentFolderId === 'unassigned') return 'Unassigned';
    const proj = projects.find(p => p.id === currentFolderId);
    return proj ? proj.name_with_namespace : 'Unknown Project';
  }, [currentFolderId, projects]);

  const filteredItems = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return blueprints.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(searchLower);
      const matchesFolder = currentFolderId === null || (b.projectId === currentFolderId) || (currentFolderId === 'unassigned' && !b.projectId);
      return matchesSearch && matchesFolder;
    });
  }, [blueprints, currentFolderId, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      {/* Top Header */}
      <header className="px-6 py-4 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Recordings</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search in Drive..."
              className="pl-9 w-80 h-10 bg-gray-100 border-none rounded-lg focus-visible:ring-2 focus-visible:ring-zinc-900"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-10 w-10", viewMode === 'list' && "text-zinc-900 bg-zinc-100")}
                  onClick={() => setViewMode('list')}
                >
                  <ListIcon className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-10 w-10", viewMode === 'grid' && "text-zinc-900 bg-zinc-100")}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-10 w-10", showDetails && "text-zinc-900 bg-zinc-100")}
            onClick={() => setShowDetails(!showDetails)}
          >
            <Info className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Content Area */}
        <div 
          className="flex-1 flex flex-col min-w-0"
          onClick={() => setSelectedId(null)}
        >
          {/* Breadcrumbs & Actions */}
          <div className="px-6 py-3 flex items-center justify-between shrink-0 border-b">
            <div className="flex items-center gap-1 text-sm">
              <Button 
                variant="ghost" 
                className="h-8 px-2 text-gray-600 hover:text-zinc-900 font-medium"
                onClick={() => setCurrentFolderId(null)}
              >
                My Recordings
              </Button>
              {currentFolderId !== null && (
                <>
                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                  <span className="px-2 text-gray-900 font-medium">{currentProjectName}</span>
                </>
              )}
            </div>
            
            <Button 
                className="bg-zinc-900 hover:bg-black text-white rounded-full gap-2 px-4"
                onClick={() => {
                    chrome.runtime.sendMessage({ type: MessageType.CLOSE_MAIN_MENU });
                    setTimeout(() => {
                        chrome.runtime.sendMessage({
                            type: MessageType.START_RECORDING,
                            data: { projectId: currentFolderId === 'unassigned' ? undefined : (currentFolderId || undefined) },
                        });
                    }, 300);
                }}
            >
                <Plus className="w-5 h-5" /> New Recording
            </Button>
          </div>

          <ScrollArea 
            className="flex-1"
          >
            <div className="p-6" onClick={(e) => {
                // Only deselect if clicking exactly on the background, not on items
                if (e.target === e.currentTarget) {
                    setSelectedId(null);
                }
            }}>
              {/* Processing Section */}
              {lastBlueprint && (
                <section className="mb-8 p-4 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center shrink-0">
                      {lastBlueprint.status === 'processing' ? (
                        <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                      ) : (
                        <FileText className="w-5 h-5 text-zinc-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-zinc-900">
                        {lastBlueprint.status === 'processing' ? 'Processing Recording...' : 'New Recording Ready'}
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
                        <Button size="sm" variant="outline" className="bg-white" onClick={() => handleRunTest(lastBlueprint)}>
                          Preview
                        </Button>
                        <Button size="sm" className="bg-zinc-900 hover:bg-black text-white border-none" onClick={handleSaveLastBlueprint}>
                          Save
                        </Button>
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* Folders Section - only show when at root */}
              {currentFolderId === null && (
                <section className="mb-8">
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Folders</h2>
                  <div className={cn(
                    viewMode === 'grid' 
                      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" 
                      : "flex flex-col border rounded-lg overflow-hidden"
                  )}>
                    {categorizedBlueprints.map(([id, cat]) => (
                      <FolderItem
                        key={id}
                        name={cat.name}
                        count={cat.items.length}
                        viewMode={viewMode}
                        onClick={() => setCurrentFolderId(id === 'unassigned' ? 'unassigned' : Number(id))}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Recordings Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {currentFolderId === null ? 'All Files' : 'Files'}
                  </h2>
                </div>
                <div className={cn(
                  viewMode === 'grid' 
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" 
                    : "flex flex-col border rounded-lg overflow-hidden bg-white"
                )}>
                  {filteredItems.map(item => (
                    <div key={item.id} onClick={(e) => e.stopPropagation()}>
                      <RecordingItem
                        recording={item}
                        viewMode={viewMode}
                        isSelected={selectedId === item.id}
                        onClick={() => {
                            setSelectedId(item.id);
                            setShowDetails(true);
                        }}
                        onDoubleClick={() => {
                          const url = chrome.runtime.getURL(`recording-detail.html?id=${item.id}`);
                          chrome.runtime.sendMessage({ type: MessageType.OPEN_URL, data: { url } });
                        }}
                        onRun={(e) => { e.stopPropagation(); handleRunTest(item); }}
                        onDelete={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        onExportPlaywright={(e) => { e.stopPropagation(); handleExportPlaywright(item); }}
                        onExportJson={(e) => { e.stopPropagation(); handleExportJson(item); }}
                        onRunInAgent={(e) => { e.stopPropagation(); handleRunInAgent(item); }}
                        onCopyScript={(e) => { e.stopPropagation(); handleShareCopyScript(item); }}
                        portalContainer={portalContainer}
                      />
                    </div>
                  ))}
                  {filteredItems.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200">
                      <FileText className="w-12 h-12 mb-2 opacity-20" />
                      <p>No recordings found in this folder</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>

        {/* Floating Right Details Panel */}
        <AnimatePresence>
          {showDetails && selectedRecording && (
            <motion.div 
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-[320px] z-50 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] bg-white border-l"
              onClick={(e) => e.stopPropagation()}
            >
              <DetailsPanel
                recording={selectedRecording}
                onClose={() => {
                    setShowDetails(false);
                    setSelectedId(null);
                }}
                onRun={() => selectedRecording && handleRunTest(selectedRecording)}
                onRunInAgent={() => selectedRecording && handleRunInAgent(selectedRecording)}
                onDelete={() => selectedRecording && handleDelete(selectedRecording.id)}
                onViewDetails={() => {
                  if (!selectedRecording) return;
                  const url = chrome.runtime.getURL(`recording-detail.html?id=${selectedRecording.id}`);
                  chrome.runtime.sendMessage({ type: MessageType.OPEN_URL, data: { url } });
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
