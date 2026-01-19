import React, { useState } from 'react';
import { X } from 'lucide-react';
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
  onSelect?: (issue: Issue) => void;
  portalContainer: HTMLElement | null;
}

const CompactPinnedList: React.FC<CompactPinnedListProps> = ({
  onClose,
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
      {/* Close Button - Absolute Top Right */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1.5 hover:bg-gray-100 rounded-full transition-colors z-20 bg-white/80 backdrop-blur-sm shadow-sm border border-gray-100"
      >
        <X className="w-4 h-4 text-gray-500" />
      </button>

      {/* List */}
      <ScrollArea className="flex-1 pt-8">
        <div className="p-3 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <IssueCardSkeleton key={i} />
              ))}
            </div>
          ) : pinnedIssues.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500 flex flex-col items-center">
              <p>No pinned issues</p>
            </div>
          ) : (
            pinnedIssues.map(issue => (
              <div key={issue.id} className="relative">
                <IssueCard
                  issue={issue}
                  variant="pinned"
                  onClick={() => onSelect?.(issue)}
                  onUnpin={togglePin}
                  onSetPinColor={iss => setEditingColorIssueId(iss.id)}
                  onAddNote={iss => setEditingNoteIssue(iss as PinnedIssue)}
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
