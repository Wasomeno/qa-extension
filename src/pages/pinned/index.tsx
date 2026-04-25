import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pin } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion as fm } from 'framer-motion';
import { IssueCard } from '@/pages/issues/components/issue-card';
import { IssueCardSkeleton } from '@/pages/issues/components/issue-card-skeleton';
import { PinColorPicker } from './components/pin-color-picker';
import { PinNoteModal } from './components/pin-note-modal';
import { usePinnedIssues, PinnedIssue } from '@/hooks/use-pinned-issues';
import { useNavigation } from '@/contexts/navigation-context';
import { EmptyState } from '@/components/ui/empty-state';

interface PinnedPageProps {
  portalContainer?: HTMLElement | null;
}

export const PinnedPage: React.FC<PinnedPageProps> = ({ portalContainer }) => {
  const { push } = useNavigation();
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
        <div className="flex flex-col h-full p-8 gap-8">
          <div className="shrink-0">
            <h1 className="text-2xl font-bold text-gray-900">Pinned Issues</h1>
            <p className="text-sm text-gray-500 mt-1">
              Quick access to your important issues
            </p>
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
    <ScrollArea className="h-full [&>div>div[style]]:!block [&>div>div[style]]:h-full">
      <div className="flex flex-col h-full p-8 gap-8">
        <div className="shrink-0 flex items-center justify-between">
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
                  onClick={(iss) => push('issue-detail', iss)}
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
          <EmptyState
            icon={Pin}
            title="No pinned issues"
            description="Pin important issues from the Issues tab to keep them here for quick access."
          />
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
