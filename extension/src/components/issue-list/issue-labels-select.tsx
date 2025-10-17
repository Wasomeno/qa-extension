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
import { ChevronRight } from 'lucide-react';

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border"
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

interface IssueLabelsSelectProps {
  selectedLabels?: string[];
  labels: LabelItem[];
  onChange: (vals: string[]) => void;
  portalContainer?: Element | null;
  isDirty?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
}

const IssueLabelsSelect: React.FC<IssueLabelsSelectProps> = ({
  selectedLabels = [],
  labels,
  onChange,
  portalContainer,
  isDirty,
  onSave,
  onCancel,
  saving,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const suppressNextOpenRef = React.useRef(false);

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const visibleLabels = React.useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    const list = (labels || []).filter(l =>
      !q ? true : String(l.name).toLowerCase().includes(q)
    );
    return list.slice(0, 20);
  }, [labels, query]);

  const toggleLabel = (name: string) => {
    const next = selectedLabels.includes(name)
      ? selectedLabels.filter(l => l !== name)
      : [...selectedLabels, name];
    onChange(next);
  };

  const clearAll = () => onChange([]);

  const selectedLabelItems = labels.filter(l =>
    selectedLabels.includes(l.name)
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

  return (
    <div onClick={handleStopPropagation} className="space-y-2">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-between w-full h-8 px-3 rounded-xl border glass-input text-xs shadow-sm"
            onPointerDown={handleTriggerPointerDown}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {selectedLabels.length || 0} selected
              </span>
              <span className="text-neutral-500">{selectedLabels.length}</span>
            </div>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                open && 'rotate-90'
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[320px] p-0"
          container={portalContainer || undefined}
          sideOffset={8}
          align="start"
        >
          {/* Search and Selected Chips */}
          <div className="p-3 border-b bg-neutral-50/30">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search labels"
              className="text-xs h-8 glass-input"
            />
            {/* Selected chips */}
            {selectedLabelItems.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {selectedLabelItems.map(l => (
                  <Badge
                    key={l.id}
                    variant="secondary"
                    className="gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm items-center"
                  >
                    <Dot color={l.color} />
                    <span className="leading-none">{l.name}</span>
                    <button
                      onClick={() => toggleLabel(l.name)}
                      className="ml-1 h-4 w-4 rounded-full flex items-center justify-center"
                      title={`Remove ${l.name}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="px-2.5 py-1.5 ml-1 text-xs glass-button"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {/* Labels List */}
          <div className="max-h-[260px] overflow-auto px-2 py-2">
            <div className="py-1">
              <div className="text-[11px] text-neutral-500 px-2 mb-1">
                All labels
              </div>
              <div className="grid">
                {visibleLabels.length === 0 ? (
                  <div className="text-xs text-neutral-500 px-2 py-3">
                    No options found
                  </div>
                ) : (
                  visibleLabels.map(l => {
                    const checked = selectedLabels.includes(l.name);
                    return (
                      <button
                        key={l.id}
                        onClick={() => toggleLabel(l.name)}
                        className="group flex items-center gap-3 px-2 py-2 mb-1 rounded-lg text-left"
                      >
                        <Checkbox
                          checked={checked}
                          className="pointer-events-none"
                        />
                        <Dot color={l.color} />
                        <div className="flex-1">
                          <div className="text-sm leading-none">{l.name}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="border-t bg-white p-3 flex flex-1 gap-2 justify-between items-center">
            <Button
              variant="ghost"
              className="glass-button text-xs flex-1"
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
              className="glass-button text-xs flex-1"
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
        </PopoverContent>
      </Popover>

      {/* Selected Labels Display */}
      {selectedLabelItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedLabelItems.map(l => (
            <Badge
              key={l.id}
              variant="secondary"
              className="gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm items-center"
            >
              <Dot color={l.color} />
              <span className="leading-none">{l.name}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export default IssueLabelsSelect;
