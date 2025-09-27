import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/src/components/ui/ui/button';
import { RadioGroup, RadioGroupItem } from '@/src/components/ui/ui/radio-group';
import { Textarea } from '@/src/components/ui/ui/textarea';
import { Label } from '@/src/components/ui/ui/label';
import { Badge } from '@/src/components/ui/ui/badge';
import { Alert } from '@/src/components/ui/ui/alert';
import { PlusCircle, X as XIcon, ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import useMeasure from 'react-use-measure';
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
  // Evidence mode layout switching
  isInEvidenceMode?: boolean;
  onToggleEvidenceMode?: () => void;
  onExitEvidenceMode?: () => void;
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
  // Evidence mode layout switching
  isInEvidenceMode = false,
  onToggleEvidenceMode,
  onExitEvidenceMode,
}) => {
  const Wrapper: any = as;
  const [isHovered, setIsHovered] = React.useState(false);
  const [ref, bounds] = useMeasure();
  const [direction, setDirection] = React.useState<number>(0);
  // Use isInEvidenceMode prop instead of internal addingEvidence state
  const addingEvidence = isInEvidenceMode;
  const [evidenceStatus, setEvidenceStatus] = React.useState<
    'passed' | 'not_passed'
  >(evidenceDefaultStatus);
  const [message, setMessage] = React.useState('');
  const messageRef = React.useRef<HTMLTextAreaElement>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pastingImage, setPastingImage] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const canAddEvidence = !!(
    evidenceEnabled &&
    evidenceProjectId &&
    typeof evidenceIid === 'number'
  );

  const handleToggleEvidence = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canAddEvidence || !onToggleEvidenceMode) return;
    setDirection(1); // Slide from right when entering evidence mode
    onToggleEvidenceMode();
  };

  const handleExitEvidence = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onExitEvidenceMode) return;
    setDirection(-1); // Slide to left when exiting evidence mode
    onExitEvidenceMode();
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
    // Exit evidence mode through the parent component
    if (onExitEvidenceMode) {
      setDirection(-1); // Slide to left when exiting
      onExitEvidenceMode();
    }
    setEvidenceStatus(evidenceDefaultStatus);
    setMessage('');
    setSubmitting(false);
    setError(null);
    setSuccessMessage(null);
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
      
      // Show success message
      const statusText = evidenceStatus === 'passed' ? 'Passed' : 'Not Passed';
      setSuccessMessage(`Evidence submitted successfully (${statusText})`);
      setSubmitting(false);
      
      // Auto-hide success message and reset state after 2 seconds
      setTimeout(() => {
        resetEvidenceState();
      }, 2000);
    } catch (err) {
      console.error('Add evidence failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to add evidence');
      setSubmitting(false);
    }
  };
  // Animation variants for sliding transitions
  const variants = {
    initial: (direction: number) => {
      return { x: `${110 * direction}%`, opacity: 0 };
    },
    active: { x: "0%", opacity: 1 },
    exit: (direction: number) => {
      return { x: `${-110 * direction}%`, opacity: 0 };
    },
  };

  // Create content for both layouts
  const normalContent = (
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
              isHovered ? 'opacity-100' : 'opacity-0'
            )}
          >
            {actionRight}
            {canAddEvidence && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 glass-button text-[12px]"
                onClick={handleToggleEvidence}
                title="Add Evidence"
              >
                <PlusCircle className="w-4 h-4" />
              </Button>
            )}
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
  );

  const evidenceContent = (
    <div className="flex flex-col items-center text-center py-2">
      {/* Header with back button */}
      <div className="w-full flex items-center justify-between mb-4">
        <div className="flex-1" />
        <div className="flex-1 text-center">
          <div className="text-[14px] font-semibold text-black truncate">
            Adding Evidence: {title}
          </div>
          <div className="text-[12px] text-black/60 truncate">
            {projectName} #{number}
          </div>
        </div>
        <div className="flex-1 flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExitEvidence}
            title="Back to issue"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Evidence form */}
      <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        {error && (
          <Alert variant="destructive" className="mb-3">
            <div className="text-sm">{error}</div>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-3 bg-green-50 border-green-200 text-green-800">
            <div className="text-xs flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center">
                <span className="text-white text-[8px] leading-none">✓</span>
              </div>
              {successMessage}
            </div>
          </Alert>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <Label className="text-[13px] font-medium text-black/80 block mb-3">Result</Label>
            <RadioGroup
              className="flex items-center justify-center gap-3"
              value={evidenceStatus}
              onValueChange={(v: any) => setEvidenceStatus(v)}
              disabled={!!successMessage}
            >
              <div
                className={cn(
                  'rounded-lg border border-neutral-200 px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors min-w-[100px]',
                  evidenceStatus === 'passed'
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'hover:bg-gray-50'
                )}
              >
                <RadioGroupItem
                  id="ev-pass"
                  value="passed"
                  className={cn(
                    'w-5 h-5',
                    evidenceStatus === 'passed'
                      ? 'border-emerald-500 text-emerald-500'
                      : 'border-neutral-300 text-neutral-400'
                  )}
                />
                <Label
                  htmlFor="ev-pass"
                  className={cn(
                    'text-[12px] cursor-pointer font-medium',
                    evidenceStatus === 'passed'
                      ? 'text-emerald-600'
                      : 'text-gray-700'
                  )}
                >
                  Passed
                </Label>
              </div>
              <div
                className={cn(
                  'rounded-lg border border-neutral-200 px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors min-w-[100px]',
                  evidenceStatus === 'not_passed'
                    ? 'bg-rose-50 border-rose-300'
                    : 'hover:bg-gray-50'
                )}
              >
                <RadioGroupItem
                  id="ev-npass"
                  value="not_passed"
                  className={cn(
                    'w-5 h-5',
                    evidenceStatus === 'not_passed'
                      ? 'border-rose-500 text-rose-500'
                      : 'border-neutral-300 text-neutral-400'
                  )}
                />
                <Label
                  htmlFor="ev-npass"
                  className={cn(
                    'text-[12px] cursor-pointer font-medium',
                    evidenceStatus === 'not_passed'
                      ? 'text-rose-600'
                      : 'text-gray-700'
                  )}
                >
                  Not passed
                </Label>
              </div>
            </RadioGroup>
          </div>
          
          <div>
            <Label className="text-[13px] font-medium text-black/80 block mb-2">Message</Label>
            {pastingImage && (
              <Badge variant="secondary" className="mb-2 w-fit">
                Pasting images…
              </Badge>
            )}
            <Textarea
              className="h-24 resize-none text-[12px] glass-input"
              placeholder="Add a short note or paste a link"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onClick={e => e.stopPropagation()}
              ref={messageRef}
              disabled={!!successMessage}
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

          <div className="flex items-center gap-3 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-[12px] flex-1 min-w-[100px]"
              onClick={handleExitEvidence}
              disabled={submitting || pastingImage || !!successMessage}
            >
              {successMessage ? 'Close' : 'Cancel'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-[12px] flex-1 min-w-[100px]"
              onClick={handleSubmitEvidence}
              disabled={submitting || pastingImage || !!successMessage}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <MotionConfig transition={{ duration: 0.2, type: "spring", bounce: 0 }}>
      <motion.div
        animate={{ height: bounds.height }}
        className={cn(
          'group glass-card shadow-none w-full text-left rounded-md border border-gray-200',
          isInEvidenceMode ? 'bg-blue-50/30' : '',
          className
        )}
        style={{
          // Performance optimizations for smooth animations
          willChange: bounds.height > 0 ? 'height' : 'auto',
        }}
      >
        <Wrapper
          type={as === 'button' ? 'button' : undefined}
          onClick={isInEvidenceMode ? undefined : onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="px-4 py-3 w-full"
          aria-label={isInEvidenceMode ? `Adding evidence for ${title}` : ariaLabel}
        >
          <div ref={ref}>
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={isInEvidenceMode ? 'evidence' : 'normal'}
                variants={variants}
                initial="initial"
                animate="active"
                exit="exit"
                custom={direction}
                style={{
                  // Optimize for transform animations
                  willChange: 'transform, opacity',
                }}
              >
                {isInEvidenceMode ? evidenceContent : normalContent}
              </motion.div>
            </AnimatePresence>
          </div>
        </Wrapper>
      </motion.div>
    </MotionConfig>
  );


};

export default IssueCard;
