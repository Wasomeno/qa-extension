import React, { useState } from 'react';
import { X, Pin, ExternalLink } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnimatePresence, motion } from 'framer-motion';
import { Issue } from '@/api/issue';
import { usePinnedIssues, PinnedIssue } from '@/hooks/use-pinned-issues';
import { IssueCard } from '@/pages/issues/components/issue-card';
import { IssueCardSkeleton } from '@/pages/issues/components/issue-card-skeleton';
import { PinColorPicker } from '../components/pin-color-picker';
import { PinNoteModal } from '../components/pin-note-modal';

interface CompactPinnedListProps {
  onClose: () => void;
  onGoToMain?: () => void;
  onSelect?: (issue: Issue) => void;
  portalContainer: HTMLElement | null;
}

const CompactPinnedList: React.FC<CompactPinnedListProps> = ({
  onClose,
  onGoToMain,
  onSelect,
}) => {
  const { pinnedIssues, isLoading, togglePin, updatePinMeta } =
    usePinnedIssues();

  const [editingColorIssueId, setEditingColorIssueId] = useState<number | null>(
    null
  );
  const [editingNoteIssue, setEditingNoteIssue] = useState<PinnedIssue | null>(
    null
  );

  const handleSaveNote = (note: string) => {
    if (!editingNoteIssue) return;
    updatePinMeta(editingNoteIssue.iid, editingNoteIssue.project_id, { note });
    setEditingNoteIssue(null);
  };

  return (
    <div className="flex flex-col h-[360px] relative">
      {onGoToMain && (
        <div className="flex justify-end px-3 py-2">
          <button
            type="button"
            onClick={onGoToMain}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open full page
          </button>
        </div>
      )}
      {/* List */}
      <ScrollArea className="flex-1 w-full">
        <div className="p-3 space-y-3 overflow-hidden w-full">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <IssueCardSkeleton key={i} />
              ))}
            </div>
          ) : pinnedIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                <Pin className="w-6 h-6 text-gray-300" />
              </div>
              <h3 className="text-sm font-semibold text-gray-700">
                No pinned issues
              </h3>
              <p className="text-xs text-gray-400 mt-1 max-w-[200px] mx-auto">
                Pin important issues from the Issues tab to keep them here for
                quick access.
              </p>
            </div>
          ) : (
            pinnedIssues.map(issue => (
              <div key={issue.id} className="relative w-full overflow-hidden flex-shrink-0">
                <IssueCard
                  issue={issue}
                  variant="pinned"
                  onClick={() => onSelect?.(issue)}
                  onUnpin={togglePin}
                  onSetPinColor={iss => setEditingColorIssueId(iss.id)}
                  onAddNote={iss => setEditingNoteIssue(iss as PinnedIssue)}
                  className="max-w-full"
                />

                {/* Color Picker Overlay */}
                <AnimatePresence>
                  {editingColorIssueId === issue.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 top-12 z-50 w-full flex justify-end pr-2"
                    >
                      <PinColorPicker
                        currentColor={issue.pinnedMeta?.pinColor}
                        onSelect={color => {
                          updatePinMeta(issue.iid, issue.project_id, {
                            pinColor: color,
                          });
                          setEditingColorIssueId(null);
                        }}
                        onClose={() => setEditingColorIssueId(null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <PinNoteModal
        isOpen={!!editingNoteIssue}
        onClose={() => setEditingNoteIssue(null)}
        onSave={handleSaveNote}
        initialNote={editingNoteIssue?.pinnedMeta?.note}
        issueTitle={editingNoteIssue?.title || ''}
        portalContainer={
          document.querySelector('[role="dialog"]') || document.body
        }
      />
    </div>
  );
};

export default CompactPinnedList;
