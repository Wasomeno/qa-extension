import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { Badge } from '@/src/components/ui/ui/badge';
import { AiFillStar } from 'react-icons/ai';
import { FiStar, FiExternalLink } from 'react-icons/fi';
import UnifiedStatusLabelsSelect from '@/components/issue-list/unified-status-labels-select';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import IssueCard from '@/components/common/IssueCard';
import AvatarGroup from '@/components/issue-list/AvatarGroup';
import { PinnedIssueSnapshot } from '@/services/storage';

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

interface PinnedIssueRowProps {
  issue: PinnedIssueSnapshot;
  pinned: boolean;
  pinDisabled: boolean;
  onTogglePin: (issue: PinnedIssueSnapshot) => void;
  onOpen: (issue: PinnedIssueSnapshot) => void;
  projectLabelPalette?: Map<string, LabelItem>;
  selectedLabels?: string[];
  onChangeLabels: (vals: string[]) => Promise<void> | void;
  onChangeState: (val: 'open' | 'closed') => void;
  portalContainer?: Element | null;
  labelsLoading?: boolean;
  // Evidence mode props
  isInEvidenceMode?: boolean;
  onToggleEvidenceMode?: () => void;
  onExitEvidenceMode?: () => void;
}

const PinnedIssueRow: React.FC<PinnedIssueRowProps> = ({
  issue,
  pinned,
  pinDisabled,
  onTogglePin,
  onOpen,
  projectLabelPalette,
  selectedLabels,
  onChangeLabels,
  onChangeState,
  portalContainer,
  labelsLoading = false,
  // Evidence mode props
  isInEvidenceMode = false,
  onToggleEvidenceMode,
  onExitEvidenceMode,
}) => {
  const isClosed = (issue as any)?.state === 'closed';
  const statusValue: 'open' | 'closed' = isClosed ? 'closed' : 'open';

  const [localLabels, setLocalLabels] = React.useState<string[]>(
    Array.isArray(selectedLabels) ? [...selectedLabels, statusValue] : [statusValue]
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const baseLabels = Array.isArray(selectedLabels) ? selectedLabels : [];
    setLocalLabels([...baseLabels, statusValue]);
  }, [selectedLabels, statusValue]);

  const isDirty = React.useMemo(() => {
    const a = Array.isArray(selectedLabels) ? [...selectedLabels, statusValue] : [statusValue];
    const b = Array.isArray(localLabels) ? localLabels : [];
    if (a.length !== b.length) return true;
    const sa = [...a].sort().join('\n');
    const sb = [...b].sort().join('\n');
    return sa !== sb;
  }, [selectedLabels, localLabels, statusValue]);

  const handleOpenClick = () => onOpen(issue);
  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin(issue);
  };

  const handleGitLabClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // GitLab API returns web_url field directly
    const webUrl = (issue as any)?.webUrl || (issue as any)?.web_url;
    
    if (webUrl) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    } else {
      console.warn('No web_url found for pinned issue:', issue);
    }
  };

  const handleUnifiedChange = (vals: string[]) => {
    setLocalLabels(vals);
  };

  const labelsArray: LabelItem[] = projectLabelPalette
    ? Array.from(projectLabelPalette.values())
    : [];

  const openedAgo = issue.createdAt ? dayjs(issue.createdAt).fromNow() : '';

  // Extract assignees for display
  const anyIssue: any = issue as any;
  const assignees = Array.isArray(anyIssue.assignees)
    ? anyIssue.assignees
    : issue.assignee
      ? [issue.assignee]
      : [];

  // Create static labels for non-hover state (including status)
  const statusBadge = (
    <Badge
      key="status"
      variant="secondary"
      className="gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm ring-1 ring-blue-200 bg-blue-50/60"
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{
          backgroundColor: statusValue === 'closed' ? '#6b7280' : '#22c55e'
        }}
      />
      <span className="capitalize">{statusValue}</span>
    </Badge>
  );

  const regularLabelItems = labelsArray.filter(l =>
    localLabels.includes(l.name) &&
    l.name.toLowerCase() !== 'open' &&
    l.name.toLowerCase() !== 'closed'
  );

  const staticLabels = (
    <div className="flex flex-wrap gap-2">
      {statusBadge}
      {regularLabelItems.map((l) => (
        <Badge key={l.id} variant="secondary" className="gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm">
          <Dot color={l.color} />
          <span className="leading-none">{l.name}</span>
        </Badge>
      ))}
    </div>
  );

  return (
    <IssueCard
      onClick={handleOpenClick}
      aria-label={`Open pinned issue ${issue.title}`}
      title={issue.title}
      projectName={issue.project?.name ?? 'Project'}
      number={issue.number ?? '—'}
      evidenceEnabled
      evidenceProjectId={issue.project?.id}
      evidenceIid={issue.number as number}
      statusControl={null}
      metaLeft={
        <div className="flex items-center gap-2">
          <div className="text-[12px] text-black/70 truncate">
            {openedAgo ? <span>Opened {openedAgo}</span> : null}
            {issue.author?.name ? (
              <>
                <span className="mx-1">•</span>
                <span>by {issue.author.name}</span>
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
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 glass-button"
            title="Open in GitLab"
            onClick={handleGitLabClick}
          >
            <FiExternalLink className="w-4 h-4 text-gray-400 hover:text-blue-500" />
          </Button>
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
        </>
      }
      labelsSection={
        <UnifiedStatusLabelsSelect
          selectedLabels={localLabels}
          labels={labelsArray}
          currentStatus={statusValue}
          onChange={handleUnifiedChange}
          portalContainer={portalContainer}
          isDirty={isDirty}
          saving={saving}
          loading={labelsLoading}
          onSave={async () => {
            try {
              setSaving(true);

              // Check if status changed
              const hasOpenLabel = localLabels.some(label => label.toLowerCase() === 'open');
              const hasClosedLabel = localLabels.some(label => label.toLowerCase() === 'closed');
              const newStatus = hasClosedLabel ? 'closed' : 'open';

              if (newStatus !== statusValue) {
                onChangeState(newStatus);
              }

              // Update labels (excluding status labels for the API)
              const regularLabels = localLabels.filter(label =>
                label.toLowerCase() !== 'open' && label.toLowerCase() !== 'closed'
              );
              await onChangeLabels(regularLabels);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => {
            const baseLabels = Array.isArray(selectedLabels) ? selectedLabels : [];
            setLocalLabels([...baseLabels, statusValue]);
          }}
        />
      }
      labelsStatic={staticLabels}
      // Evidence mode props
      isInEvidenceMode={isInEvidenceMode}
      onToggleEvidenceMode={onToggleEvidenceMode}
      onExitEvidenceMode={onExitEvidenceMode}
    />
  );
};

export default PinnedIssueRow;
