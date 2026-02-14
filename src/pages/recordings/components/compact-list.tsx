import React, { useState } from 'react';
import { 
  Video as VideoIcon, 
  Play, 
  Trash2, 
  Plus, 
  Clock,
  ExternalLink,
  PlusCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/api/project';
import { storageService } from '@/services/storage';
import { TestBlueprint } from '@/types/recording';
import { MessageType } from '@/types/messages';

interface CompactRecordingsListProps {
  onClose: () => void;
  portalContainer?: HTMLDivElement | null;
}

export const CompactRecordingsList: React.FC<CompactRecordingsListProps> = ({ 
  onClose,
  portalContainer 
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['recordings-blueprints'],
    queryFn: async () => {
      const data = await storageService.get('test-blueprints');
      return (data || []) as TestBlueprint[];
    },
  });

  const projects = projectsData?.data?.projects || [];

  const filteredRecordings = recordings.filter(rec => 
    selectedProjectId === 'all' || rec.projectId?.toString() === selectedProjectId
  ).slice(0, 5);

  const handleStartRecording = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ 
        type: MessageType.START_RECORDING,
        projectId: selectedProjectId !== 'all' ? parseInt(selectedProjectId) : undefined
      });
    }
    onClose();
  };

  const handleRunTest = (blueprint: TestBlueprint) => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint },
    });
    onClose();
  };

  const handleDelete = (id: string) => {
    chrome.runtime.sendMessage({
      type: MessageType.DELETE_BLUEPRINT,
      data: { id },
    });
  };

  return (
    <div 
      className="flex flex-col h-[380px] w-full bg-white"
    >
      <div className="px-4 py-3 border-b bg-gray-50/50 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-gray-900 text-sm whitespace-nowrap m-0 p-0 border-none bg-transparent">
            Recent
          </h3>
        </div>
        
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="h-8 text-[11px] w-[130px] bg-white border-gray-200 focus:ring-0">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            variant="default" 
            size="sm" 
            onClick={handleStartRecording}
            className="h-8 px-2.5 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white border-none shrink-0 shadow-sm flex items-center"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>REC</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                <div className="h-3 bg-gray-50 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-center px-6 py-8">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <VideoIcon className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1 border-none bg-transparent">No recordings found</p>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed max-w-[200px] mx-auto border-none bg-transparent">Select a project or start a new recording to see results here.</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleStartRecording}
              className="text-xs h-9 gap-2 border-gray-200 hover:bg-gray-50 px-4"
            >
              <PlusCircle className="w-3.5 h-3.5 text-red-500" />
              Start first recording
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredRecordings.map((rec) => (
              <div 
                key={rec.id}
                className="px-4 py-3 hover:bg-gray-50/80 transition-colors group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-sm text-gray-900 truncate pr-2 group-hover:text-red-600 transition-colors">
                    {rec.name}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 hover:bg-green-50 hover:text-green-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunTest(rec);
                      }}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(rec.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> {rec.steps.length} steps
                  </span>
                  {rec.projectId && (
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                      Project #{rec.projectId}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      
      <div className="p-2.5 border-t bg-gray-50/50 shrink-0">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full h-8 text-xs text-gray-500 gap-2 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 shadow-none flex items-center justify-center"
          onClick={() => {
            onClose();
          }}
        >
          <span>View all recordings</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
