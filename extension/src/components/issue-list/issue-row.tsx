import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { Badge } from '@/src/components/ui/ui/badge';
import { AiFillStar } from 'react-icons/ai';
import { FiStar } from 'react-icons/fi';
import IssueStatusSelect from '@/components/issue-list/issue-status-select';
import IssueLabelsSelect from '@/components/issue-list/issue-labels-select';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import IssueCard from '@/components/common/IssueCard';
import AvatarGroup from '@/components/issue-list/AvatarGroup';

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: color }} />;
}

dayjs.extend(relativeTime);

type LabelItem = {
  id: number;
  name: string;
  color: string;
  text_color?: string;
};

interface IssueRowProps {
  item: any;
  pinned: boolean;
  pinDisabled: boolean;
  onTogglePin: (item: any) => void;
  onOpen: (item: any) => void;
  projectLabelPalette?: Map<string, LabelItem>;
  selectedLabels?: string[];
  onChangeLabels: (vals: string[]) => Promise<void> | void; // Called on Save
  onChangeState: (val: 'open' | 'closed') => void;
  portalContainer?: Element | null;
}

const IssueRow: React.FC<IssueRowProps> = ({
  item,
  pinned,
  pinDisabled,
  onTogglePin,
  onOpen,
  projectLabelPalette,
  selectedLabels,
  onChangeLabels,
  onChangeState,
  portalContainer,
}) => {
  const [localLabels, setLocalLabels] = React.useState<string[]>(
    Array.isArray(selectedLabels) ? selectedLabels : []
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setLocalLabels(Array.isArray(selectedLabels) ? selectedLabels : []);
  }, [selectedLabels]);

  const isDirty = React.useMemo(() => {
    const a = Array.isArray(selectedLabels) ? selectedLabels : [];
    const b = Array.isArray(localLabels) ? localLabels : [];
    if (a.length !== b.length) return true;
    const sa = [...a].sort().join('\n');
    const sb = [...b].sort().join('\n');
    return sa !== sb;
  }, [selectedLabels, localLabels]);

  const handleOpenClick = () => onOpen(item);
  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin(item);
  };

  const isClosed = (item as any)?.state === 'closed';
  const statusValue: 'open' | 'closed' = isClosed ? 'closed' : 'open';

  const handleStatusChange = (val: 'open' | 'closed') => {
    onChangeState(val);
  };

  const labelsArray: LabelItem[] = projectLabelPalette
    ? Array.from(projectLabelPalette.values())
    : [];

  const openedAgo = item.createdAt ? dayjs(item.createdAt).fromNow() : '';

  // Extract assignees for display
  const anyItem: any = item as any;
  const assignees = Array.isArray(anyItem.assignees)
    ? anyItem.assignees
    : item.assignee
      ? [item.assignee]
      : [];

  // Create static labels for non-hover state
  const selectedLabelItems = labelsArray.filter(l => localLabels.includes(l.name));
  const staticLabels = selectedLabelItems.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {selectedLabelItems.map((l) => (
        <Badge key={l.id} variant="secondary" className="gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm">
          <Dot color={l.color} />
          <span>{l.name}</span>
        </Badge>
      ))}
    </div>
  ) : null;

  return (
    <IssueCard
      onClick={handleOpenClick}
      aria-label={`Open issue ${item.title}`}
      title={item.title}
      projectName={item.project?.name ?? 'Project'}
      number={item.number ?? '—'}
      evidenceEnabled
      evidenceProjectId={item.project?.id}
      evidenceIid={item.number}
      statusControl={
        <IssueStatusSelect
          value={statusValue}
          onChange={handleStatusChange}
          portalContainer={portalContainer}
        />
      }
      metaLeft={
        <div className="flex items-center gap-2">
          <div className="text-[12px] text-black/70 truncate">
            {openedAgo ? <span>Opened {openedAgo}</span> : null}
            {item.author?.name ? (
              <>
                <span className="mx-1">•</span>
                <span>by {item.author.name}</span>
              </>
            ) : null}
          </div>
          {assignees.length > 0 && (
            <>
              <span className="text-black/70 mx-1">•</span>
              <AvatarGroup users={assignees as any} size={20} />
            </>
          )}
        </div>
      }
      actionRight={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 glass-button"
          title={
            pinned ? 'Unpin' : pinDisabled ? 'Pinned limit reached' : 'Pin'
          }
          onClick={handlePinClick}
          disabled={!pinned && pinDisabled}
        >
          {pinned ? (
            <AiFillStar className="w-4 h-4 text-amber-500" />
          ) : (
            <FiStar className="w-4 h-4 text-gray-400" />
          )}
        </Button>
      }
      labelsSection={
        <IssueLabelsSelect
          selectedLabels={localLabels}
          labels={labelsArray}
          onChange={vals => setLocalLabels(vals)}
          portalContainer={portalContainer}
          isDirty={isDirty}
          saving={saving}
          onSave={async () => {
            try {
              setSaving(true);
              await onChangeLabels(localLabels);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() =>
            setLocalLabels(
              Array.isArray(selectedLabels) ? selectedLabels : []
            )
          }
        />
      }
      labelsStatic={staticLabels}
    />
  );
};

export default IssueRow;
