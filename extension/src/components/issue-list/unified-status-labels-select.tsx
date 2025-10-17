import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
import { Badge } from '@/src/components/ui/ui/badge';
import { Checkbox } from '@/src/components/ui/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/ui/popover';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import { ChevronRight } from 'lucide-react';

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border transition-all duration-200 ease-in-out"
      style={{ backgroundColor: color }}
    />
  );
}

type LabelItem = {
  id: number;
  name: string;
  color: string;
  text_color?: string;
};

interface UnifiedStatusLabelsSelectProps {
  selectedLabels?: string[];
  labels: LabelItem[];
  currentStatus: 'open' | 'closed';
  onChange: (vals: string[]) => void;
  portalContainer?: Element | null;
  isDirty?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  loading?: boolean;
}

const UnifiedStatusLabelsSelect: React.FC<UnifiedStatusLabelsSelectProps> = ({
  selectedLabels = [],
  labels,
  currentStatus,
  onChange,
  portalContainer,
  isDirty,
  onSave,
  onCancel,
  saving,
  loading,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const suppressNextOpenRef = React.useRef(false);

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Create status labels that aren't in the regular labels list
  const statusLabels: LabelItem[] = React.useMemo(
    () => [
      {
        id: -1,
        name: 'open',
        color: '#22c55e', // green-500
        text_color: '#ffffff',
      },
      {
        id: -2,
        name: 'closed',
        color: '#6b7280', // gray-500
        text_color: '#ffffff',
      },
    ],
    []
  );

  // Combine status labels with regular labels
  const allLabels = React.useMemo(() => {
    const regularLabels = labels.filter(
      l => l.name.toLowerCase() !== 'open' && l.name.toLowerCase() !== 'closed'
    );
    return [...statusLabels, ...regularLabels];
  }, [labels, statusLabels]);

  // Don't force current status - let selectedLabels control everything
  const effectiveSelectedLabels = React.useMemo(() => {
    return selectedLabels;
  }, [selectedLabels]);

  const visibleLabels = React.useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    const list = allLabels.filter(l =>
      !q ? true : String(l.name).toLowerCase().includes(q)
    );
    return list.slice(0, 20);
  }, [allLabels, query]);

  const toggleLabel = (name: string) => {
    const isStatusLabel =
      name.toLowerCase() === 'open' || name.toLowerCase() === 'closed';

    if (isStatusLabel) {
      // For status labels, toggle like regular labels but ensure only one status at a time
      const nonStatusLabels = effectiveSelectedLabels.filter(
        l => l.toLowerCase() !== 'open' && l.toLowerCase() !== 'closed'
      );

      if (effectiveSelectedLabels.includes(name)) {
        // Uncheck this status
        onChange(nonStatusLabels);
      } else {
        // Check this status (and uncheck any other status)
        onChange([...nonStatusLabels, name]);
      }
    } else {
      // For regular labels, toggle normally
      const next = effectiveSelectedLabels.includes(name)
        ? effectiveSelectedLabels.filter(l => l !== name)
        : [...effectiveSelectedLabels, name];
      onChange(next);
    }
  };

  const clearAll = () => {
    // Clear all labels including status
    onChange([]);
  };

  const selectedLabelItems = allLabels.filter(l =>
    effectiveSelectedLabels.includes(l.name)
  );

  const handleTriggerPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!open) return;
    event.preventDefault();
    suppressNextOpenRef.current = true;
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next && suppressNextOpenRef.current) {
      suppressNextOpenRef.current = false;
      return;
    }
    suppressNextOpenRef.current = false;
    setOpen(next);
  };
  const currentStatusLabel = statusLabels.find(l => l.name === currentStatus);

  return (
    <div onClick={handleStopPropagation} className="space-y-2">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-between w-1/2 h-8 px-3 rounded-xl border glass-input text-xs shadow-sm"
            onPointerDown={handleTriggerPointerDown}
          >
            {loading ? (
              <Skeleton className="h-4 w-24 rounded-full" />
            ) : (
              <div className="flex items-center gap-2">
                {currentStatusLabel && (
                  <>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: currentStatusLabel.color }}
                    />
                    <span className="font-medium capitalize">
                      {currentStatus}
                    </span>
                  </>
                )}
                {effectiveSelectedLabels.length > 1 && (
                  <span className="text-neutral-500">
                    +{effectiveSelectedLabels.length - 1}
                  </span>
                )}
              </div>
            )}
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                open && 'rotate-90'
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[280px] p-0"
          container={portalContainer || undefined}
          sideOffset={8}
          align="start"
        >
          {loading ? (
            <div className="p-3 space-y-3">
              <Skeleton className="h-6 w-full rounded-md" />
              <Skeleton className="h-6 w-[70%] rounded-md" />
              <Skeleton className="h-6 w-[85%] rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-full rounded-md" />
                <Skeleton className="h-7 w-full rounded-md" />
              </div>
            </div>
          ) : (
            <>
              <div className="p-2 border-b bg-neutral-50/30">
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search labels"
                  className="text-xs h-7 glass-input"
                />
                {selectedLabelItems.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {selectedLabelItems.map(l => {
                      const isStatusLabel =
                        l.name.toLowerCase() === 'open' ||
                        l.name.toLowerCase() === 'closed';
                      return (
                        <Badge
                          key={l.id}
                          variant="secondary"
                          className={cn(
                            'gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm transition-all duration-200 ease-in-out text-xs h-5 px-1.5 items-center',
                            isStatusLabel &&
                              'ring-1 ring-blue-200 bg-blue-50/60'
                          )}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full border transition-all duration-200 ease-in-out"
                            style={{ backgroundColor: l.color }}
                          />
                          <span
                            className={cn(
                              'leading-none',
                              isStatusLabel && 'capitalize'
                            )}
                          >
                            {l.name}
                          </span>
                          {!isStatusLabel && (
                            <button
                              onClick={() => toggleLabel(l.name)}
                              className="ml-0.5 h-3 w-3 rounded-full flex items-center justify-center transition-all duration-150 ease-in-out text-xs"
                              title={`Remove ${l.name}`}
                            >
                              ×
                            </button>
                          )}
                        </Badge>
                      );
                    })}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAll}
                      className="h-5 px-1.5 ml-0.5 text-xs glass-button"
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              <div className="max-h-[220px] overflow-auto px-1.5 py-1.5">
                <div className="py-0.5">
                  <div className="text-[10px] text-neutral-500 px-1.5 mb-1">
                    Status
                  </div>
                  <div className="grid">
                    {statusLabels.map(l => {
                      const checked = effectiveSelectedLabels.includes(l.name);
                      return (
                        <button
                          key={l.id}
                          onClick={() => toggleLabel(l.name)}
                          className={cn(
                            'group flex items-center gap-2 px-2 py-2 mb-1 text-left transition-all duration-200 ease-in-out'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            className="pointer-events-none transition-all duration-200 ease-in-out"
                          />
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full border transition-all duration-200 ease-in-out"
                            style={{ backgroundColor: l.color }}
                          />
                          <div className="flex-1">
                            <div className="text-xs leading-none capitalize">
                              {l.name}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {visibleLabels.filter(l => !statusLabels.includes(l)).length >
                  0 && (
                  <div className="py-0.5 border-t">
                    <div className="text-[10px] text-neutral-500 px-1.5 mb-1">
                      Labels
                    </div>
                    <div className="grid">
                      {visibleLabels
                        .filter(l => !statusLabels.includes(l))
                        .map(l => {
                          const checked = effectiveSelectedLabels.includes(
                            l.name
                          );
                          return (
                            <button
                              key={l.id}
                              onClick={() => toggleLabel(l.name)}
                              className={cn(
                                'group flex items-center gap-2 px-2 py-2 mb-1 text-left transition-all duration-200 ease-in-out'
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                className="pointer-events-none transition-all duration-200 ease-in-out"
                              />
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full border transition-all duration-200 ease-in-out"
                                style={{ backgroundColor: l.color }}
                              />
                              <div className="flex-1">
                                <div className="text-xs leading-none">
                                  {l.name}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {visibleLabels.length === 0 && (
                  <div className="text-xs text-neutral-500 px-1.5 py-2">
                    No options found
                  </div>
                )}
              </div>

              <div className="border-t bg-white p-2 flex flex-1 justify-between gap-1.5 items-center rounded-b-lg">
                <Button
                  variant="ghost"
                  className="glass-button text-xs flex-1 h-7"
                  onClick={e => {
                    e.stopPropagation();
                    onCancel?.();
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  className="text-xs flex-1 h-7"
                  onClick={async e => {
                    e.stopPropagation();
                    if (onSave) await onSave();
                    setOpen(false);
                  }}
                  disabled={!isDirty || !!saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Selected Labels Display */}
      {!loading && selectedLabelItems.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {selectedLabelItems.map(l => {
            const isStatusLabel =
              l.name.toLowerCase() === 'open' ||
              l.name.toLowerCase() === 'closed';
            return (
              <Badge
                key={l.id}
                variant="secondary"
                className={cn(
                  'gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm transition-all duration-200 ease-in-out items-center',
                  isStatusLabel && 'ring-1 ring-blue-200 bg-blue-50/60'
                )}
              >
                <Dot color={l.color} />
                <span
                  className={cn('leading-none', isStatusLabel && 'capitalize')}
                >
                  {l.name}
                </span>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UnifiedStatusLabelsSelect;
