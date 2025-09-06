import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/ui/dialog';
import { Badge } from '@/src/components/ui/ui/badge';
import { Bug } from 'lucide-react';
import CompactIssueCreator from '@/components/compact-issue-creator';
import { IssueData } from '@/types/messages';

interface IssueCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Partial<IssueData>;
  context?: {
    url: string;
    title: string;
    screenshot?: string;
    elementInfo?: any;
    recordingId?: string;
  };
  onSubmit?: (issue: IssueData) => void;
  onSaveDraft?: (draft: IssueData) => void;
}

export const IssueCreationModal: React.FC<IssueCreationModalProps> = ({
  isOpen,
  onClose,
  initialData,
  context,
  onSubmit,
  onSaveDraft,
}) => {
  const handleSubmit = (issue: IssueData) => {
    onSubmit?.(issue);
    onClose(); // Close modal after successful submission
  };

  const handleSaveDraft = (draft: IssueData) => {
    onSaveDraft?.(draft);
    onClose(); // Close modal after saving draft
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-lg max-h-[95vh] overflow-hidden p-0 gap-0 bg-white border border-gray-200 shadow-2xl"
        style={{
          position: 'fixed',
          zIndex: 999999999,
          backgroundColor: '#ffffff',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '14px',
          lineHeight: '1.5',
          color: '#111827',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          borderRadius: '12px',
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                <Bug className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 tracking-tight">
                  Create Issue
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-0.5">
                  Report a bug or quality issue
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              QA Report
            </Badge>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4">
            <CompactIssueCreator
              initialData={initialData}
              context={context}
              onSubmit={handleSubmit}
              onCancel={onClose}
              onSaveDraft={handleSaveDraft}
              className="border-0 p-0"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IssueCreationModal;