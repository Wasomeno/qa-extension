import React from 'react';
import { Badge } from '@/src/components/ui/ui/badge';
import AvatarGroup from '@/components/issue-list/AvatarGroup';
import api, { IssueListItem, GitLabIssueDetail } from '@/services/api';
import { Checkbox } from '@/src/components/ui/ui/checkbox';

interface IssueDetailProps {
  issue: IssueListItem | any;
}

const IssueDetail: React.FC<IssueDetailProps> = ({ issue }) => {
  const assignees = Array.isArray((issue as any).assignees)
    ? (issue as any).assignees
    : issue.assignee
      ? [issue.assignee]
      : [];

  const projectId = issue?.project?.id;
  const iid = issue?.number;

  const [detail, setDetail] = React.useState<GitLabIssueDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [checklist, setChecklist] = React.useState<
    { text: string; checked: boolean; raw: string; line: number }[]
  >([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!projectId || !iid) return;
      setLoading(true);
      setError(null);
      const [dRes, cRes] = await Promise.all([
        api.getGitLabIssue(projectId, iid),
        api.getGitLabIssueChecklist(projectId, iid),
      ]);
      if (!mounted) return;
      if (dRes.success && dRes.data) setDetail(dRes.data);
      if (cRes.success && cRes.data) setChecklist(cRes.data.items || []);
      if (!dRes.success && !cRes.success)
        setError(dRes.error || cRes.error || 'Failed to load issue details');
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [projectId, iid]);

  const rawDesc = detail?.description ?? issue.description;
  // If the description contains any markdown task checkbox, hide the whole description
  const effectiveDesc = React.useMemo(() => {
    if (!rawDesc) return rawDesc;
    const checkboxLine = /^(\s*(?:[-*+]|\d+[.)])?\s*)\[( |x|X)\]\s+/m;
    return checkboxLine.test(String(rawDesc)) ? '' : String(rawDesc);
  }, [rawDesc]);

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-gray-900 leading-snug">
          {detail?.title || issue.title}
        </div>
        <div className="text-[11px] text-gray-500">
          #{iid ?? '—'} · {issue.project?.name ?? 'Unknown project'} · by{' '}
          {issue.author?.name ?? detail?.author?.name ?? 'Unknown'}
        </div>
        {detail?.web_url && (
          <div>
            <a
              className="text-[11px] text-blue-600 hover:underline"
              href={detail.web_url}
              target="_blank"
              rel="noreferrer"
            >
              Open in GitLab →
            </a>
          </div>
        )}
      </div>

      {assignees.length ? (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[11px] font-medium text-gray-700 mb-1">
            Assignees
          </div>
          <AvatarGroup users={assignees as any} size={28} />
        </div>
      ) : null}

      {issue.labels?.length ? (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[11px] font-medium text-gray-700 mb-1">
            Labels
          </div>
          <div className="flex flex-wrap gap-1">
            {issue.labels.map((l: string) => (
              <Badge
                key={l}
                variant="secondary"
                className="text-[10px] px-1.5 py-0.5"
              >
                {l}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500">
        Created {new Date(issue.createdAt).toLocaleString()}
        {detail?.updated_at && (
          <span> · Updated {new Date(detail.updated_at).toLocaleString()}</span>
        )}
      </div>

      {loading && (
        <div className="text-xs text-gray-500">Loading issue details…</div>
      )}

      {checklist.length ? (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[11px] font-medium text-gray-700 mb-1">
            Checklist
          </div>
          <div className="space-y-1">
            {checklist.map((c, idx) => (
              <label
                key={`${c.line}-${idx}`}
                className="flex items-start gap-2 text-xs text-gray-800"
              >
                <Checkbox
                  checked={c.checked}
                  onCheckedChange={val => {
                    setChecklist(prev =>
                      prev.map((it, i) =>
                        i === idx ? { ...it, checked: !!val } : it
                      )
                    );
                  }}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span className="leading-4">{c.text}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {effectiveDesc ? (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[11px] font-medium text-gray-700 mb-1">
            Description
          </div>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-[13px] leading-5 text-gray-800">
            {effectiveDesc}
          </div>
        </div>
      ) : null}

      {/* Comments removed per request */}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </div>
      )}
    </div>
  );
};

export default IssueDetail;
