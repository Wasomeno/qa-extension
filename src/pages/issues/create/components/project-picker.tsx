import React, { useState } from 'react';
import { Search, Loader2, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ProjectPickerProps {
  projects: any[];
  isLoading: boolean;
  selectedProject: any | null;
  onSelect: (project: any) => void;
  portalContainer?: HTMLElement | null;
}

export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  projects,
  isLoading,
  selectedProject,
  onSelect,
  portalContainer,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredProjects =
    projects.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase())
    ) || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 hover:text-gray-900"
        >
          <span
            className={cn(
              selectedProject ? 'text-gray-900' : 'text-gray-500'
            )}
          >
            {selectedProject
              ? selectedProject.name_with_namespace
              : 'Select Project...'}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start" container={portalContainer}>
        <div className="p-2 border-b border-gray-100">
          <div className="flex items-center px-2 bg-gray-50 rounded-md border border-gray-200">
            <Search className="h-4 w-4 text-gray-400 mr-2" />
            <input
              className="flex-1 bg-transparent border-none text-sm h-8 focus:ring-0 outline-none placeholder:text-gray-400"
              placeholder="Search projects..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No projects found.
            </div>
          ) : (
            <div className="p-1">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  className={cn(
                    'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100',
                    selectedProject?.id === project.id &&
                      'bg-blue-50 text-blue-700'
                  )}
                  onClick={() => {
                    onSelect(project);
                    setOpen(false);
                  }}
                >
                  <div className="flex-1 truncate">
                    {project.name_with_namespace}
                  </div>
                  {selectedProject?.id === project.id && (
                    <Check className="w-4 h-4 ml-2 text-blue-600" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
