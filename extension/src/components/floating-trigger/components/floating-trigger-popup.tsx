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
import useAuth from '@/hooks/useAuth';
import { authService } from '@/services/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const localQueryClient = new QueryClient();

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
    const formatAgo = (ts?: number) => {
      if (!ts) return '';
      const diff = Math.max(0, Date.now() - ts);
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    };

    // Recording label removed

    return (
      <div
        className="flex relative flex-col h-full w-[260px] p-3"
        onMouseDown={onMouseDown}
      >
        {!isAuthenticated && (
          <div className="absolute h-full z-40 w-full bg-neutral-50/90 backdrop-blur-sm top-0 left-0 p-4 flex flex-col gap-2 justify-center items-center rounded-xl">
            <div className="font-medium text-sm mb-1">
              Your Session is Invalid
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                className="pointer-events-auto text-xs bg-neutral-200"
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
                {authBusy ? 'Opening…' : 'Sign in'}
              </Button>
              {authError && (
                <span className="text-[color:var(--qa-fg)]">{authError}</span>
              )}
            </div>
          </div>
        )}

        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Quick Actions</span>
          <Button
            variant="ghost"
            onClick={onClose}
            className="p-0 h-fit hover:bg-none"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
        {/* Create Issue - prominent card */}
        <button
          disabled={!isAuthenticated}
          onClick={() => onFeatureSelect('issue')}
          className="group w-full text-left bg-white/40 hover:bg-white/60 active:bg-white/70 border border-white/30 rounded-lg px-3 py-2 transition-colors pointer-events-auto disabled:opacity-60 disabled:cursor-not-allowed"
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
                Your saved filter: “Assigned to me”
              </div>
            </div>
            <div className="ml-3 flex items-center gap-2 text-xs text-neutral-700">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 bg-neutral-200/70">
                open
              </span>
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

        {/* Workflows */}
        <button
          onClick={() => onFeatureSelect('workflows')}
          className="group w-full text-left hover:bg-neutral-100/60 rounded-lg px-3 py-2 transition-colors pointer-events-auto"
        >
          <div className="flex items-center">
            <WorkflowIcon className="w-4 h-4 mr-3 text-neutral-700" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900">
                Workflows
              </div>
              <div className="text-xs text-neutral-500">
                Run or schedule automations
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
          <div className="flex flex-col w-[400px] h-full">
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
                <CompactIssueCreator
                  className="border-0 p-4"
                  portalContainer={portalRef.current}
                />
              </ErrorBoundary>
            </div>
          </div>
        );
      case 'issues':
        return (
          <div className="flex flex-col w-[400px] h-full">
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
              <PinnedIssues className="p-2" />
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
                  <IssueDetail issue={selectedIssue} />
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
          <div className="flex flex-col w-[400px] h-full">
            <HeaderBar
              title="Task Scenario Generator"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            <div className="flex-1 min-h-0 overflow-auto p-3">
              <ScenarioGeneratorPane />
            </div>
          </div>
        );
      default:
        return renderFeatureList();
    }
  };

  return (
    <QueryClientProvider client={localQueryClient}>
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
              transition={{ ease: 'easeInOut' }}
            >
              {renderFeatureDetail()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Portal root inside shadow DOM but outside scroll clipping */}
      <div ref={portalRef} className="pointer-events-none" />
    </QueryClientProvider>
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
        const scenarios = data.scenarios || [];
        setRows(scenarios);
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
      const res = await apiService.exportScenariosXlsx({ scenarios: rows });
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
      setMsg({ type: 'success', text: 'CSV exported' });
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
        <Button
          size="sm"
          variant="default"
          onClick={exportToXlsx}
          disabled={busy !== 'idle' || rows.length === 0}
          className="pointer-events-auto"
        >
          Export
        </Button>
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
            Showing first 5 rows/columns
          </div>
        </div>
      )}
    </div>
  );
};
