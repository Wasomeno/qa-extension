import React from 'react';
import {
  ChevronLeft,
  Play,
  Clock,
  Database,
  CheckCircle2,
  MousePointer2,
  Type,
  Navigation,
  ListFilter,
  Sparkles,
} from 'lucide-react';
import { useNavigation } from '@/contexts/navigation-context';
import { TestBlueprint } from '@/types/recording';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageType } from '@/types/messages';

interface GeneratedDetailProps {
  blueprint: TestBlueprint;
}

export const GeneratedDetailPage: React.FC<GeneratedDetailProps> = ({
  blueprint,
}) => {
  const { pop } = useNavigation();

  const handleRunTest = () => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint, active: false },
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
        return <CheckCircle2 className="w-4 h-4 text-zinc-600" />;
      default:
        return <Database className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="px-4 py-3 border-b flex items-center gap-3 bg-white sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => window.close()} className="h-8 w-8">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            {blueprint.name}
          </h1>
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 font-medium">
            AI Generated
          </Badge>
        </div>
        <Button size="sm" className="gap-2" onClick={handleRunTest}>
          <Play className="w-3 h-3 fill-current" />
          Run Live
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
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
            <div className="flex-1 p-3 bg-zinc-50 rounded-lg border border-zinc-100">
              <div className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Duration
              </div>
              <div className="text-sm font-semibold text-zinc-900">
                {blueprint.steps.length} Steps
              </div>
            </div>
            <div className="flex-1 p-3 bg-zinc-50 rounded-lg border border-zinc-100">
              <div className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1">
                <Database className="w-3 h-3" /> Project
              </div>
              <div className="text-sm font-semibold text-zinc-900 truncate">
                {blueprint.project_id || 'Unassigned'}
              </div>
            </div>
          </div>

          <Separator />

          {/* Steps */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
              <span>Test Steps</span>
            </h2>
            <div className="space-y-3">
              {blueprint.steps.map((step, index) => (
                <div key={index} className="flex gap-3 group">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center border border-blue-100">
                      {index + 1}
                    </div>
                    {index < blueprint.steps.length - 1 && (
                      <div className="w-px flex-1 bg-gray-200 my-1 group-last:hidden" />
                    )}
                  </div>
                  <div className="flex-1 pb-4 border-b border-dashed border-gray-200 group-last:border-0 last:pb-0">
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
                    <p className="text-sm text-gray-600 mb-2">
                      {step.description}
                    </p>
                    {step.selector && (
                      <code className="text-[10px] font-mono bg-gray-50 text-gray-500 px-2 py-1 rounded border border-gray-100 block break-all max-w-full">
                        {step.selector}
                      </code>
                    )}
                    {step.action === 'assert' && step.expectedValue && (
                      <div className="mt-2 text-[10px] bg-green-50 text-green-700 px-2 py-1 flex rounded border border-green-100 items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="font-semibold">Expected:</span>
                        <span className="font-mono">{step.expectedValue}</span>
                      </div>
                    )}
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
