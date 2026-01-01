import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/src/components/ui/ui/scroll-area';
import { Badge } from '@/src/components/ui/ui/badge';
import { storageService } from '@/services/storage';

interface CompactPinnedIssuesProps {
  onClose: () => void;
  onSelect?: (issue: any) => void;
  portalContainer: HTMLElement | null;
}

const CompactPinnedIssues: React.FC<CompactPinnedIssuesProps> = ({
  onClose,
  onSelect,
}) => {
  const [pinnedIssues, setPinnedIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const loadPinned = async () => {
      try {
        const pinned = await storageService.getPinnedIssues();
        setPinnedIssues(pinned);
      } catch (error) {
        console.error('Failed to load pinned issues:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPinned();
  }, []);

  return (
    <div className="flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-end p-2">
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : pinnedIssues.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              No pinned issues
            </div>
          ) : (
            pinnedIssues.map(issue => (
              <button
                key={issue.id}
                onClick={() => onSelect?.(issue)}
                className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                      {issue.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      #{issue.iid} · {issue.project?.name}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {issue.state}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default CompactPinnedIssues;
