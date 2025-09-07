import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  FileText,
  X,
  WorkflowIcon,
  Pin,
  Video,
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
import RecordingsList from '@/components/recordings-list';
import rrwebRecorder from '@/services/rrweb-recorder';
import { storageService } from '@/services/storage';
import { Button } from '@/src/components/ui/ui/button';
import useAuth from '@/hooks/useAuth';
import { authService } from '@/services/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  const [isRecording, setIsRecording] = React.useState<boolean>(
    rrwebRecorder.isRecording
  );
  const [recordingsCount, setRecordingsCount] = React.useState<number>(0);
  const [lastRecording, setLastRecording] = React.useState<{
    title?: string;
    url?: string;
    startedAt?: number;
  } | null>(null);
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

  // Poll recording state for quick toggle label
  React.useEffect(() => {
    const t = setInterval(() => {
      setIsRecording(rrwebRecorder.isRecording);
    }, 500);
    return () => clearInterval(t);
  }, []);

  // Load recordings summary for the Quick Actions card
  React.useEffect(() => {
    const loadSummary = async () => {
      try {
        const list = await rrwebRecorder.listRecordings();
        setRecordingsCount(list.length);
        const latest = list
          .slice()
          .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
        setLastRecording(
          latest
            ? {
                title: latest.title,
                url: latest.url,
                startedAt: latest.startedAt,
              }
            : null
        );
      } catch {}
    };
    loadSummary();
    const unsub = storageService.onChanged('recordings' as any, () => {
      loadSummary();
    });
    return () => {
      unsub && unsub();
    };
  }, []);

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

    const lastRecLabel = lastRecording
      ? `Last: “${(lastRecording.title || lastRecording.url || 'Session').slice(0, 28)}” • ${formatAgo(
          lastRecording.startedAt
        )}`
      : 'No recent sessions';

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

        {/* Recording */}
        <button
          onClick={() => onFeatureSelect('recordings')}
          className="group w-full text-left hover:bg-neutral-100/60 rounded-lg px-3 py-2 transition-colors pointer-events-auto"
        >
          <div className="flex items-center">
            <Video className="w-4 h-4 mr-3 mt-0.5 text-neutral-700" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900">
                Recording{' '}
                <span className="text-neutral-500">
                  {recordingsCount > 0 ? `${recordingsCount} sessions` : ''}
                </span>
              </div>
              <div className="text-xs text-neutral-500 truncate">
                {lastRecLabel}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 mt-0.5 opacity-60 group-hover:opacity-100" />
          </div>
        </button>

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
      case 'recordings':
        return (
          <div className="flex flex-col w-[400px] h-full">
            <HeaderBar
              title="Recording"
              onBack={onBack}
              onClose={onClose}
              onMouseDown={onMouseDown}
            />
            {/* Controls */}
            <RecordingControls />
            {/* List */}
            <div className="flex-1 min-h-0 overflow-auto">
              <RecordingsList className="p-2" />
            </div>
          </div>
        );
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

// Inline RecordingControls component
const RecordingControls: React.FC = () => {
  const [isRecording, setIsRecording] = React.useState(
    rrwebRecorder.isRecording
  );
  const [startedAt, setStartedAt] = React.useState<number | undefined>(
    rrwebRecorder.currentMeta?.startedAt
  );
  const [eventCount, setEventCount] = React.useState<number>(
    rrwebRecorder.currentMeta?.eventCount || 0
  );
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    try {
      console.log('[QA Extension] Rendering RecordingControls');
    } catch {}
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll rrwebRecorder meta since we don't have events from it
  React.useEffect(() => {
    const t = setInterval(() => {
      setIsRecording(rrwebRecorder.isRecording);
      setStartedAt(rrwebRecorder.currentMeta?.startedAt);
      setEventCount(rrwebRecorder.currentMeta?.eventCount || 0);
    }, 500);
    return () => clearInterval(t);
  }, []);

  const durationSec =
    isRecording && startedAt
      ? Math.max(0, Math.round((now - startedAt) / 1000))
      : 0;

  const handleStart = async () => {
    if (!rrwebRecorder.isRecording) {
      await rrwebRecorder.start();
      setIsRecording(true);
      setStartedAt(rrwebRecorder.currentMeta?.startedAt);
    }
  };

  const handleStop = async () => {
    if (rrwebRecorder.isRecording) {
      try {
        const saved = await rrwebRecorder.stop({ persist: true });
        try {
          console.log(
            '[QA Extension] Recording saved:',
            saved?.id,
            'events:',
            saved?.events?.length
          );
        } catch {}
      } catch (e) {
        console.error('[QA Extension] Failed to save recording:', e);
      }
      setIsRecording(false);
    }
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`inline-block w-2 h-2 rounded-full ${isRecording ? 'bg-red-500' : 'bg-gray-400'}`}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {isRecording ? 'Recording…' : 'Not Recording'}
          </div>
          <div className="text-xs opacity-80 truncate">
            {isRecording ? (
              <>
                Duration: {durationSec}s • Events: {eventCount}
              </>
            ) : (
              'Click Start to begin a new session'
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isRecording ? (
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto"
            onClick={handleStop}
          >
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            onClick={handleStart}
          >
            Start
          </Button>
        )}
      </div>
    </div>
  );
};
