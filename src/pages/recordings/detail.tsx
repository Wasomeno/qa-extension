import React, { useState } from 'react';
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
  AlertCircle,
  Video,
  Link,
  Copy,
  Eye,
  EyeOff,
  FileText,
  User,
  Terminal,
  Globe,
  Bug,
  FileCode,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigation } from '@/contexts/navigation-context';
import { TestBlueprint } from '@/types/recording';
import { generateLLMTranscript } from '@/types/telemetry';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageType } from '@/types/messages';

type TabId = 'steps' | 'console' | 'network' | 'errors' | 'export';

interface RecordingDetailProps {
  blueprint: TestBlueprint;
}

export const RecordingDetailPage: React.FC<RecordingDetailProps> = ({
  blueprint,
}) => {
  const { pop } = useNavigation();
  const [showVideo, setShowVideo] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('steps');

  const telemetry = blueprint.telemetry;
  const hasTelemetry = !!telemetry;

  const handleRunTest = () => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint, active: false },
    });
  };

  const handleCopyVideoLink = () => {
    if (blueprint.video_url) {
      navigator.clipboard.writeText(blueprint.video_url);
      toast.success('Video link copied to clipboard');
    } else {
      toast.error('No video available for this recording');
    }
  };

  const handleExportLLM = () => {
    if (!telemetry) {
      toast.error('No telemetry data available for export');
      return;
    }
    const transcript = generateLLMTranscript(
      telemetry,
      blueprint.steps.map(s => ({
        action: s.action,
        description: s.description,
        value: s.value,
        selector: s.selector,
      }))
    );
    navigator.clipboard.writeText(transcript);
    toast.success('LLM transcript copied to clipboard');
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

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'steps', label: 'Steps', icon: <ListFilter className="w-3.5 h-3.5" /> },
    ...(hasTelemetry
      ? [
          {
            id: 'console' as TabId,
            label: 'Console',
            icon: <Terminal className="w-3.5 h-3.5" />,
            count: telemetry?.consoleLogs?.length,
          },
          {
            id: 'network' as TabId,
            label: 'Network',
            icon: <Globe className="w-3.5 h-3.5" />,
            count: telemetry?.networkRequests?.length,
          },
          {
            id: 'errors' as TabId,
            label: 'Errors',
            icon: <Bug className="w-3.5 h-3.5" />,
            count: telemetry?.jsErrors?.length,
          },
          {
            id: 'export' as TabId,
            label: 'Export LLM',
            icon: <FileCode className="w-3.5 h-3.5" />,
          },
        ]
      : []),
  ];

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleCopyVideoLink}
            disabled={!blueprint.video_url}
          >
            <Link className="w-3 h-3" />
            Copy Video Link
          </Button>
          <Button size="sm" className="gap-2" onClick={handleRunTest}>
            <Play className="w-3 h-3 fill-current" />
            Run Live
          </Button>
        </div>
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

          {/* Source Type Indicator */}
          {blueprint.source_type && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Source
              </h2>
              {blueprint.source_type === 'test_scenario' ? (
                <Badge variant="secondary" className="gap-1 bg-purple-50 text-purple-700 border-purple-200">
                  <FileText className="w-3 h-3" />
                  Generated from Test Scenario
                  {blueprint.source_id && (
                    <span className="text-[10px] opacity-70 ml-1">({blueprint.source_id.slice(0, 8)}...)</span>
                  )}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 bg-blue-50 text-blue-700 border-blue-200">
                  <User className="w-3 h-3" />
                  Manual Recording
                </Badge>
              )}
            </section>
          )}

          {/* Video Player Section */}
          {blueprint.video_url && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Video className="w-4 h-4" /> Recording Playback
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-zinc-500 hover:text-zinc-700"
                  onClick={() => setShowVideo(!showVideo)}
                >
                  {showVideo ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      Hide Video
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      Show Video
                    </>
                  )}
                </Button>
              </div>
              {showVideo ? (
                <div className="aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm">
                  <video
                    src={blueprint.video_url}
                    controls
                    className="h-full w-full object-contain"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400">
                  <Video className="mb-2 h-8 w-8 opacity-30" />
                  <span className="text-xs">Video hidden - click "Show Video" to view</span>
                </div>
              )}
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

          {/* Telemetry Stats Bar */}
          {hasTelemetry && (
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <div className="text-lg font-bold text-blue-700">{telemetry?.consoleLogs?.length || 0}</div>
                <div className="text-[10px] text-blue-500 font-medium">Console Logs</div>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                <div className="text-lg font-bold text-emerald-700">{telemetry?.networkRequests?.length || 0}</div>
                <div className="text-[10px] text-emerald-500 font-medium">Network</div>
              </div>
              <div className={`p-2 rounded-lg border text-center ${(telemetry?.jsErrors?.length || 0) > 0 ? 'bg-red-50 border-red-100' : 'bg-zinc-50 border-zinc-100'}`}>
                <div className={`text-lg font-bold ${(telemetry?.jsErrors?.length || 0) > 0 ? 'text-red-700' : 'text-zinc-700'}`}>{telemetry?.jsErrors?.length || 0}</div>
                <div className={`text-[10px] font-medium ${(telemetry?.jsErrors?.length || 0) > 0 ? 'text-red-500' : 'text-zinc-500'}`}>JS Errors</div>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg border border-amber-100 text-center">
                <div className="text-lg font-bold text-amber-700">{telemetry?.domMutations?.length || 0}</div>
                <div className="text-[10px] text-amber-500 font-medium">DOM Mutations</div>
              </div>
            </div>
          )}

          <Separator />

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 pb-0 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'steps' && (
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
                            className="text-[10px] py-0 font-normal whitespace-normal break-words max-w-full"
                          >
                            {step.value}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        {step.description}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-gray-400 uppercase">CSS:</span>
                          <code className="text-[10px] bg-gray-50 text-blue-600 px-1.5 py-0.5 rounded border border-gray-100 block truncate max-w-full">
                            {step.selector}
                          </code>
                        </div>
                        {step.xpath && (
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-gray-400 uppercase">XPath:</span>
                            <code className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 block truncate max-w-full">
                              {step.xpath}
                            </code>
                          </div>
                        )}
                        {step.xpathCandidates && step.xpathCandidates.length > 0 && (
                          <details className="group">
                            <summary className="text-[9px] text-amber-500 uppercase cursor-pointer hover:text-amber-600">
                              {step.xpathCandidates.length} XPath candidates
                            </summary>
                            <div className="mt-1 space-y-0.5 pl-3">
                              {step.xpathCandidates.map((xpath, i) => (
                                <code key={i} className="text-[10px] bg-amber-50/50 text-amber-600 px-1 py-0.5 rounded block truncate max-w-full">
                                  {i + 1}. {xpath}
                                </code>
                              ))}
                            </div>
                          </details>
                        )}
                        {step.selectorCandidates && step.selectorCandidates.length > 0 && (
                          <details className="group">
                            <summary className="text-[9px] text-blue-400 uppercase cursor-pointer hover:text-blue-500">
                              {step.selectorCandidates.length} CSS candidates
                            </summary>
                            <div className="mt-1 space-y-0.5 pl-3">
                              {step.selectorCandidates.map((sel, i) => (
                                <code key={i} className="text-[10px] bg-blue-50/50 text-blue-600 px-1 py-0.5 rounded block truncate max-w-full">
                                  {i + 1}. {sel}
                                </code>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>

                      {/* Step Context from Telemetry */}
                      {telemetry?.stepsWithContext?.find(c => c.stepIndex === index) && (
                        <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-100 space-y-1">
                          {(() => {
                            const ctx = telemetry.stepsWithContext!.find(c => c.stepIndex === index)!;
                            return (
                              <>
                                {ctx.surroundingErrors.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <Bug className="w-3 h-3 text-red-500" />
                                    <span className="text-[10px] text-red-600 font-medium">{ctx.surroundingErrors.length} error(s) near this step</span>
                                  </div>
                                )}
                                {ctx.surroundingRequests.filter(r => r.status && r.status >= 400).length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <Globe className="w-3 h-3 text-amber-500" />
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      {ctx.surroundingRequests.filter(r => r.status && r.status >= 400).length} failed request(s)
                                    </span>
                                  </div>
                                )}
                                {ctx.domMutationCount > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <Database className="w-3 h-3 text-blue-500" />
                                    <span className="text-[10px] text-blue-600 font-medium">{ctx.domMutationCount} DOM mutation(s)</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'console' && telemetry && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> Console Logs
                </h2>
              </div>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {telemetry.consoleLogs.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No console logs captured.</p>
                )}
                {telemetry.consoleLogs.map((log, i) => (
                  <div key={i} className={`flex gap-2 text-xs p-2 rounded border ${
                    log.level === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
                    log.level === 'warn' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                    'bg-gray-50 border-gray-100 text-gray-700'
                  }`}>
                    <span className="font-mono text-[10px] opacity-50 whitespace-nowrap">
                      {new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1)}
                    </span>
                    <span className="font-semibold uppercase w-10 shrink-0">{log.level}</span>
                    <span className="break-all font-mono">{log.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'network' && telemetry && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-4 h-4" /> Network Requests
                </h2>
              </div>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {telemetry.networkRequests.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No network requests captured.</p>
                )}
                {telemetry.networkRequests.map((req, i) => (
                  <div key={i} className={`flex gap-2 text-xs p-2 rounded border ${
                    req.status && req.status >= 400 ? 'bg-red-50 border-red-100' :
                    req.status && req.status >= 300 ? 'bg-amber-50 border-amber-100' :
                    'bg-gray-50 border-gray-100'
                  }`}>
                    <span className="font-mono text-[10px] opacity-50 whitespace-nowrap">
                      {new Date(req.timestamp).toISOString().split('T')[1].slice(0, -1)}
                    </span>
                    <span className={`font-bold w-12 shrink-0 ${
                      req.method === 'GET' ? 'text-blue-600' :
                      req.method === 'POST' ? 'text-emerald-600' :
                      req.method === 'DELETE' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>{req.method}</span>
                    <span className="flex-1 truncate text-gray-700">{req.url}</span>
                    {req.status && (
                      <span className={`font-bold w-10 text-right ${
                        req.status >= 400 ? 'text-red-600' :
                        req.status >= 300 ? 'text-amber-600' :
                        'text-emerald-600'
                      }`}>{req.status}</span>
                    )}
                    {req.durationMs && (
                      <span className="text-[10px] text-gray-400 w-14 text-right">{req.durationMs}ms</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'errors' && telemetry && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Bug className="w-4 h-4" /> JavaScript Errors
                </h2>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {telemetry.jsErrors.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No JavaScript errors captured.</p>
                )}
                {telemetry.jsErrors.map((err, i) => (
                  <div key={i} className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-mono text-red-700">
                        {new Date(err.timestamp).toISOString().split('T')[1].slice(0, -1)}
                      </span>
                    </div>
                    <p className="text-sm text-red-800 font-medium">{err.message}</p>
                    {err.source && (
                      <p className="text-xs text-red-600 mt-1">
                        {err.source}:{err.line}:{err.column}
                      </p>
                    )}
                    {err.stack && (
                      <pre className="text-[10px] text-red-600 mt-2 overflow-x-auto bg-red-100/50 p-2 rounded">
                        {err.stack}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'export' && telemetry && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <FileCode className="w-4 h-4" /> Export for LLM
                </h2>
                <Button size="sm" className="gap-2" onClick={handleExportLLM}>
                  <Copy className="w-3 h-3" />
                  Copy Transcript
                </Button>
              </div>
              <p className="text-sm text-gray-600">
                Generate a Markdown transcript optimized for pasting into ChatGPT, Claude, or other LLMs.
                It includes step-by-step context with console logs, network requests, and errors.
              </p>
              <div className="bg-gray-900 rounded-lg p-4 max-h-[400px] overflow-y-auto">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {generateLLMTranscript(
                    telemetry,
                    blueprint.steps.map(s => ({
                      action: s.action,
                      description: s.description,
                      value: s.value,
                      selector: s.selector,
                    }))
                  )}
                </pre>
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
