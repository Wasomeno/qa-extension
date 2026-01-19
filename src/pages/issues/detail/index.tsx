import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ExternalLink,
  MoreVertical,
  Pin,
  GitPullRequest,
  Pencil,
  Save,
  Calendar,
  Smile,
  Reply,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Issue, updateIssue } from '@/api/issue';
import { useGetProjectMembers } from '@/pages/issues/create/hooks/use-get-project-members';
import { useGetProjectLabels } from '@/pages/issues/create/hooks/use-get-project-labels';
import { AssigneePicker } from '@/pages/issues/create/components/assignee-picker';
import { LabelPicker } from '@/pages/issues/create/components/label-picker';
import { DescriptionEditor } from '@/pages/issues/create/components/description-editor';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { usePinnedIssues } from '@/hooks/use-pinned-issues';
import { useGetIssueComments } from '../hooks/use-get-issue-comments';
import { ChildIssuesList } from '@/pages/issues/detail/components/child-issues-list';

interface IssueDetailPageProps {
  issue: Issue;
  onBack: () => void;
}

const statusConfig: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  opened: { color: 'text-green-700', bg: 'bg-green-100', label: 'Open' },
  closed: { color: 'text-gray-700', bg: 'bg-gray-100', label: 'Closed' },
  // Default fallbacks
};

// Helper to format date
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

interface EditableSectionProps {
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving?: boolean;
  title?: string;
  children: React.ReactNode;
  editComponent: React.ReactNode;
  className?: string;
}

