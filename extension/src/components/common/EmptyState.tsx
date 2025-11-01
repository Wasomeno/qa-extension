import React from 'react';
import { FaBoxOpen } from 'react-icons/fa6';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = ({
  title = 'No data yet',
  description = "When there's data to show, it will appear here.",
  action,
}: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-700/70 dark:bg-slate-900/30 h-full w-full">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        <FaBoxOpen className="text-neutral-400 text-[20px]" />
      </div>
      <h2 className="text-sm text-neutral-500 dark:text-slate-50">{title}</h2>
      <p className="mt-2 max-w-sm text-xs text-neutral-400 dark:text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
};

export default EmptyState;
