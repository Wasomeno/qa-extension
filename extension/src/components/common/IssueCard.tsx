import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/src/components/ui/ui/button';
import { RadioGroup, RadioGroupItem } from '@/src/components/ui/ui/radio-group';
import { Textarea } from '@/src/components/ui/ui/textarea';
import { Label } from '@/src/components/ui/ui/label';
import { Badge } from '@/src/components/ui/ui/badge';
import { Alert } from '@/src/components/ui/ui/alert';
import { PlusCircle, X as XIcon } from 'lucide-react';
import api from '@/services/api';

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
  // Evidence feature (GitLab notes)
  evidenceEnabled?: boolean;
  evidenceProjectId?: string | number;
  evidenceIid?: number;
  evidenceDefaultStatus?: 'passed' | 'not_passed';
  onEvidenceAdded?: (note: any) => void;
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
  evidenceEnabled,
  evidenceProjectId,
  evidenceIid,
  evidenceDefaultStatus = 'passed',
  onEvidenceAdded,
}) => {
  const Wrapper: any = as;
  const [isHovered, setIsHovered] = React.useState(false);
  const [addingEvidence, setAddingEvidence] = React.useState(false);
  const [evidenceStatus, setEvidenceStatus] = React.useState<
    'passed' | 'not_passed'
  >(evidenceDefaultStatus);
  const [message, setMessage] = React.useState('');
  const messageRef = React.useRef<HTMLTextAreaElement>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pastingImage, setPastingImage] = React.useState(false);
  const canAddEvidence = !!(
    evidenceEnabled &&
    evidenceProjectId &&
    typeof evidenceIid === 'number'
  );

  const handleToggleEvidence = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canAddEvidence) return;
    setAddingEvidence(v => !v);
  };

  const insertImageMarkdownAtCursor = (url: string) => {
    const el = messageRef.current;
    const v = el?.value ?? message;
    const start = el?.selectionStart ?? v.length;
    const end = el?.selectionEnd ?? start;
    const before = v.slice(0, start);
    const after = v.slice(end);
    const insertion =
      (before.endsWith('\n') ? '' : '\n') + `![pasted-image](${url})` + '\n';
    const newText = before + insertion + after;
    setMessage(newText);
    setTimeout(() => {
      try {
        el?.focus();
        const pos = before.length + insertion.length;
        el?.setSelectionRange(pos, pos);
      } catch {}
    }, 0);
  };

  const resetEvidenceState = () => {
    setAddingEvidence(false);
    setEvidenceStatus(evidenceDefaultStatus);
    setMessage('');
    setSubmitting(false);
    setError(null);
  };

  const composeBody = (imageUrl?: string) => {
    const prefix =
      evidenceStatus === 'passed'
        ? '✅ Evidence (Passed):'
        : '❌ Evidence (Not Passed):';
    let body = `${prefix} ${message || ''}`.trim();
    if (imageUrl) body += `\n\n![evidence](${imageUrl})`;
    return body;
  };

  const handleSubmitEvidence = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canAddEvidence || submitting) return;
    setSubmitting(true);
    try {
      setError(null);
      const body = composeBody(undefined);
      const resp = await api.addGitLabIssueNote(
        evidenceProjectId as any,
        evidenceIid as number,
        body
      );
      if (!resp.success) throw new Error(resp.error || 'Failed to add note');
      if (onEvidenceAdded)
        onEvidenceAdded((resp as any).data?.note || resp.data);
      resetEvidenceState();
    } catch (err) {
      console.error('Add evidence failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to add evidence');
      setSubmitting(false);
    }
  };
  return (
    <Wrapper
      type={as === 'button' ? 'button' : undefined}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group glass-card shadow-none w-full text-left rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50/25',
        className
      )}
      aria-label={ariaLabel}
    >
      <div className="flex flex-col gap-2">
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
                isHovered || addingEvidence ? 'opacity-100' : 'opacity-0'
              )}
            >
              {actionRight}
              {canAddEvidence && !addingEvidence ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 glass-button text-[12px]"
                  onClick={handleToggleEvidence}
                  title="Add Evidence"
                >
                  <PlusCircle className="w-4 h-4" />
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {labelsSection || labelsStatic ? <div className="h-1" /> : null}

        {labelsSection || labelsStatic ? (
          <div className="space-y-1" onClick={e => e.stopPropagation()}>
            <div className="text-[11px] font-medium text-black/70">Labels</div>
            {/* Container for both interactive and static labels */}
            <div className="relative">
              {/* Interactive labels - shown on hover */}
              <div
                className={cn(
                  'transition-all duration-200 ease-out',
                  isHovered || addingEvidence
                    ? 'opacity-100 relative z-10'
                    : 'opacity-0 pointer-events-none absolute inset-0 z-0'
                )}
              >
                {labelsSection}
              </div>
              {/* Static labels - shown when not hovered */}
              {labelsStatic && (
                <div
                  className={cn(
                    'transition-all duration-200 ease-out',
                    isHovered || addingEvidence
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
        {canAddEvidence && addingEvidence ? (
          <div
            className="mt-2 border-t border-gray-200 bg-white/70 py-2"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-[12px] font-medium text-black/80">
                <span>Add Evidence</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleToggleEvidence}
                title="Close"
              >
                <XIcon className="w-4 h-4" />
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-3">
                <div className="text-sm">{error}</div>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <div>
                <Label className="text-[11px] text-black/70">Result</Label>
                <RadioGroup
                  className="mt-1 flex items-center gap-2"
                  value={evidenceStatus}
                  onValueChange={(v: any) => setEvidenceStatus(v)}
                >
                  <div
                    className={cn(
                      'rounded-md border border-neutral-200 px-2 py-1 text-sm flex items-center gap-1.5 cursor-pointer transition-colors',
                      evidenceStatus === 'passed'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <RadioGroupItem
                      id="ev-pass"
                      value="passed"
                      className={cn(
                        evidenceStatus === 'passed'
                          ? 'border-emerald-500 text-emerald-500'
                          : 'border-neutral-300 text-neutral-400'
                      )}
                    />
                    <Label
                      htmlFor="ev-pass"
                      className={cn(
                        'text-[10px] cursor-pointer',
                        evidenceStatus === 'passed'
                          ? 'text-emerald-600 font-medium'
                          : 'text-gray-700'
                      )}
                    >
                      Passed
                    </Label>
                  </div>
                  <div
                    className={cn(
                      'rounded-md border border-neutral-200 px-2 py-1 text-sm flex items-center gap-1.5 cursor-pointer transition-colors',
                      evidenceStatus === 'not_passed'
                        ? 'bg-rose-50 border-rose-200'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <RadioGroupItem
                      id="ev-npass"
                      value="not_passed"
                      className={cn(
                        evidenceStatus === 'not_passed'
                          ? 'border-rose-500 text-rose-500'
                          : 'border-neutral-300 text-neutral-400'
                      )}
                    />
                    <Label
                      htmlFor="ev-npass"
                      className={cn(
                        'text-[10px] cursor-pointer',
                        evidenceStatus === 'not_passed'
                          ? 'text-rose-600 font-medium'
                          : 'text-gray-700'
                      )}
                    >
                      Not passed
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-[11px] text-black/70">Message</Label>
                </div>
                {pastingImage && (
                  <Badge variant="secondary" className="mb-2 w-fit">
                    Pasting images…
                  </Badge>
                )}
                <Textarea
                  className="mt-1 h-16 resize-none text-[12px] glass-input"
                  placeholder="Add a short note or paste a link"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  ref={messageRef}
                  onPaste={async e => {
                    try {
                      const cd = e.clipboardData;
                      if (!cd) return;
                      const files: File[] = [];
                      if (cd.items && cd.items.length) {
                        for (const item of Array.from(cd.items)) {
                          if (item.kind === 'file') {
                            const f = item.getAsFile();
                            if (f && f.type && f.type.startsWith('image/'))
                              files.push(f);
                          }
                        }
                      }
                      if (
                        !files.length &&
                        (cd as any).files &&
                        (cd as any).files.length
                      ) {
                        for (const f of Array.from(
                          (cd as any).files as FileList
                        )) {
                          if (f.type && f.type.startsWith('image/'))
                            files.push(f);
                        }
                      }
                      if (!files.length) return; // allow normal paste
                      e.preventDefault();
                      setPastingImage(true);
                      setError(null);
                      for (const file of files) {
                        const resp = await api.uploadFile(file, 'attachment');
                        if (resp.success && resp.data?.url) {
                          insertImageMarkdownAtCursor(resp.data.url);
                        } else {
                          setError(resp.error || 'Image upload failed');
                        }
                      }
                    } catch (err: any) {
                      setError(err?.message || 'Image upload failed');
                    } finally {
                      setPastingImage(false);
                    }
                  }}
                />
              </div>

              <div className="flex items-center flex-1 justify-between">
                <div className="flex flex-1 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[12px] flex-1"
                    onClick={handleToggleEvidence}
                    disabled={submitting || pastingImage}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[12px] flex-1"
                    onClick={handleSubmitEvidence}
                    disabled={submitting || pastingImage}
                  >
                    {submitting ? 'Submitting…' : 'Submit'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Wrapper>
  );
};

export default IssueCard;
