import React from 'react';
import {
  Play,
  Copy,
  Trash2,
  FileText,
  Settings,
  Key,
  Info,
  Check,
  X,
  Sheet,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { TestScenario } from '@/types/test-scenario';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ScenarioItemProps {
  scenario: TestScenario;
  isSelected?: boolean;
  projectName?: string;
  onClick: () => void;
  onGenerate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting?: boolean;
  deleteError?: string | null;
}

export const ScenarioItem: React.FC<ScenarioItemProps> = ({
  scenario,
  isSelected,
  projectName,
  onClick,
  onGenerate,
  onDelete,
  isDeleting = false,
  deleteError = null,
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const isGenerating = scenario.status === 'generating';
  const isReady = scenario.status === 'ready';
  const isFailed = scenario.status === 'failed';

  // Close confirmation dialog when deletion starts
  React.useEffect(() => {
    if (isDeleting) {
      setIsConfirmingDelete(false);
    }
  }, [isDeleting]);

  const totalTestCases = (scenario.sheets || []).reduce(
    (acc, sheet) => acc + (sheet.testCases?.length || 0),
    0
  );

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex flex-col border rounded-xl overflow-hidden cursor-pointer transition-all duration-200',
        'bg-white hover:border-zinc-300 hover:shadow-md h-full relative',
        isSelected && 'ring-2 ring-zinc-900 border-transparent shadow-md'
      )}
    >
      {isConfirmingDelete && (
        <div
          className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-200"
          onClick={e => e.stopPropagation()}
        >
          {isDeleting ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-8 h-8 text-zinc-600 mb-2" />
              </motion.div>
              <p className="text-sm font-semibold text-zinc-900 mb-1">
                Deleting...
              </p>
              <p className="text-xs text-zinc-500">
                Please wait while we remove this scenario.
              </p>
            </>
          ) : deleteError ? (
            <>
              <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
              <p className="text-sm font-bold text-gray-900 mb-1">
                Failed to delete
              </p>
              <p className="text-xs text-red-600 mb-4 max-w-[200px]">
                {deleteError}
              </p>
              <div className="flex items-center gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs"
                  onClick={e => {
                    e.stopPropagation();
                    setIsConfirmingDelete(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 h-9 text-xs bg-red-600 hover:bg-red-700"
                  onClick={onDelete}
                >
                  Retry
                </Button>
              </div>
            </>
          ) : (
            <>
              <Trash2 className="w-8 h-8 text-red-500 mb-2" />
              <p className="text-sm font-bold text-gray-900 mb-1">
                Delete this test scenario?
              </p>
              <p className="text-xs text-gray-500 mb-4">
                This action cannot be undone.
              </p>
              <div className="flex items-center gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs"
                  onClick={e => {
                    e.stopPropagation();
                    setIsConfirmingDelete(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 h-9 text-xs bg-red-600 hover:bg-red-700"
                  onClick={onDelete}
                >
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3
              className="font-semibold text-zinc-900 truncate"
              title={scenario.fileName}
            >
              {scenario.fileName}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
              <span className="truncate">
                {formatDistanceToNow(new Date(scenario.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      isDeleting 
                        ? "text-zinc-400 cursor-not-allowed" 
                        : "text-zinc-500 hover:text-red-600 hover:bg-red-50"
                    )}
                    onClick={e => {
                      e.stopPropagation();
                      if (!isDeleting) {
                        setIsConfirmingDelete(true);
                      }
                    }}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isDeleting ? 'Deleting...' : 'Delete Wrapper'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      isDeleting
                        ? "text-zinc-300 cursor-not-allowed"
                        : "text-zinc-500 hover:text-blue-600 hover:bg-blue-50"
                    )}
                    onClick={onGenerate}
                    disabled={isDeleting}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Generate Scripts</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-zinc-600">
          <div className="flex items-center gap-1.5" title="Total Sheets">
            <FileText className="w-4 h-4" />
            <span>{(scenario.sheets || []).length} sheets</span>
          </div>
          <div className="flex items-center gap-1.5" title="Total Test Cases">
            <Info className="w-4 h-4" />
            <span>{totalTestCases} test cases</span>
          </div>
          <div
            className="flex items-center gap-1.5"
            title="Generated Recordings"
          >
            <Settings className="w-4 h-4" />
            <span>{(scenario.generatedTests || []).length} generated</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t mt-auto">
          <Badge
            variant="secondary"
            className={cn(
              'capitalize font-medium text-xs',
              isGenerating && 'bg-blue-100 text-blue-700 hover:bg-blue-100',
              isReady && 'bg-green-100 text-green-700 hover:bg-green-100',
              isFailed && 'bg-red-100 text-red-700 hover:bg-red-100',
              scenario.status === 'uploaded' &&
                'bg-zinc-100 text-zinc-700 hover:bg-zinc-100'
            )}
          >
            {scenario.status}
          </Badge>

          <div
            className="flex items-center gap-2 text-xs text-zinc-500 min-w-0"
            title={scenario.projectName || projectName || 'Unassigned Project'}
          >
            <span className="truncate">
              {scenario.projectName || projectName || 'Unassigned'}
            </span>
          </div>
        </div>

        {isFailed && scenario.error && (
          <div className="text-xs text-red-500 bg-red-50 p-2 rounded-md">
            {scenario.error}
          </div>
        )}
      </div>
    </div>
  );
};
