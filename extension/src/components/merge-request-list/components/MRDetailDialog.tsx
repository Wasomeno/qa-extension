import React from 'react';
import {
  Dialog,
  DialogContent,
} from '@/src/components/ui/ui/dialog';
import { MRDetail } from './MRDetail';
import type { MergeRequestSummary } from '@/types/merge-requests';

interface MRDetailDialogProps {
  mr: MergeRequestSummary | null;
  onOpenChange: (open: boolean) => void;
  portalContainer?: Element | null;
}

export const MRDetailDialog: React.FC<MRDetailDialogProps> = ({
  mr,
  onOpenChange,
  portalContainer,
}) => {
  return (
    <Dialog open={!!mr} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0"
        container={portalContainer || undefined}
      >
        {mr && (
          <div className="flex-1 overflow-auto">
            <MRDetail
              mr={mr}
              portalContainer={portalContainer}
              onGenerateFix={(note: any) => {
                console.log('Generate fix for DiffNote:', note);
                // TODO: Implement AI-powered fix generation
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
