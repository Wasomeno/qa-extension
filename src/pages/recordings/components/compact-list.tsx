import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  FileText,
  Play,
  Trash2,
  Plus,
  Clock,
  ExternalLink,
  PlusCircle,
  Loader2,
  Pencil,
  Check,
  X,
  Link,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listRecordings } from '@/api/recording';
import { storageService } from '@/services/storage';
import { useSelectedProject } from '@/contexts/selected-project-context';
import { TestBlueprint } from '@/types/recording';
import { MessageType } from '@/types/messages';
import { isRestrictedUrl } from '@/utils/domain-matcher';
import { ProjectSelect } from '@/components/project-select';

interface CompactRecordingsListProps {
  onClose: () => void;
  onViewAll?: () => void;
  portalContainer?: HTMLDivElement | null;
}

const CompactRecordingSkeleton = () => (
  <div className="px-4 py-3 space-y-2 border-b border-gray-50">
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 flex-1" />
      <div className="flex gap-1">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
    </div>
    <div className="flex items-center gap-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  </div>
);

export const CompactRecordingsList: React.FC<CompactRecordingsListProps> = ({
  onClose,
  onViewAll,
  portalContainer,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const isPageRestricted = isRestrictedUrl(window.location.href);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [portalReady, setPortalReady] = useState(false);

  React.useEffect(() => {
    setPortalReady(true);
  }, []);

  // Use containerRef as portal container if portalContainer is null (for Shadow DOM compatibility)
  const getPortalContainer = useCallback((): HTMLElement | undefined => {
    if (portalContainer) return portalContainer;
    if (containerRef.current) return containerRef.current;
    return undefined;
  }, [portalContainer, portalReady]);

  const queryClient = useQueryClient();
  const { selectedProjectId, setSelectedProject } = useSelectedProject();

  const {
    data: recordings = [],
    isLoading,
    refetch: refetchRecordings,
  } = useQuery({
    queryKey: ['recordings-blueprints', selectedProjectId],
    queryFn: async () => {
      const params: any = {
        sort_by: 'created_at',
        order: 'desc',
      };

      if (selectedProjectId) {
        params.project_id = selectedProjectId;
      }

      const result = await listRecordings(params);
      // Handle both array response and paginated response { data: [...] }
      if (result && typeof result === 'object' && !Array.isArray(result) && 'data' in result) {
        return (result as any).data || [];
      }
      return Array.isArray(result) ? result : [];
    },
    refetchOnMount: 'always',
  });

  const { data: lastBlueprint, refetch: refetchLastBlueprint } = useQuery({
    queryKey: ['last-blueprint'],
    queryFn: async () => {
      const data = await storageService.get('lastBlueprint');
      return data || null;
    },
    refetchOnMount: 'always',
  });

  React.useEffect(() => {
    refetchRecordings();
    refetchLastBlueprint();
  }, [refetchRecordings, refetchLastBlueprint]);

  React.useEffect(() => {
    const handleMessage = (message: any) => {
      if (
        message.type === MessageType.BLUEPRINT_GENERATED ||
        message.type === MessageType.BLUEPRINT_PROCESSING ||
        message.type === MessageType.BLUEPRINT_SAVED
      ) {
        refetchLastBlueprint();
        if (message.type === MessageType.BLUEPRINT_SAVED) {
          refetchRecordings();
        }
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [refetchLastBlueprint]);

  // Sync with storage changes for robustness
  React.useEffect(() => {
    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes['test-blueprints']) {
        refetchRecordings();
      }
      if (changes['lastBlueprint']) {
        refetchLastBlueprint();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [refetchRecordings, refetchLastBlueprint]);

  const handleSaveDraft = useCallback(async () => {
    try {
      // CRITICAL: Fetch the LATEST blueprint from storage to ensure we have enriched xpath data
      const latestBlueprint = await storageService.get('lastBlueprint');
      if (!latestBlueprint) {
        setError('No recording to save. Please record a test first.');
        return;
      }

      // Create a copy of the blueprint with the currently selected project if one is chosen
      const blueprintToSave = {
        ...latestBlueprint,
        projectId:
          selectedProjectId !== 'all'
            ? parseInt(selectedProjectId)
            : latestBlueprint.projectId,
      };

      chrome.runtime.sendMessage(
        {
          type: MessageType.SAVE_BLUEPRINT,
          data: { blueprint: blueprintToSave },
        },
        response => {
          if (chrome.runtime.lastError) {
            setError('Failed to save draft. Connection lost.');
            return;
          }
          if (response?.success) {
            queryClient.setQueryData(['last-blueprint'], null);
            refetchRecordings();
          } else {
            setError(response?.error || 'Failed to save draft');
          }
        }
      );
    } catch (e: any) {
      setError(e.message || 'Failed to save draft');
    }
  }, [selectedProjectId, refetchRecordings]);

  const filteredRecordings = (Array.isArray(recordings) ? recordings : [])
    .filter(
      rec =>
        !selectedProjectId ||
        rec.project_id?.toString() === selectedProjectId
    )
    .slice(0, 5);

  const handleStartRecording = () => {
    setError(null);
    chrome.runtime.sendMessage({ type: MessageType.CLOSE_MAIN_MENU });

    setTimeout(() => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: MessageType.START_RECORDING,
            data: {
              projectId:
                selectedProjectId
                  ? parseInt(selectedProjectId)
                  : undefined,
            },
          },
          response => {
            if (chrome.runtime.lastError) {
              setError('Communication error. Please refresh the page.');
              return;
            }

            if (response?.success) {
              onClose();
            } else {
              const errorMsg = response?.error || 'Failed to start recording';
              setError(errorMsg);
            }
          }
        );
      } else {
        onClose();
      }
    }, 100);
  };

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (e: React.MouseEvent, rec: TestBlueprint) => {
    e.stopPropagation();
    setEditingId(rec.id);
    setEditName(rec.name);
  };

  const handleRename = (id: string) => {
    if (editName.trim() && editName !== recordings.find(r => r.id === id)?.name) {
      chrome.runtime.sendMessage(
        {
          type: MessageType.UPDATE_BLUEPRINT,
          data: { id, data: { name: editName.trim() } },
        },
        () => {
          refetchRecordings();
        }
      );
    }
    setEditingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleRunTest = (blueprint: TestBlueprint) => {
    chrome.runtime.sendMessage({
      type: MessageType.START_PLAYBACK,
      data: { blueprint, active: false },
    });
    onClose();
  };

  const handleDelete = async (id: string) => {
    setIsDeletingId(id);
    chrome.runtime.sendMessage(
      {
        type: MessageType.DELETE_BLUEPRINT,
        data: { id },
      },
      response => {
        setIsDeletingId(null);
        if (response?.success) {
          setDeletedId(id);
          setConfirmDeleteId(null);
          setTimeout(() => {
            setDeletedId(null);
            queryClient.invalidateQueries({ queryKey: ['recordings-blueprints'] });
          }, 1500);
        } else {
          setError(response?.error || 'Failed to delete recording');
        }
      }
    );
  };

  const handleCopyVideoLink = (e: React.MouseEvent, blueprint: TestBlueprint) => {
    e.stopPropagation();
    if (blueprint.video_url) {
      navigator.clipboard.writeText(blueprint.video_url);
      toast.success('Video link copied to clipboard');
    } else {
      toast.error('No video available for this recording');
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-[380px] w-full bg-white"
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b bg-gray-50/50 flex items-center justify-end gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <ProjectSelect
            value={selectedProjectId}
            onSelect={project => {
              setSelectedProject(project);
            }}
            mode="single"
            portalContainer={getPortalContainer()}
            placeholder="All Projects"
            extraOptions={{ allProjects: true }}
          />

          <Button
            variant="default"
            size="sm"
            onClick={handleStartRecording}
            disabled={isPageRestricted}
            title={
              isPageRestricted
                ? 'Browser internal pages cannot be recorded'
                : 'Start recording'
            }
            className="h-8 px-2.5 text-xs gap-1.5 border-none shrink-0 shadow-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100">
          <p className="text-[11px] text-red-600 font-medium leading-tight">
            {error}
          </p>
        </div>
      )}

      {lastBlueprint && (
        <div
          className={`px-4 py-3 border-b flex items-center justify-between gap-3 ${
            lastBlueprint.status === 'processing'
              ? 'bg-yellow-50 border-yellow-100'
              : lastBlueprint.status === 'failed'
                ? 'bg-red-50 border-red-100'
                : 'bg-blue-50 border-blue-100'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {lastBlueprint.status === 'processing' && (
              <Loader2 className="w-4 h-4 text-yellow-600 animate-spin shrink-0" />
            )}
            <div className="min-w-0">
              <p
                className={`text-[11px] font-bold uppercase tracking-tight ${
                  lastBlueprint.status === 'processing'
                    ? 'text-yellow-700'
                    : lastBlueprint.status === 'failed'
                      ? 'text-red-700'
                      : 'text-blue-700'
                }`}
              >
                {lastBlueprint.status === 'processing'
                  ? 'Processing Recording...'
                  : lastBlueprint.status === 'failed'
                    ? 'Processing Failed'
                    : 'Recent Draft'}
              </p>
              <p className="text-xs font-medium text-gray-900 truncate">
                {lastBlueprint.status === 'failed'
                  ? lastBlueprint.error || 'AI generation failed'
                  : lastBlueprint.status === 'processing'
                    ? 'AI is analyzing your test steps...'
                    : lastBlueprint.name}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {lastBlueprint.status !== 'processing' &&
              lastBlueprint.status !== 'failed' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] px-2 hover:bg-blue-100 text-blue-700"
                    onClick={() => handleRunTest(lastBlueprint)}
                  >
                    Preview
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-[10px] px-2 bg-blue-600 hover:bg-blue-700 text-white border-none"
                    onClick={handleSaveDraft}
                  >
                    Save
                  </Button>
                </>
              )}
            {lastBlueprint.status === 'failed' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] px-2 hover:bg-red-100 text-red-700"
                onClick={() => {
                  chrome.storage.local.remove('lastBlueprint');
                  queryClient.setQueryData(['last-blueprint'], null);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 5 }).map((_, i) => (
              <CompactRecordingSkeleton key={i} />
            ))}
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-center px-6 py-8">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1 border-none bg-transparent">
              No recordings found
            </p>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed max-w-[200px] mx-auto border-none bg-transparent">
              Select a project or start a new recording to see results here.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartRecording}
              disabled={isPageRestricted}
              title={
                isPageRestricted
                  ? 'Browser internal pages cannot be recorded'
                  : 'Start first recording'
              }
              className="text-xs h-9 gap-2 border-gray-200 hover:bg-gray-50 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusCircle className="w-3.5 h-3.5 text-red-500" />
              Start first recording
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredRecordings.map(rec => (
              <div
                key={rec.id}
                className="px-4 py-3 hover:bg-gray-50/80 transition-colors group cursor-pointer relative"
                onClick={() => {
                  if (editingId === rec.id) return;
                  const url = chrome.runtime.getURL(
                    `recording-detail.html?id=${rec.id}`
                  );
                  chrome.runtime.sendMessage({
                    type: MessageType.OPEN_URL,
                    data: { url, active: true },
                  });
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {editingId === rec.id ? (
                    <Input
                      ref={editInputRef}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleRename(rec.id)}
                      onKeyDown={e => handleRenameKeyDown(e, rec.id)}
                      onClick={e => e.stopPropagation()}
                      className="h-7 text-sm py-0 flex-1"
                    />
                  ) : (
                    <span className="font-medium text-sm text-gray-900 truncate group-hover:text-red-600 transition-colors flex-1 min-w-0">
                      {rec.name}
                    </span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {!editingId && confirmDeleteId !== rec.id && isDeletingId !== rec.id && deletedId !== rec.id && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-zinc-100"
                          onClick={e => handleStartRename(e, rec)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-green-50 hover:text-green-600"
                          onClick={e => {
                            e.stopPropagation();
                            handleRunTest(rec);
                          }}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            rec.video_url 
                              ? "hover:bg-blue-50 hover:text-blue-600" 
                              : "opacity-40 cursor-not-allowed"
                          )}
                          onClick={e => handleCopyVideoLink(e, rec)}
                          disabled={!rec.video_url}
                          title={rec.video_url ? "Copy video link" : "No video available"}
                        >
                          <Link className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmDeleteId(rec.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Delete state overlays: confirmation → loading → success */}
                <AnimatePresence>
                  {(confirmDeleteId === rec.id || isDeletingId === rec.id || deletedId === rec.id) && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 z-10 bg-white/[0.97] backdrop-blur-[1px] px-4 flex items-center"
                      onClick={e => e.stopPropagation()}
                    >
                      <AnimatePresence mode="wait">
                        {confirmDeleteId === rec.id && (
                          <motion.div
                            key="confirm"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.14 }}
                            className="flex items-center justify-between w-full"
                          >
                            <span className="text-xs font-medium text-gray-600">
                              Delete this recording?
                            </span>
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-gray-500 hover:text-gray-800"
                                onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs bg-red-600 hover:bg-red-700"
                                onClick={e => { e.stopPropagation(); handleDelete(rec.id); }}
                              >
                                Delete
                              </Button>
                            </div>
                          </motion.div>
                        )}

                        {isDeletingId === rec.id && (
                          <motion.div
                            key="loading"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.14 }}
                            className="flex items-center gap-2 text-xs text-gray-500"
                          >
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                            <span>Deleting…</span>
                          </motion.div>
                        )}

                        {deletedId === rec.id && (
                          <motion.div
                            key="success"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.14 }}
                            className="flex items-center gap-2 text-xs text-green-600 font-medium"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Deleted</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-center gap-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> {rec.steps.length} steps
                  </span>
                  {rec.project_id && (
                    <div onClick={e => e.stopPropagation()}>
                    <ProjectSelect
                    value={rec.project_id ?? null}
                    projectName={rec.project_name}
                    onSelect={(project) => {
                      chrome.runtime.sendMessage(
                          {
                            type: MessageType.UPDATE_BLUEPRINT,
                            data: { id: rec.id, data: { project_id: project?.id ?? null } },
                          },
                          () => {
                            refetchRecordings();
                          }
                      );
                    }}
                    mode="single"
                    size="compact"
                    portalContainer={getPortalContainer()}
                    stopPropagation
                  />
                  </div>
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
            if (onViewAll) {
              onViewAll();
            } else {
              onClose();
            }
          }}
        >
          <span>View all recordings</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
