import React, { useState } from 'react';
import { Pin } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnimatePresence, motion } from 'framer-motion';
import { IssueCard } from '@/pages/issues/components/issue-card';
import { IssueCardSkeleton } from '@/pages/issues/components/issue-card-skeleton';
import { PinColorPicker } from './components/pin-color-picker';
import { PinNoteModal } from './components/pin-note-modal';
import { PinnedIssueMeta } from '@/types/issues';
import { usePinnedIssues, PinnedIssue } from '@/hooks/use-pinned-issues';

export const PinnedPage: React.FC = () => {
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

  if (isLoading) {
    return (
      <ScrollArea className="h-full">
        <div className="space-y-8 p-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-64 bg-gray-100 rounded mt-2 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {[...Array(3)].map((_, i) => (
              <IssueCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-8 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pinned Issues</h1>
            <p className="text-sm text-gray-500 mt-1">
              Quick access to your important issues
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-100">
            <Pin className="w-3.5 h-3.5 text-amber-500 fill-current" />
            <span className="text-xs font-medium text-amber-700">
              {pinnedIssues.length} Pinned
            </span>
          </div>
        </div>

        {pinnedIssues.length > 0 ? (
          <div className="grid grid-cols-1 gap-1">
            {pinnedIssues.map(issue => (
              <div key={issue.id} className="relative">
                <IssueCard
                  issue={issue}
                  variant="pinned"
                  onClick={() => {
                    // Navigate logic if needed, or open external
                    // For main page, maybe open issue detail modal handled by parent?
                    // Currently IssueCard handles click
                  }}
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
                      className="absolute right-0 top-12 z-50"
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
            ))}
          </div>
        ) : (
          <div className="text-center py-12 flex flex-col items-center justify-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Pin className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-700">
              No pinned issues
            </h3>
            <p className="text-sm text-gray-400 mt-1 max-w-xs px-4">
              Pin important issues from the Issues tab to keep them here for
              quick access.
            </p>
          </div>
        )}
      </div>

      <PinNoteModal
        isOpen={!!editingNoteIssue}
        onClose={() => setEditingNoteIssue(null)}
        onSave={handleSaveNote}
        initialNote={editingNoteIssue?.pinnedMeta?.note}
        issueTitle={editingNoteIssue?.title || ''}
      />
    </ScrollArea>
  );
};

export default PinnedPage;
