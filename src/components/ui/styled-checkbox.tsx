import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StyledCheckboxProps {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StyledCheckbox: React.FC<StyledCheckboxProps> = ({
  checked,
  onChange,
  className,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };

  return (
    <label className={cn('relative cursor-pointer', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <motion.div
        className={cn(
          'flex items-center justify-center rounded-md border-2 transition-all duration-200',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-zinc-900',
          sizeClasses[size],
          checked
            ? 'bg-zinc-900 border-zinc-900 shadow-md'
            : 'bg-white border-zinc-300 hover:border-zinc-400'
        )}
        whileTap={{ scale: 0.9 }}
        animate={checked ? { scale: [1, 1.1, 1] } : { scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <AnimatePresence mode="wait">
          {checked && (
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, rotate: 45 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Check
                className={cn(
                  'text-white',
                  iconSizes[size],
                  'stroke-[3]'
                )}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </label>
  );
};

interface SelectAllCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}

export const SelectAllCheckbox: React.FC<SelectAllCheckboxProps> = ({
  checked,
  indeterminate,
  onChange,
  label,
}) => {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
      <StyledCheckbox checked={checked} onChange={onChange} size="md" />
      <span className="text-sm text-zinc-600 group-hover:text-zinc-900 transition-colors">
        {label}
      </span>
    </label>
  );
};
