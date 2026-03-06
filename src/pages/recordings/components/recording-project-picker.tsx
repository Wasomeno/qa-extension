import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  currentProjectId?: string | number;
  projects: any[];
  onSelect: (projectId: number | null) => void;
  portalContainer?: HTMLElement | null;
}

export const RecordingProjectPicker: React.FC<Props> = ({ currentProjectId, projects, onSelect, portalContainer }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  
  const selectedProject = projects.find(p => p.id.toString() === currentProjectId?.toString());

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
           {selectedProject ? selectedProject.name : 'Unassigned'}
           <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start" container={portalContainer}>
        <div className="p-2 border-b">
          <div className="flex items-center px-2 bg-gray-50 rounded-md border">
            <Search className="w-3 h-3 text-gray-400 mr-2" />
            <input
              className="flex-1 bg-transparent border-none text-xs h-7 focus:ring-0 outline-none placeholder:text-gray-400"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
           <div className="p-1">
             <div 
                className={cn("px-2 py-1.5 text-xs text-gray-500 cursor-pointer hover:bg-gray-100 flex items-center justify-between", !currentProjectId && "bg-blue-50 text-blue-700")} 
                onClick={() => { onSelect(null); setOpen(false); }}
             >
               Unassigned
               {!currentProjectId && <Check className="w-3 h-3" />}
             </div>
             {filteredProjects.map(project => (
               <div 
                  key={project.id} 
                  className={cn("flex items-center justify-between px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-100", currentProjectId?.toString() === project.id.toString() && "bg-blue-50 text-blue-700")} 
                  onClick={() => { onSelect(project.id); setOpen(false); }}
                >
                 {project.name}
                 {currentProjectId?.toString() === project.id.toString() && <Check className="w-3 h-3" />}
               </div>
             ))}
           </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
