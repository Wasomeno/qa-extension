import React from 'react';
import { AgentActivity as IAgentActivity } from './chat-message';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Terminal,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AgentActivityProps {
  activity: IAgentActivity;
}

export const AgentActivity: React.FC<AgentActivityProps> = ({ activity }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasResult = !!activity.result;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="group mt-2 mb-1"
    >
      <div
        onClick={() => hasResult && setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl border bg-muted/30 transition-all duration-200',
          hasResult ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'
        )}
      >
        <div className="flex-shrink-0">
          {activity.status === 'running' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : activity.status === 'completed' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Terminal className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium truncate">{activity.tool}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {activity.status}
          </span>
        </div>

        {hasResult && (
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
          </motion.div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && activity.result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="overflow-hidden"
          >
            <div className="mt-1 ml-4 p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-dashed text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
              {JSON.stringify(activity.result, null, 2)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
