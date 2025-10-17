import React from 'react';
import { cn } from '@/lib/utils';

interface IssueCardProps {
  title: React.ReactNode;
  projectName?: React.ReactNode;
  number?: React.ReactNode;
  statusControl?: React.ReactNode;
  metaLeft?: React.ReactNode;
  actionRight?: React.ReactNode;
  labelsSection?: React.ReactNode;
  labelsStatic?: React.ReactNode; // Static labels shown when not hovered
  onClick?: () => void;
  as?: 'button' | 'div';
  className?: string;
  'aria-label'?: string;
}

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  projectName,
  number,
  statusControl,
  metaLeft,
  actionRight,
  labelsSection,
  labelsStatic,
  onClick,
  as = 'button',
  className,
  'aria-label': ariaLabel,
}) => {
  const Wrapper: any = as;
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      className={cn(
        'group glass-card overflow-hidden shadow-none w-full text-left rounded-md border border-gray-200',
        className
      )}
    >
      <Wrapper
        type={as === 'button' ? 'button' : undefined}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="px-4 py-3 w-full"
        aria-label={ariaLabel}
      >
        <div className="flex flex-col gap-2 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="truncate max-w-[260px] text-[13px] font-semibold text-black hover:text-blue-600">
                    {title}
                  </div>
                </div>
                {projectName ? (
                  <div className="mt-0.5 text-[12px] text-black/70 truncate">
                    {projectName}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {number != null ? (
                <div className="text-[12px] text-black/70">#{number}</div>
              ) : null}
              {statusControl}
            </div>
          </div>
          {(metaLeft || actionRight) && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] text-black/70 truncate">{metaLeft}</div>
              <div
                className={cn(
                  'flex items-center gap-1.5 transition-all duration-200 ease-out',
                  isHovered ? 'opacity-100' : 'opacity-0'
                )}
              >
                {actionRight}
              </div>
            </div>
          )}

          {labelsSection || labelsStatic ? <div className="h-1" /> : null}

          {labelsSection || labelsStatic ? (
            <div className="space-y-1" onClick={e => e.stopPropagation()}>
              <div className="text-[11px] font-medium text-black/70">Labels</div>
              <div className="relative">
                <div
                  className={cn(
                    'transition-all duration-200 ease-out',
                    isHovered
                      ? 'opacity-100 relative z-10'
                      : 'opacity-0 pointer-events-none absolute inset-0 z-0'
                  )}
                >
                  {labelsSection}
                </div>
                {labelsStatic && (
                  <div
                    className={cn(
                      'transition-all duration-200 ease-out',
                      isHovered
                        ? 'opacity-0 pointer-events-none absolute inset-0 z-0'
                        : 'opacity-100 relative z-10'
                    )}
                  >
                    {labelsStatic}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Wrapper>
    </div>
  );
};

export default IssueCard;
