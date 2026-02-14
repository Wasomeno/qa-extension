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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TestBlueprint } from '@/types/recording';
import { format } from 'date-fns';

export const RecordingsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: blueprints = [], refetch: refetchBlueprints } = useQuery({
    queryKey: ['recordings-blueprints'],
    queryFn: async () => {
      const data = await storageService.get('test-blueprints');
      return (data || []) as TestBlueprint[];
    },
  });

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const projects = projectsData?.data?.projects || [];

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
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <VideoIcon className="w-5 h-5 text-red-500" />
            Test Recordings
          </h1>
          <p className="text-sm text-gray-500">
            Manage and execute your automated test flows
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
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Test
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 px-6 py-6">
        {categorizedBlueprints.length === 0 ? (
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
            <Button variant="outline" className="mt-6">
              Learn how to record
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
                              <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600">
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
                          >
                            <Play className="w-3 h-3 fill-current" />
                            Run Test
                          </Button>
                          <Button size="sm" variant="outline">
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