const EditableSection: React.FC<EditableSectionProps> = ({
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isSaving,
  title,
  children,
  editComponent,
  className,
}) => {
  return (
    <div className={cn('group relative rounded-lg transition-all', className)}>
      {title && (
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
            {title}
          </h3>
          {!isEditing && (
            <button
              onClick={onEdit}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-opacity"
            >
              <Pencil className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-3 bg-white p-3 rounded-lg border border-blue-100 shadow-sm ring-2 ring-blue-50">
          {editComponent}
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={isSaving}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={isSaving}
              className="h-7 text-xs gap-1.5"
            >
              {isSaving ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-3 h-3" /> Save
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative">
          {children}
          {!title && (
            <button
              onClick={onEdit}
              className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 p-1.5 bg-white shadow-sm border border-gray-100 hover:bg-gray-50 rounded-full transition-all z-10"
            >
              <Pencil className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const IssueDetailPage: React.FC<IssueDetailPageProps> = ({
  issue,
  onBack,
}) => {
  // Removed history state, using props directly
  const containerRef = React.useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const projectId = issue.project_id;
  const issueId = issue.iid;

  // Edit States
  const [editingField, setEditingField] = useState<
    'description' | 'status' | 'assignee' | 'labels' | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);

  const { togglePin, isPinned } = usePinnedIssues();

  // Form States
  const [description, setDescription] = useState(issue.description);
  const [status, setStatus] = useState<string>(
    issue.state === 'closed' ? 'closed' : 'opened'
  );
  console.log(issue);

  const comments = useGetIssueComments(issue.project_id, issue.iid);

  // Adapting to single assignee for now as per previous code assumption, though API supports array
  const [selectedAssignee, setSelectedAssignee] = useState(
    issue.assignees?.[0]
      ? {
          id: String(issue.assignees[0].id),
          name: issue.assignees[0].name,
          username: issue.assignees[0].username,
          avatarUrl: issue.assignees[0].avatar_url,
          webUrl: issue.assignees[0].web_url,
          state: issue.assignees[0].state,
        }
      : undefined
  );

  const [selectedLabels, setSelectedLabels] = useState(
    issue.label_details
      ? issue.label_details.map(l => ({
          id: String(l.id),
          name: l.name,
          color: l.color,
          textColor: l.text_color,
          description: l.description,
        }))
      : (issue.labels || []).map(l => ({
          id: l,
          name: l,
          color: '#ccc',
          textColor: '#000',
          description: '',
        }))
  );

  // Data Fetching for Pickers
  const { data: members, isLoading: isLoadingMembers } =
    useGetProjectMembers(projectId);
  const { data: labels, isLoading: isLoadingLabels } =
    useGetProjectLabels(projectId);

  const statusStyle = statusConfig[issue.state] || statusConfig.opened;

  const handleUpdate = async () => {
    if (!editingField) return;

    setIsSaving(true);
    try {
      if (editingField === 'description') {
        await updateIssue(projectId, issueId, { description });
        toast.success('Description updated');
      } else if (editingField === 'status') {
        const event = status === 'closed' ? 'close' : 'reopen';
        await updateIssue(projectId, issueId, { state_event: event });
        toast.success('Status updated');
      } else if (editingField === 'assignee') {
        await updateIssue(projectId, issueId, {
          assignee_ids: selectedAssignee ? [parseInt(selectedAssignee.id)] : [],
        });
        toast.success('Assignee updated');
      } else if (editingField === 'labels') {
        await updateIssue(projectId, issueId, {
          labels: selectedLabels.map(l => l.name).join(','),
        });
        toast.success('Labels updated');
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
      setEditingField(null);
    } catch (error) {
      console.error('Failed to update issue:', error);
      toast.error('Failed to update issue');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    // Reset states
    setDescription(issue.description);
    setStatus(issue.state === 'closed' ? 'closed' : 'opened');
    setSelectedAssignee(
      issue.assignees?.[0]
        ? {
            id: String(issue.assignees[0].id),
            name: issue.assignees[0].name,
            username: issue.assignees[0].username,
            avatarUrl: issue.assignees[0].avatar_url,
            webUrl: issue.assignees[0].web_url,
            state: issue.assignees[0].state,
          }
        : undefined
    );
    setSelectedLabels(
      issue.label_details
        ? issue.label_details.map(l => ({
            id: String(l.id),
            name: l.name,
            color: l.color,
            textColor: l.text_color,
            description: l.description,
          }))
        : (issue.labels || []).map(l => ({
            id: l,
            name: l,
            color: '#ccc',
            textColor: '#000',
            description: '',
          }))
    );
  };

  console.log('ISSUE DATA', issue);
  console.log('DETAIL ISSUE', comments.data);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col relative h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex-none sticky bg-neutral-50 z-10 top-0 p-4 border-b border-gray-100 ">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-gray-900 mt-2 leading-snug truncate max-w-[400px]">
                {issue.title}
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                <span className="font-medium text-gray-500">
                  {issue.project_name}
                </span>
                <span>•</span>
                <span>Created by {issue.author.name}</span>
                <span>•</span>
                <span>{formatDate(issue.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (issue.web_url) {
                  window.open(issue.web_url, '_blank');
                }
              }}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
              title="Open in GitLab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePin(issue)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                isPinned(issue.iid, issue.project_id)
                  ? 'bg-amber-100 text-amber-500 hover:bg-amber-200'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={
                isPinned(issue.iid, issue.project_id)
                  ? 'Unpin Issue'
                  : 'Pin Issue'
              }
            >
              <Pin
                className={cn(
                  'w-4 h-4',
                  isPinned(issue.iid, issue.project_id) && 'fill-current'
                )}
              />
            </button>
            <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Column - Main Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description - Editable */}
          <EditableSection
            title="Description"
            isEditing={editingField === 'description'}
            onEdit={() => {
              setDescription(issue.description);
              setEditingField('description');
            }}
            onCancel={cancelEdit}
            onSave={handleUpdate}
            isSaving={isSaving}
            editComponent={
              <DescriptionEditor
                content={description}
                onChange={setDescription}
                className="min-h-[200px]"
                portalContainer={containerRef.current}
              />
            }
          >
            {' '}
            <div className="group relative rounded-lg p-2 hover:bg-gray-50/50 transition-colors -m-2">
              <MarkdownRenderer content={issue.description} />
            </div>
          </EditableSection>

          {/* Child Tasks */}
          <ChildIssuesList parentIssue={issue} />

          {/* Comments Section */}
          <div className="space-y-6">
            <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
              Comments
              <span className="text-xs text-gray-400 font-normal">
                {comments.data?.data?.length || 0}
              </span>
            </h2>

            <div className="space-y-6">
              {comments.isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="border border-gray-200 rounded-lg bg-white">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-lg border-b border-gray-100 h-9">
                            <Skeleton className="h-4 w-32" />
                          </div>
                          <div className="p-3 space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                : comments.data?.data?.map(comment => (
                    <div key={comment.id} className="flex gap-3 group">
                      <div className="flex-shrink-0">
                        <img
                          src={comment.author.avatar_url}
                          alt={comment.author.name}
                          className="w-8 h-8 rounded-full border border-gray-100"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="border border-gray-200 rounded-lg bg-white">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-lg border-b border-gray-100">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold text-gray-900">
                                {comment.author.name}
                              </span>
                              <span className="text-gray-500">
                                @{comment.author.username}
                              </span>
                              <span className="text-gray-300">•</span>
                              <span className="text-gray-500">
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600">
                                <Smile className="w-3.5 h-3.5" />
                              </button>
                              <button className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600">
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                              <button className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="p-3">
                            <MarkdownRenderer
                              content={comment.body}
                              className="text-xs [&_p]:leading-relaxed [&_p]:!mt-1.5 [&_h1]:!text-base [&_h2]:!text-sm [&_h3]:!text-xs [&_code]:!text-xs [&_pre]:!p-2 [&_li]:!leading-relaxed [&_table]:!text-xs [&_td]:!text-xs [&_th]:!text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>

            {/* Comment Placeholder */}
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                {/* Current User Avatar Placeholder - ideally should come from user context */}
                <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                  You
                </div>
              </div>
              <div className="flex-1">
                <div className="border border-gray-200 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-50 focus-within:border-blue-400 transition-all">
                  <textarea
                    className="w-full p-3 text-sm border-0 resize-none focus:ring-0 min-h-[100px]"
                    placeholder="Write a comment..."
                    disabled
                  />
                  <div className="bg-gray-50 px-3 py-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">
                      will integrate it later
                    </span>
                    <Button disabled size="sm" className="h-7 text-xs">
                      Comment
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar */}
        <div className="w-60 flex-shrink-0 border-l border-gray-100 bg-gray-50/50 p-4 space-y-4 overflow-y-auto">
          {/* Status & Assignee */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-4">
            {/* Status - Editable */}
            <EditableSection
              title="Status"
              isEditing={editingField === 'status'}
              onEdit={() => {
                setStatus(issue.state === 'closed' ? 'closed' : 'opened');
                setEditingField('status');
              }}
              onCancel={cancelEdit}
              onSave={handleUpdate}
              isSaving={isSaving}
              editComponent={
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent container={containerRef.current}>
                    <SelectItem value="opened">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              }
            >
              <div className="mt-1">
                <span
                  className={cn(
                    'text-xs px-2 py-1 rounded-full font-medium',
                    statusStyle.bg,
                    statusStyle.color
                  )}
                >
                  {statusStyle.label}
                </span>
              </div>
            </EditableSection>

            {/* Assignee - Editable */}
            <EditableSection
              title="Assignee"
              isEditing={editingField === 'assignee'}
              onEdit={() => {
                setSelectedAssignee(
                  issue.assignees?.[0]
                    ? {
                        id: String(issue.assignees[0].id),
                        name: issue.assignees[0].name,
                        username: issue.assignees[0].username,
                        avatarUrl: issue.assignees[0].avatar_url,
                        webUrl: issue.assignees[0].web_url,
                        state: issue.assignees[0].state,
                      }
                    : undefined
                );
                setEditingField('assignee');
              }}
              onCancel={cancelEdit}
              onSave={handleUpdate}
              isSaving={isSaving}
              editComponent={
                <AssigneePicker
                  members={members || []}
                  isLoading={isLoadingMembers}
                  selectedAssignee={selectedAssignee}
                  onSelect={setSelectedAssignee}
                  disabled={isSaving}
                  portalContainer={containerRef.current}
                />
              }
            >
              <div className="mt-1 flex items-center gap-2">
                {issue.assignees?.[0] ? (
                  <>
                    <img
                      src={issue.assignees[0].avatar_url}
                      className="w-5 h-5 rounded-full"
                      alt=""
                    />
                    <span className="text-xs font-medium text-gray-900">
                      {issue.assignees[0].name}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400 italic">
                    Unassigned
                  </span>
                )}
              </div>
            </EditableSection>
          </div>

          {/* Labels - Editable */}
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <EditableSection
              title="Labels"
              isEditing={editingField === 'labels'}
              onEdit={() => {
                setSelectedLabels(
                  issue.label_details
                    ? issue.label_details.map(l => ({
                        id: String(l.id),
                        name: l.name,
                        color: l.color,
                        textColor: l.text_color,
                        description: l.description,
                      }))
                    : (issue.labels || []).map(l => ({
                        id: l,
                        name: l,
                        color: '#ccc',
                        textColor: '#000',
                        description: '',
                      }))
                );
                setEditingField('labels');
              }}
              onCancel={cancelEdit}
              onSave={handleUpdate}
              isSaving={isSaving}
              editComponent={
                <LabelPicker
                  labels={labels || []}
                  isLoading={isLoadingLabels}
                  selectedLabels={selectedLabels}
                  onToggle={label => {
                    const exists = selectedLabels.some(l => l.id === label.id);
                    if (exists) {
                      setSelectedLabels(prev =>
                        prev.filter(l => l.id !== label.id)
                      );
                    } else {
                      setSelectedLabels(prev => [...prev, label]);
                    }
                  }}
                  disabled={isSaving}
                  portalContainer={containerRef.current}
                />
              }
            >
              <div className="mt-2 grid grid-cols-2 gap-2">
                {issue.label_details && issue.label_details.length > 0 ? (
                  issue.label_details.map(label => (
                    <div
                      key={label.id}
                      className="col-span-1 text-[10px] px-2 py-0.5 rounded border font-medium truncate"
                      style={{
                        backgroundColor: `${label.color}15`,
                        color: label.color,
                        borderColor: `${label.color}30`,
                      }}
                    >
                      {label.name}
                    </div>
                  ))
                ) : issue.labels && issue.labels.length > 0 ? (
                  issue.labels.map((label, i) => (
                    <div
                      key={i}
                      className="col-span-1 text-[10px] px-2 py-0.5 rounded border font-medium bg-gray-100 text-gray-700 truncate"
                    >
                      {label}
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-gray-400 italic">
                    No labels
                  </span>
                )}
              </div>
            </EditableSection>
          </div>

          {/* Milestone & Due Date */}
          {issue.due_date && (
            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
              {issue.due_date && (
                <div>
                  <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Due Date
                  </span>
                  <div className="mt-1 text-xs font-medium text-gray-900">
                    {formatDate(issue.due_date)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MR Status */}
          {issue.merge_requests_count > 0 && (
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
                Merge Requests
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                  <GitPullRequest className="w-3.5 h-3.5" />
                  {issue.merge_requests_count} Open
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
