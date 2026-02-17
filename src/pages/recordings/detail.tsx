import {
  ChevronLeft,
  Play,
  Clock,
  Database,
  Video as VideoIcon,
  CheckCircle2,
  MousePointer2,
  Type,
  Navigation,
  ListFilter,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useNavigation } from '@/contexts/navigation-context';
import { TestBlueprint } from '@/types/recording';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageType } from '@/types/messages';
import { useState, useEffect } from 'react';

interface RecordingDetailProps {
  blueprint: TestBlueprint;
}

export const RecordingDetailPage: React.FC<RecordingDetailProps> = ({
  blueprint,
}) => {
  const { pop } = useNavigation();
  const [retryCount, setRetryCount] = useState(0);

  const handleRunTest = () => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint },
    });
  };

  const getStepIcon = (action: string) => {
    switch (action) {
      case 'click':
        return <MousePointer2 className="w-4 h-4" />;
      case 'type':
        return <Type className="w-4 h-4" />;
      case 'navigate':
        return <Navigation className="w-4 h-4" />;
      case 'select':
        return <ListFilter className="w-4 h-4" />;
      case 'assert':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      default:
        return <Database className="w-4 h-4" />;
    }
  };

  const videoViewerUrl = chrome.runtime.getURL(`video-viewer.html?id=${blueprint.id}&t=${retryCount}`);

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="px-4 py-3 border-b flex items-center gap-3 bg-white sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={pop} className="h-8 w-8">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            {blueprint.name}
          </h1>
        </div>
        <Button size="sm" className="gap-2" onClick={handleRunTest}>
          <Play className="w-3 h-3 fill-current" />
          Run Live
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Video Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <VideoIcon className="w-4 h-4" />
                Recorded Session
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={() => setRetryCount(prev => prev + 1)}
              >
                <RefreshCw className="w-3 h-3" />
                Reload Video
              </Button>
            </div>
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center relative group">
              <iframe
                src={videoViewerUrl}
                className="w-full h-full border-none"
                allow="autoplay"
              />
            </div>
          </section>

          {/* Description */}
          {blueprint.description && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Description
              </h2>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md border border-gray-100">
                {blueprint.description}
              </p>
            </section>
          )}

          {/* Metadata */}
          <div className="flex gap-4">
            <div className="flex-1 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-xs text-blue-600 font-medium mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Duration
              </div>
              <div className="text-sm font-semibold text-blue-900">
                {blueprint.steps.length} Steps
              </div>
            </div>
            <div className="flex-1 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="text-xs text-purple-600 font-medium mb-1 flex items-center gap-1">
                <Database className="w-3 h-3" /> Project
              </div>
              <div className="text-sm font-semibold text-purple-900 truncate">
                {blueprint.projectId || 'Unassigned'}
              </div>
            </div>
          </div>

          <Separator />

          {/* Steps */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Test Steps
            </h2>
            <div className="space-y-3">
              {blueprint.steps.map((step, index) => (
                <div key={index} className="flex gap-3 group">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center border border-gray-200">
                      {index + 1}
                    </div>
                    {index < blueprint.steps.length - 1 && (
                      <div className="w-px flex-1 bg-gray-200 my-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="p-1 bg-gray-100 rounded text-gray-600">
                        {getStepIcon(step.action)}
                      </span>
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {step.action}
                      </span>
                      {step.value && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 h-4 font-normal max-w-[150px] truncate"
                        >
                          {step.value}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      {step.description}
                    </p>
                    <code className="text-[10px] bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded border border-gray-100 block truncate max-w-full">
                      {step.selector}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};
