import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  FileText,
  X,
  WorkflowIcon,
  Pin,
  ListCheck,
  ChevronRight,
  Link as LinkIcon,
  Loader2,
  FileDown,
  CheckCircle2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import CompactIssueCreator from '@/components/compact-issue-creator';
import IssueList from '@/components/issue-list';
import IssueDetail from '@/components/issue-list/IssueDetail';
import ErrorBoundary from '@/components/common/error-boundary';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import WorkflowList from '@/components/workflows';
import PinnedIssues from '@/components/pinned-issues';
// Recording feature removed
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
import { Badge } from '@/src/components/ui/ui/badge';
import { Alert, AlertDescription } from '@/src/components/ui/ui/alert';
import { ScrollArea } from '@/src/components/ui/ui/scroll-area';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/src/components/ui/ui/card';
import useAuth from '@/hooks/useAuth';
import { authService } from '@/services/auth';
import { useQueryClient } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import { apiService } from '@/services/api';

// Unified header bar matching Workflows style
function HeaderBar(props: {
  title: string;
  onBack: () => void;
  onClose: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  const { title, onBack, onClose, onMouseDown } = props;
  return (
    <div
      className="flex items-center justify-between p-4 border-b border-gray-100"
      onMouseDown={onMouseDown}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Button
          onClick={onBack}
          variant="ghost"
          size="sm"
          className="p-0 h-fit w-fit pointer-events-auto"
          aria-label="Back"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-base font-semibold truncate">{title}</h3>
      </div>
      <Button
        variant="ghost"
        onClick={onClose}
        className="p-0 h-fit w-fit pointer-events-auto"
        aria-label="Close"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

type ViewState = 'closed' | 'features' | 'feature-detail';

interface FloatingTriggerPopupProps {
  viewState: ViewState;
  selectedFeature: string | null;
  selectedIssue?: any | null;
  onFeatureSelect: (feature: string) => void;
  onBack: () => void;
  onClose: () => void;
  onQuickAction: (action: string) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onIssueSelect?: (issue: any) => void;
}

const FloatingTriggerPopup: React.FC<FloatingTriggerPopupProps> = ({
  viewState,
  selectedFeature,
  selectedIssue,
  onFeatureSelect,
  onBack,
  onClose,
  onMouseDown,
  onIssueSelect,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const portalRef = useRef<HTMLDivElement>(null);
  const [pinnedCount, setPinnedCount] = React.useState<number>(0);
  // Recording state removed
  const { isAuthenticated } = useAuth();
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      const list = await storageService.getPinnedIssues();
      setPinnedCount(list.length);
      unsub = storageService.onChanged('pinnedIssues', v => {
        const arr = (v as any[]) || [];
        setPinnedCount(arr.length);
      });
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Recording summary removed

  const renderFeatureList = () => {
    return (
      <div
        className="flex relative flex-col h-full w-[260px] p-3"
        onMouseDown={onMouseDown}
      >
        {!isAuthenticated && (
          <Card className="absolute h-full z-40 w-full bg-white/80 backdrop-blur-sm top-0 left-0 rounded-xl shadow-sm border-muted/40 flex flex-col justify-center">
            <CardHeader className="pt-4 pb-2 text-center">
              <div className="mx-auto mb-2 h-8 w-8 rounded-xl border bg-muted/40 grid place-items-center">
                <KeyRound className="h-3 w-3" />
              </div>
              <CardTitle className="text-sm font-medium">
                Your session is invalid
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Please sign in again to continue.
              </p>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  className="h-8 pointer-events-auto bg-black hover:bg-gray-800 text-white text-xs"
                  disabled={authBusy}
                  onClick={async () => {
                    setAuthError(null);
                    setAuthBusy(true);
                    try {
                      const res = await authService.startGitLabOAuth();
                      if (res.success) {
                        try {
                          window.open(res.authUrl, '_blank');
                        } catch {}
                      } else {
                        setAuthError(res.error);
                      }
                    } catch (e: any) {
                      setAuthError(e?.message || 'Failed to start sign-in');
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                >
                  {authBusy ? 'Opening…' : 'Sign in Gitlab'}
                </Button>
                {authError && (
                  <p className="text-xs text-red-600 text-center mt-1">
                    {authError}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="px-3 py-2 flex items-center justify-between relative z-50">
          <span className="text-sm font-semibold">Quick Actions</span>
          <Button
            variant="ghost"
            onClick={onClose}
            className="p-0 h-fit hover:bg-none pointer-events-auto"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
        {/* Create Issue - prominent card */}
        <button
          disabled={!isAuthenticated}
          onClick={() => onFeatureSelect('issue')}
          className="group w-full text-left hover:bg-neutral-100/60 rounded-lg px-3 py-2 transition-colors pointer-events-auto disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-center">
            <FileText className="w-4 h-4 mr-3" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900">
                Create Issue
              </div>
              <span className="text-xs text-neutral-500">Open a new issue</span>
            </div>
            <div className="ml-3">
              <ChevronRight className="w-4 h-4 opacity-60 group-hover:opacity-100" />
            </div>
          </div>
        </button>

        {/* Issue List */}
        <button
          disabled={!isAuthenticated}
          onClick={() => onFeatureSelect('issues')}
          className="group w-full text-left hover:bg-neutral-100/60 rounded-lg px-3 py-2 transition-colors pointer-events-auto disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-center">
            <ListCheck className="w-4 h-4 mr-3 text-neutral-700" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900">
                Issue List
              </div>
              <div className="text-xs text-neutral-500 ">
                List of issues on your project
              </div>
            </div>
            <div className="ml-3 flex items-center gap-2 text-xs text-neutral-700">
              <ChevronRight className="w-4 h-4 opacity-60 group-hover:opacity-100" />
            </div>
          </div>
        </button>

        {/* Recording feature removed */}

        {/* Pinned */}
        <button
          onClick={() => onFeatureSelect('pinned')}
          className="group w-full text-left hover:bg-neutral-100/60 rounded-lg px-3 py-2 transition-colors pointer-events-auto"
        >
          <div className="flex items-center">
            <Pin className="w-4 h-4 mr-3 text-neutral-700" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900">
                Pinned Issues
              </div>
              <div className="text-xs text-neutral-500">
                {pinnedCount > 0
                  ? `${pinnedCount} item${pinnedCount === 1 ? '' : 's'}`
                  : 'No pinned issues'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 opacity-60 group-hover:opacity-100" />
          </div>
        </button>

        {/* Task Scenario Generator */}
        <button
          disabled={!isAuthenticated}
          onClick={() => onFeatureSelect('scenario-generator')}
          className="group w-full text-left hover:bg-neutral-100/60 rounded-lg px-3 py-2 transition-colors pointer-events-auto disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-center">
            <WorkflowIcon className="w-4 h-4 mr-3 text-neutral-700" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900">
                Task Scenario Generator
              </div>
              <div className="text-xs text-neutral-500">
                Generate scenarios from Google Sheet
              </div>
            </div>
            <ChevronRight className="w-4 h-4 opacity-60 group-hover:opacity-100" />
          </div>
        </button>
      </div>
    );
  };

  const renderFeatureDetail = () => {
    switch (selectedFeature) {
      case 'issue':
        return (
          <div className="flex flex-col w-[500px] h-full">
            <HeaderBar
              title="Create Issue"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            <div className="flex-1">
              <ErrorBoundary
                fallbackRender={err => (
                  <div className="p-3 text-xs text-red-400 bg-red-50 border border-red-200 rounded-md">
                    Issue Creator crashed: {err.message || 'Unknown error'}.
                  </div>
                )}
              >
                <CompactIssueCreator portalContainer={portalRef.current} />
              </ErrorBoundary>
            </div>
          </div>
        );
      case 'issues':
        return (
          <div className="flex flex-col w-[500px] h-full">
            <HeaderBar
              title="Issues"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            <div className="flex-1 min-h-0">
              <ErrorBoundary
                fallbackRender={err => (
                  <div className="p-3 text-xs text-red-400 bg-red-50 border border-red-200 rounded-md">
                    Issue List crashed: {err.message || 'Unknown error'}. Try
                    Refresh or adjust filters.
                  </div>
                )}
              >
                <IssueList
                  portalContainer={portalRef.current}
                  onSelect={issue => onIssueSelect && onIssueSelect(issue)}
                />
              </ErrorBoundary>
            </div>
          </div>
        );
      // Recording detail removed
      case 'pinned':
        return (
          <div className="flex flex-col h-full">
            <HeaderBar
              title="Pinned Issues"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            <div className="flex-1 min-h-0">
              <PinnedIssues
                onSelect={issue => onIssueSelect && onIssueSelect(issue)}
                portalContainer={portalRef.current}
              />
            </div>
          </div>
        );
      case 'issue-detail':
        return (
          <div className="flex flex-col h-full">
            <HeaderBar
              title="Issue Detail"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            <div className="flex-1 overflow-auto">
              {selectedIssue ? (
                <ErrorBoundary
                  fallbackRender={err => (
                    <div className="p-3 text-xs text-red-400 bg-red-50 border border-red-200 rounded-md">
                      Issue Detail crashed: {err.message || 'Unknown error'}.
                    </div>
                  )}
                >
                  <IssueDetail
                    issue={selectedIssue}
                    portalContainer={portalRef.current}
                  />
                </ErrorBoundary>
              ) : (
                <div className="p-4 text-xs opacity-80">No issue selected.</div>
              )}
            </div>
          </div>
        );
      case 'workflows':
        return (
          <div className="flex flex-col h-full">
            <HeaderBar
              title="Workflows"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            <div className="flex-1">
              <ErrorBoundary
                fallbackRender={err => (
                  <div className="p-3 text-xs text-red-400 bg-red-50 border border-red-200 rounded-md">
                    Issue List crashed: {err.message || 'Unknown error'}. Try
                    Refresh or adjust filters.
                  </div>
                )}
              >
                <WorkflowList className="p-2" />
              </ErrorBoundary>
            </div>
          </div>
        );
      case 'scenario-generator':
        return (
          <div className="flex flex-col w-[500px] h-full">
            <HeaderBar
              title="Task Scenario Generator"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            <div className="flex-1 min-h-0 overflow-auto p-3">
              <ScenarioGeneratorPaneV2 />
            </div>
          </div>
        );
      default:
        return renderFeatureList();
    }
  };

  return (
    <>
      <div
        className="w-full h-full relative z-10 glass-panel overflow-hidden"
        {...keyboardIsolation}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {viewState === 'features' && (
            <motion.div
              key="features"
              className="absolute inset-0 overflow-y-auto"
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(2px)' }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: 'blur(0px)',
                originX: 0.5,
                originY: 0.5,
              }}
              exit={{ opacity: 0, scale: 0.98, filter: 'blur(2px)' }}
              transition={{ ease: 'easeInOut' }}
            >
              {renderFeatureList()}
            </motion.div>
          )}
          {viewState === 'feature-detail' && (
            <motion.div
              key="feature-detail"
              className="absolute inset-0 overflow-y-auto"
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(2px)' }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: 'blur(0px)',
                originX: 0.5,
                originY: 0.5,
              }}
              exit={{ opacity: 0, scale: 0.98, filter: 'blur(2px)' }}
              transition={{ ease: 'easeOut' }}
            >
              {renderFeatureDetail()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Portal root inside shadow DOM but outside scroll clipping */}
      <div ref={portalRef} className="pointer-events-none" />
    </>
  );
};

// V2: Modern, simplified Task Scenario Generator
const ScenarioGeneratorPaneV2: React.FC = () => {
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState<'idle' | 'generating' | 'exporting'>(
    'idle'
  );
  const [rows, setRows] = React.useState<any[]>([]);
  const [sheets, setSheets] = React.useState<
    Array<{ name: string; scenarios: any[] }>
  >([]);
  const [selectedSheet, setSelectedSheet] = React.useState<string>('ALL');
  const [msg, setMsg] = React.useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  // Helpers for direct Google Sheet CSV export
  // JSONL helpers removed

  const isGoogleSheet = (val: string) =>
    /docs\.google\.com\/spreadsheets/i.test(val);
  const isValid = url.trim().length > 0 && isGoogleSheet(url.trim());

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch {
      setMsg({ type: 'error', text: 'Clipboard not available' });
    }
  };

  const copyJson = () => {
    try {
      const payload =
        sheets.length > 0
          ? {
              sheets: sheets.map(s => ({
                name: s.name,
                scenarios: s.scenarios,
              })),
            }
          : { scenarios: rows };
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setMsg({ type: 'success', text: 'Copied JSON to clipboard' });
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Copy failed' });
    }
  };

  const generate = async () => {
    setMsg(null);
    if (!isValid) {
      setMsg({ type: 'error', text: 'Enter a valid Google Sheet URL' });
      return;
    }
    setBusy('generating');
    try {
      const res = await apiService.previewScenarios(url.trim());
      if (res.success && (res as any).data) {
        const data: any = (res as any).data;
        const multi = Array.isArray(data.sheets)
          ? (data.sheets as Array<{ name: string; scenarios: any[] }>)
          : [];
        setSheets(multi);
        setSelectedSheet('ALL');
        setRows(multi.flatMap(s => s.scenarios));
        setMsg({ type: 'success', text: 'Generated preview' });
      } else {
        setMsg({
          type: 'error',
          text: (res as any).error || 'Generation failed',
        });
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Failed to generate' });
    } finally {
      setBusy('idle');
    }
  };

  const exportToXlsx = async () => {
    if (!rows.length) {
      setMsg({ type: 'error', text: 'Nothing to export' });
      return;
    }
    setBusy('exporting');
    try {
      const res = await apiService.exportScenariosXlsx(
        sheets.length > 0
          ? {
              sheets: sheets.map(s => ({
                name: s.name,
                scenarios: s.scenarios,
              })),
            }
          : { scenarios: rows }
      );
      if (!res.ok || !res.blob) {
        setMsg({ type: 'error', text: res.error || 'Export failed' });
        setBusy('idle');
        return;
      }
      const blobUrl = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `test_scenarios_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      setMsg({ type: 'success', text: 'Exported as XLSX' });
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Export failed' });
    } finally {
      setBusy('idle');
    }
  };

  // JSONL export feature removed

  const scenariosCount = sheets.length
    ? sheets.reduce((acc, s) => acc + (s.scenarios?.length || 0), 0)
    : rows.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-semibold">Google Sheet source</div>

      <div className="relative">
        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400">
          <LinkIcon className="w-4 h-4" />
        </div>
        <Input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="pl-8 pr-28 text-xs bg-white pointer-events-auto glass-input"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePaste}
            className="pointer-events-auto h-7 px-2 text-[11px]"
          >
            Paste
          </Button>
          {url && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setUrl('')}
              className="pointer-events-auto h-7 px-2 text-[11px]"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {!url && (
        <div className="text-xs text-neutral-500">
          Tip: paste a public sharing link to preview test scenarios.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={generate}
          disabled={busy !== 'idle' || !isValid}
          className="pointer-events-auto text-xs glass-button text-black"
        >
          {busy === 'generating' ? (
            <span className="inline-flex items-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Generating
            </span>
          ) : (
            'Generate'
          )}
        </Button>
        <Button
          size="sm"
          onClick={exportToXlsx}
          disabled={busy !== 'idle' || rows.length === 0}
          className="pointer-events-auto glass-button text-black"
        >
          {busy === 'exporting' ? (
            <span className="inline-flex items-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Exporting
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-xs">
              <FileDown className="w-4 h-4" /> Export XLSX
            </span>
          )}
        </Button>

        {scenariosCount > 0 && (
          <div className="ml-auto flex items-center gap-2 text-[10px] text-neutral-600">
            <Badge variant="secondary">{scenariosCount} scenarios</Badge>
            {sheets.length > 0 && (
              <Badge variant="outline">{sheets.length} tabs</Badge>
            )}
          </div>
        )}
      </div>

      {/* JSONL export UI removed */}

      {msg && (
        <Alert
          className={`py-2 ${msg.type === 'error' ? 'border-red-200/80 text-red-700 bg-red-50' : 'border-green-200/80 text-green-700 bg-green-50'}`}
        >
          <AlertDescription className="text-[11px] leading-relaxed">
            <span className="inline-flex items-center gap-2">
              {msg.type === 'error' ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {msg.text}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {sheets.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-neutral-700">Preview</div>
          <ScrollArea className="w-full">
            <div className="flex gap-1 pb-2 min-w-max">
              {['ALL', ...sheets.map(s => s.name)].map(name => {
                const count =
                  name === 'ALL'
                    ? sheets.reduce((a, s) => a + (s.scenarios?.length || 0), 0)
                    : sheets.find(s => s.name === name)?.scenarios?.length || 0;
                const active = selectedSheet === name;
                return (
                  <button
                    key={name}
                    onClick={() => {
                      setSelectedSheet(name);
                      if (name === 'ALL') {
                        setRows(sheets.flatMap(s => s.scenarios));
                      } else {
                        const found = sheets.find(s => s.name === name);
                        setRows(found ? found.scenarios : []);
                      }
                    }}
                    className={`pointer-events-auto rounded-full border px-2 py-1 text-[11px] transition-colors ${
                      active
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white/80 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    }`}
                  >
                    {name}
                    <span className="ml-1 inline-flex items-center">
                      <Badge
                        variant={active ? 'secondary' : 'outline'}
                        className={`h-4 px-1 text-[10px] ${active ? 'bg-white/10 text-white border-white/10' : ''}`}
                      >
                        {count}
                      </Badge>
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-200 bg-white/60 p-4 text-xs text-neutral-600">
          No preview yet. Paste a Google Sheet link and press Generate to see
          the first rows.
        </div>
      ) : (
        <div className="rounded-md border border-neutral-200 bg-white/80 overflow-hidden">
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-neutral-50 border-b">
                  {Object.keys(rows[0])
                    .slice(0, 6)
                    .map(k => (
                      <th key={k} className="text-left px-2 py-2 font-medium">
                        {k}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 6).map((r, i) => (
                  <tr key={i} className="odd:bg-white even:bg-neutral-50/40">
                    {Object.keys(rows[0])
                      .slice(0, 6)
                      .map(k => (
                        <td key={k} className="px-2 py-2 align-top">
                          {Array.isArray(r[k])
                            ? (r[k] as any[]).join(' \n ')
                            : String(r[k] ?? '')}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-2 py-1 text-[10px] text-neutral-500 border-t bg-white/70">
            Showing up to 6 rows/columns{' '}
            {sheets.length > 0 ? `(View: ${selectedSheet})` : ''}
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingTriggerPopup;

// Minimal pane component for generating scenarios from a Google Sheet
const ScenarioGeneratorPane: React.FC = () => {
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState<'idle' | 'generating' | 'exporting'>(
    'idle'
  );
  const [rows, setRows] = React.useState<any[]>([]);
  const [sheets, setSheets] = React.useState<
    Array<{ name: string; scenarios: any[] }>
  >([]);
  const [selectedSheet, setSelectedSheet] = React.useState<string>('ALL');
  const [exportMulti, setExportMulti] = React.useState<boolean>(true);
  const [lastExportedAt, setLastExportedAt] = React.useState<number | null>(
    null
  );
  const [msg, setMsg] = React.useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const generate = async () => {
    setMsg(null);
    if (!url) {
      setMsg({ type: 'error', text: 'Please paste a Google Sheet URL' });
      return;
    }
    setBusy('generating');
    try {
      const res = await apiService.previewScenarios(url);
      if (res.success && (res as any).data) {
        const data: any = (res as any).data;
        const multi = Array.isArray(data.sheets)
          ? (data.sheets as Array<{ name: string; scenarios: any[] }>)
          : [];
        setSheets(multi);
        setSelectedSheet('ALL');
        setRows(multi.flatMap(s => s.scenarios));
      } else {
        setMsg({ type: 'error', text: res.error || 'Generation failed' });
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Failed to generate' });
    } finally {
      setBusy('idle');
    }
  };

  const exportToXlsx = async () => {
    if (!rows.length) {
      setMsg({ type: 'error', text: 'Nothing to export' });
      return;
    }
    setBusy('exporting');
    try {
      const res = await apiService.exportScenariosXlsx(
        sheets.length > 0
          ? {
              sheets: sheets.map(s => ({
                name: s.name,
                scenarios: s.scenarios,
              })),
            }
          : { scenarios: rows }
      );
      if (!res.ok || !res.blob) {
        setMsg({ type: 'error', text: res.error || 'Export failed' });
        setBusy('idle');
        return;
      }
      const blobUrl = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = res.filename || 'scenarios.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      setMsg({ type: 'success', text: 'XLSX exported' });
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || 'Export failed' });
    } finally {
      setBusy('idle');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] text-neutral-700">
        Paste a public Google Sheet URL
      </div>
      <input
        type="text"
        className="w-full px-2 py-2 rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-300 text-xs bg-white"
        placeholder="https://docs.google.com/spreadsheets/d/..."
        value={url}
        onChange={e => setUrl(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={generate}
          disabled={busy !== 'idle' || !url}
          className="pointer-events-auto"
        >
          {busy === 'generating' ? 'Generating…' : 'Generate'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={generate}
          disabled={busy !== 'idle' || !url}
          className="pointer-events-auto"
        >
          Regenerate
        </Button>
        {sheets.length > 0 && (
          <select
            className="text-xs border rounded px-2 py-1 bg-white"
            value={selectedSheet}
            onChange={e => {
              const val = e.target.value;
              setSelectedSheet(val);
              if (val === 'ALL') {
                setRows(sheets.flatMap(s => s.scenarios));
              } else {
                const found = sheets.find(s => s.name === val);
                setRows(found ? found.scenarios : []);
              }
            }}
          >
            <option value="ALL">
              All tabs (
              {sheets.reduce((a, s) => a + (s.scenarios?.length || 0), 0)})
            </option>
            {sheets.map(s => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.scenarios?.length || 0})
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          variant="default"
          onClick={exportToXlsx}
          disabled={busy !== 'idle' || rows.length === 0}
          className="pointer-events-auto"
        >
          Export
        </Button>
        {/* Always export per tab when sheets exist */}
      </div>
      {lastExportedAt && (
        <div className="text-[10px] text-neutral-500">
          Last exported to Scenario Trigger{' '}
          {new Date(lastExportedAt).toLocaleTimeString()}
        </div>
      )}
      {msg && (
        <div
          className={`text-[11px] ${msg.type === 'error' ? 'text-red-600' : 'text-green-700'}`}
        >
          {msg.text}
        </div>
      )}
      {rows.length > 0 && (
        <div className="max-h-56 overflow-auto rounded-md border border-neutral-200 bg-white/80">
          <table className="w-full text-[11px]">
            <thead>
              <tr>
                {Object.keys(rows[0])
                  .slice(0, 5)
                  .map(k => (
                    <th
                      key={k}
                      className="text-left px-2 py-1 border-b bg-neutral-50 sticky top-0"
                    >
                      {k}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-neutral-50/40">
                  {Object.keys(rows[0])
                    .slice(0, 5)
                    .map(k => (
                      <td key={k} className="px-2 py-1 align-top">
                        {Array.isArray(r[k])
                          ? (r[k] as any[]).join(' \n ')
                          : String(r[k] ?? '')}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1 text-[10px] text-neutral-500">
            Showing first 5 rows/columns{' '}
            {sheets.length > 0 ? `(View: ${selectedSheet})` : ''}
          </div>
        </div>
      )}
    </div>
  );
};
