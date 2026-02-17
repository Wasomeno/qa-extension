import React, { useState, useMemo } from 'react';
import {
  Video as VideoIcon,
  Play,
  Trash2,
  Search,
  Plus,
  Folder,
  MoreVertical,
  Download,
  Share2,
  Clock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/api/project';
import { storageService } from '@/services/storage';
import { videoStorage } from '@/services/video-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigation } from '@/contexts/navigation-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TestBlueprint } from '@/types/recording';
import { MessageType } from '@/types/messages';

export const RecordingsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
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

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const projects = projectsData?.data?.projects || [];

  const handleRunTest = (blueprint: TestBlueprint) => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint },
    });
  };

  const handleDelete = async (id: string) => {
    // Delete from IndexedDB first
    try {
      await videoStorage.deleteVideo(id);
    } catch (error) {
    }

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

  // Categorize blueprints by project
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

    // Remove empty categories except maybe unassigned
    return Object.entries(categories).filter(
      ([id, cat]) => cat.items.length > 0
    );
  }, [blueprints, projects]);

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      <header className="px-6 py-4 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automation Tests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your automated test flows
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search recordings..."
              className="pl-9 w-64 h-9 bg-gray-50 border-gray-200"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              chrome.runtime.sendMessage({ type: MessageType.START_RECORDING });
            }}
          >
            <Plus className="w-4 h-4" />
            New Test
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 px-6 py-6">
        {lastBlueprint && (
          <section
            className={`mb-8 p-4 border rounded-lg flex items-center justify-between ${
              lastBlueprint.status === 'processing'
                ? 'bg-yellow-50 border-yellow-100'
                : lastBlueprint.status === 'failed'
                  ? 'bg-red-50 border-red-100'
                  : 'bg-blue-50 border-blue-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  lastBlueprint.status === 'processing'
                    ? 'bg-yellow-100'
                    : lastBlueprint.status === 'failed'
                      ? 'bg-red-100'
                      : 'bg-blue-100'
                }`}
              >
                <VideoIcon
                  className={`w-5 h-5 ${
                    lastBlueprint.status === 'processing'
                      ? 'text-yellow-600'
                      : lastBlueprint.status === 'failed'
                        ? 'text-red-600'
                        : 'text-blue-600'
                  }`}
                />
              </div>
              <div>
                <h3
                  className={`font-semibold ${
                    lastBlueprint.status === 'processing'
                      ? 'text-yellow-900'
                      : lastBlueprint.status === 'failed'
                        ? 'text-red-900'
                        : 'text-blue-900'
                  }`}
                >
                  {lastBlueprint.status === 'processing'
                    ? 'Processing Recording...'
                    : lastBlueprint.status === 'failed'
                      ? 'Recording Failed'
                      : 'New Recording Ready'}
                </h3>
                <p
                  className={`text-sm ${
                    lastBlueprint.status === 'processing'
                      ? 'text-yellow-700'
                      : lastBlueprint.status === 'failed'
                        ? 'text-red-700'
                        : 'text-blue-700'
                  }`}
                >
                  {lastBlueprint.status === 'processing'
                    ? 'We are generating your test steps using AI...'
                    : lastBlueprint.status === 'failed'
                      ? `Error: ${lastBlueprint.error || 'Failed to generate blueprint'}`
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
                    className="bg-blue-600 hover:bg-blue-700 text-white border-none"
                    onClick={handleSaveLastBlueprint}
                  >
                    Save to Library
                  </Button>
                </>
              )}
              {lastBlueprint.status === 'failed' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-100"
                  onClick={() =>
                    storageService
                      .remove('lastBlueprint')
                      .then(() => refetchLastBlueprint())
                  }
                >
                  Dismiss
                </Button>
              )}
            </div>
          </section>
        )}

        {categorizedBlueprints.length === 0 && !lastBlueprint ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <VideoIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              No recordings found
            </h3>
            <p className="text-gray-500 max-w-sm mt-1">
              Start by recording a new test flow from the floating trigger on
              any webpage.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => {
                chrome.runtime.sendMessage({
                  type: MessageType.START_RECORDING,
                });
              }}
            >
              Start Recording
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {categorizedBlueprints.map(([id, category]) => (
              <section key={id} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-blue-500" />
                  <h2 className="font-semibold text-gray-700">
                    {category.name}
                  </h2>
                  <Badge
                    variant="secondary"
                    className="bg-gray-100 text-gray-600 border-none"
                  >
                    {category.items.length}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.items.map(blueprint => (
                    <Card
                      key={blueprint.id}
                      className="group hover:shadow-md transition-shadow border-gray-200"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base font-semibold group-hover:text-blue-600 transition-colors">
                            {blueprint.name}
                          </CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 -mr-2"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="gap-2">
                                <Download className="w-4 h-4" /> Export
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <Share2 className="w-4 h-4" /> Share
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-red-600 focus:text-red-600"
                                onClick={() => handleDelete(blueprint.id)}
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <CardDescription className="line-clamp-2">
                          {blueprint.description || 'No description provided'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />{' '}
                            {blueprint.steps.length} steps
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleRunTest(blueprint)}
                          >
                            <Play className="w-3 h-3 fill-current" />
                            Run Test
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              const url = chrome.runtime.getURL(`recording-detail.html?id=${blueprint.id}`);
                              chrome.runtime.sendMessage({
                                type: MessageType.OPEN_URL,
                                data: { url }
                              });
                            }}
                          >
                            View Details
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
