import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  iconClassName = 'text-gray-300',
  titleClassName = 'text-gray-700',
  descriptionClassName = 'text-gray-400',
  className = '',
}) => {
  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center text-center ${className}`}
    >
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className={`w-8 h-8 ${iconClassName}`} />
      </div>
      <h3 className={`text-base font-semibold ${titleClassName}`}>{title}</h3>
      <p className={`text-sm mt-1 max-w-xs px-4 ${descriptionClassName}`}>
        {description}
      </p>
    </div>
  );
};
