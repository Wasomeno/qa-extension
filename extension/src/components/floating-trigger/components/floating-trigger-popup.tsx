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

  const renderFeatureList = () => (
    <div
      className="flex relative flex-col h-full w-full space-y-1 p-3"
      onMouseDown={onMouseDown}
    >
      {!isAuthenticated && (
        <div className="absolute h-full z-40 w-full bg-neutral-50 top-0 left-0 p-3 flex flex-col gap-2 justify-center items-center">
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
      <Button
        onClick={() => onFeatureSelect('issue')}
        disabled={!isAuthenticated}
        py-2
        px-3
        className="bg-transparent hover:bg-neutral-100 py-2 px-3 text-[color:var(--qa-fg)] text-sm h-auto justify-start rounded-lg transition-all duration-200 border-0 pointer-events-auto disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileText className="w-4 h-4 mr-3" />
        Create Issue
      </Button>
      <Button
        onClick={() => onFeatureSelect('issues')}
        disabled={!isAuthenticated}
        className="bg-transparent py-2 px-3 hover:bg-neutral-100 text-[color:var(--qa-fg)] text-sm h-auto justify-start rounded-lg transition-all duration-200 border-0 pointer-events-auto disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ListCheck className="w-4 h-4 mr-3 " />
        Issue List
      </Button>
      <Button
        onClick={() => onFeatureSelect('recordings')}
        className="bg-transparent py-2 px-3 hover:bg-neutral-100 text-[color:var(--qa-fg)] text-sm h-auto justify-start rounded-lg transition-all duration-200 border-0 pointer-events-auto"
      >
        <Video className="w-4 h-4 mr-3" />
        Recording
      </Button>
      <Button
        onClick={() => onFeatureSelect('pinned')}
        className="bg-transparent py-2 px-3 hover:bg-neutral-100 text-[color:var(--qa-fg)] text-sm h-auto justify-start rounded-lg transition-all duration-200 border-0 pointer-events-auto"
      >
        <Pin className="w-4 h-4 mr-3" />
        Pinned {pinnedCount > 0 ? `(${pinnedCount})` : ''}
      </Button>
      <Button
        onClick={() => onFeatureSelect('workflows')}
        className="bg-transparent py-2 px-3 hover:bg-neutral-100 text-[color:var(--qa-fg)] text-sm h-auto justify-start rounded-lg transition-all duration-200 border-0 pointer-events-auto"
      >
        <WorkflowIcon className="w-4 h-4 mr-3" />
        Workflows
      </Button>
    </div>
  );

  const renderFeatureDetail = () => {
    switch (selectedFeature) {
      case 'issue':
        return (
          <div className="flex flex-col h-full">
            <div
              className="flex items-center p-4 border-b border-gray-100"
              onMouseDown={onMouseDown}
            >
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="p-2 pointer-events-auto"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 ml-2">
                <h3 className="text-lg font-semibold">Create Issue</h3>
              </div>
            </div>
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
          <div className="flex flex-col h-full">
            <div
              className="flex items-center p-4 border-b border-gray-100 overflow-hidden"
              onMouseDown={onMouseDown}
            >
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="p-2 pointer-events-auto"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 ml-2">
                <h3 className="text-lg font-semibold">Issues</h3>
              </div>
            </div>
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
                  className="p-2"
                  portalContainer={portalRef.current}
                  onSelect={issue => onIssueSelect && onIssueSelect(issue)}
                />
              </ErrorBoundary>
            </div>
          </div>
        );
      case 'recordings':
        return (
          <div className="flex flex-col h-full">
            <div
              className="flex items-center p-4 border-b border-gray-100"
              onMouseDown={onMouseDown}
            >
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="p-2 pointer-events-auto"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 ml-2">
                <h3 className="text-lg font-semibold">Recording</h3>
              </div>
            </div>
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
            <div
              className="flex items-center p-4 border-b border-gray-100"
              onMouseDown={onMouseDown}
            >
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="p-2 pointer-events-auto"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 ml-2">
                <h3 className="text-lg font-semibold">Pinned</h3>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ErrorBoundary
                fallbackRender={err => (
                  <div className="p-3 text-xs text-red-400 bg-red-50 border border-red-200 rounded-md">
                    Pinned crashed: {err.message || 'Unknown error'}.
                  </div>
                )}
              >
                <PinnedIssues className="p-2" />
              </ErrorBoundary>
            </div>
          </div>
        );
      case 'issue-detail':
        return (
          <div className="flex flex-col h-full">
            <div
              className="flex items-center p-4 border-b border-gray-100"
              onMouseDown={onMouseDown}
            >
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="p-2 pointer-events-auto"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 ml-2">
                <h3 className="text-lg font-semibold">Issue Detail</h3>
              </div>
            </div>
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
            <div
              className="flex items-center p-4 border-b border-gray-100"
              onMouseDown={onMouseDown}
            >
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="p-2 pointer-events-auto"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 ml-2">
                <h3 className="text-lg font-semibold">Workflows</h3>
              </div>
            </div>
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
      {viewState !== 'closed' && (
        <Button
          onClick={onClose}
          variant="ghost"
          className="absolute top-2 right-2 p-2 w-6 h-6 z-20 glass-panel hover:bg-glass-pane rounded-full pointer-events-auto"
          aria-label="Close"
        >
          <X className="w-3 h-3" />
        </Button>
      )}
      {viewState !== 'closed' && (
        <div
          className="w-full h-full p-0 relative z-10 glass-panel overflow-hidden"
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
              >
                {renderFeatureDetail()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
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
