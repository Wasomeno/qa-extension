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
import { TestBlueprint } from '@/types/recording';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MessageType } from '@/types/messages';

interface GeneratedDetailProps {
  blueprint: TestBlueprint;
}

export const GeneratedDetailPage: React.FC<GeneratedDetailProps> = ({
  blueprint,
}) => {
  const handleRunTest = () => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint, active: false },
    });
  };

  const getStepIcon = (action: string) => {
    switch (action) {
      case 'click':
        return <MousePointer2 className="w-3.5 h-3.5" />;
      case 'type':
        return <Type className="w-3.5 h-3.5" />;
      case 'navigate':
        return <Navigation className="w-3.5 h-3.5" />;
      case 'select':
        return <ListFilter className="w-3.5 h-3.5" />;
      case 'assert':
        return <CheckCircle2 className="w-3.5 h-3.5 text-zinc-600" />;
      default:
        return <Database className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50/30">
      <header className="px-6 py-4 border-b border-zinc-100/60 bg-white flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={() => window.close()} className="h-8 w-8 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100/50">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <h1 className="text-lg font-medium tracking-tight text-zinc-900 truncate">
              {blueprint.name}
            </h1>
            <Badge variant="secondary" className="bg-zinc-100/50 text-zinc-600 font-medium px-2 py-0.5 border border-zinc-200/50 shrink-0">
              AI Generated
            </Badge>
          </div>
        </div>
        <Button size="sm" className="h-8 px-4 gap-2 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm rounded-lg ml-4 shrink-0 transition-all" onClick={handleRunTest}>
          <Play className="w-3.5 h-3.5 fill-current" />
          Run Test
        </Button>
      </header>

      <ScrollArea className="flex-1 bg-zinc-50/30">
        <div className="p-6 space-y-8 max-w-3xl mx-auto w-full">
          {/* Top Section */}
          <div className="flex flex-col gap-6">
            {blueprint.description && (
              <section className="space-y-2.5">
                <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Description
                </h2>
                <p className="text-sm text-zinc-700 bg-white p-4 rounded-xl border border-zinc-200/50 leading-relaxed shadow-sm">
                  {blueprint.description}
                </p>
              </section>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-xl border border-zinc-200/50 shadow-sm flex flex-col gap-1.5">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Steps
                </div>
                <div className="text-lg font-medium text-zinc-900">
                  {blueprint.steps.length}
                </div>
              </div>
              <div className="p-4 bg-white rounded-xl border border-zinc-200/50 shadow-sm flex flex-col gap-1.5">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" /> Project
                </div>
                <div className="text-lg font-medium text-zinc-900 truncate">
                  {blueprint.project_id || 'Unassigned'}
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-zinc-100/60 w-full" />

          {/* Steps */}
          <section className="space-y-6">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Test Sequence
            </h2>
            <div className="space-y-4">
              {blueprint.steps.map((step, index) => (
                <div key={index} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-white text-zinc-600 text-[11px] font-medium flex items-center justify-center border border-zinc-200/60 shadow-sm group-hover:border-zinc-300 transition-colors">
                      {index + 1}
                    </div>
                    {index < blueprint.steps.length - 1 && (
                      <div className="w-px h-full min-h-[1.5rem] bg-zinc-200/60 my-1.5" />
                    )}
                  </div>
                  <div className="flex-1 pb-6 last:pb-0">
                    <div className="bg-white p-4 rounded-xl border border-zinc-200/50 shadow-sm group-hover:border-zinc-300/60 group-hover:shadow transition-all">
                      <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                        <span className="p-1.5 bg-zinc-50 rounded-lg text-zinc-600 border border-zinc-100">
                          {getStepIcon(step.action)}
                        </span>
                        <span className="text-sm font-semibold text-zinc-900 uppercase tracking-tight">
                          {step.action}
                        </span>
                        {step.value && (
                          <Badge
                            variant="secondary"
                            className="text-[11px] py-0.5 px-2 font-medium bg-zinc-100 text-zinc-700 whitespace-normal break-words max-w-full rounded-md border-transparent"
                          >
                            {step.value}
                          </Badge>
                        )}
                      </div>
                      
                      {step.description && (
                        <p className="text-sm text-zinc-600 mb-3 leading-relaxed">
                          {step.description}
                        </p>
                      )}
                      
                      {step.selector && (
                        <code className="text-[11px] font-mono bg-zinc-50 text-zinc-500 px-3 py-2 rounded-lg border border-zinc-100 block break-all w-full mb-2">
                          {step.selector}
                        </code>
                      )}
                      
                      {step.action === 'assert' && step.expectedValue && (
                        <div className="mt-3 text-[11px] bg-emerald-50 text-emerald-700 px-3 py-2 flex rounded-lg border border-emerald-100/50 items-center gap-2 w-fit font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Expected:</span>
                          <span className="font-mono bg-white/60 px-1.5 py-0.5 rounded text-emerald-800">{step.expectedValue}</span>
                        </div>
                      )}
                    </div>
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
