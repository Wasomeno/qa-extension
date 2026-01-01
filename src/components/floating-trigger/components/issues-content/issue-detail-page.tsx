import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ExternalLink,
  MoreVertical,
  Pin,
  GitMerge,
  GitPullRequest,
  Clock,
  Calendar,
  Copy,
  Eye,
  EyeOff,
  Check,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Milestone,
  Database,
  Globe,
  User,
  ListTree,
  X,
  CornerDownRight,
} from 'lucide-react';
import { AddChildModal } from './add-child-modal';
import { MockIssue, IssueStatus, ChildIssue as ChildIssueType } from './types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface IssueDetailPageProps {
  issue: MockIssue;
  onBack: () => void;
}

const statusConfig: Record<
  IssueStatus,
  { color: string; bg: string; label: string }
> = {
  OPEN: { color: 'text-green-700', bg: 'bg-green-100', label: 'Open' },
  IN_QA: { color: 'text-blue-700', bg: 'bg-blue-100', label: 'In QA' },
  BLOCKED: { color: 'text-red-700', bg: 'bg-red-100', label: 'Blocked' },
  CLOSED: { color: 'text-gray-700', bg: 'bg-gray-100', label: 'Closed' },
  MERGED: { color: 'text-purple-700', bg: 'bg-purple-100', label: 'Merged' },
};

// Helper to format time
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
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

// Helper to calculate relative time
const getRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
};

export const IssueDetailPage: React.FC<IssueDetailPageProps> = ({
  issue,
  onBack,
}) => {
  const [history, setHistory] = useState<MockIssue[]>([issue]);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {}
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  const currentIssue = history[history.length - 1];
  const statusStyle = statusConfig[currentIssue.status] || statusConfig.OPEN;

  const handlePush = (newIssue: MockIssue) => {
    setHistory(prev => [...prev, newIssue]);
  };

  const handlePop = () => {
    if (history.length > 1) {
      setHistory(prev => prev.slice(0, -1));
    } else {
      onBack();
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    setHistory(prev => prev.slice(0, index + 1));
  };

  const handleLinkChild = (issueToLink: MockIssue) => {
    const newChild: ChildIssueType = {
      id: issueToLink.id,
      iid: issueToLink.iid,
      title: issueToLink.title,
      status: issueToLink.status,
      labels: issueToLink.labels,
      fullIssue: issueToLink,
    };

    setHistory(prev => {
      const newHistory = [...prev];
      const lastIssue = { ...newHistory[newHistory.length - 1] };
      lastIssue.childIssues = [...(lastIssue.childIssues || []), newChild];
      newHistory[newHistory.length - 1] = lastIssue;
      return newHistory;
    });
    setShowAddChildModal(false);
  };

  const handleCreateChild = (title: string) => {
    const newId = `issue-${Math.random().toString(36).substr(2, 9)}`;
    const newIid = Math.floor(Math.random() * 1000) + 500;

    const newIssue: MockIssue = {
      id: newId,
      iid: newIid,
      title,
      status: 'OPEN',
      labels: currentIssue.labels,
      description: 'Newly created child issue.',
      assignee: currentIssue.assignee,
      author: {
        id: 'user-1',
        name: 'Kevin Ananda',
        username: 'kevin',
        avatarUrl: 'https://avatar.vercel.sh/kevin',
      },
      project: currentIssue.project,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      milestone: currentIssue.milestone,
      acceptanceCriteria: [],
      devQaChecklist: {
        devItems: [],
        qaItems: [],
        isDevReady: false,
        isQaReady: false,
        isReadyForRelease: false,
      },
      parentIssue: {
        id: currentIssue.id,
        iid: currentIssue.iid,
        title: currentIssue.title,
        status: currentIssue.status,
      },
    };

    const newChild: ChildIssueType = {
      id: newId,
      iid: newIid,
      title: title,
      status: 'OPEN',
      labels: currentIssue.labels,
      fullIssue: newIssue,
    };

    setHistory(prev => {
      const newHistory = [...prev];
      const lastIssue = { ...newHistory[newHistory.length - 1] };
      lastIssue.childIssues = [...(lastIssue.childIssues || []), newChild];
      newHistory[newHistory.length - 1] = lastIssue;
      return newHistory;
    });
    setShowAddChildModal(false);
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenGitlab = () => {
    if (issue.webUrl) {
      window.open(issue.webUrl, '_blank');
    }
  };

  // Calculate checklist progress
  const devProgress = currentIssue.devQaChecklist
    ? (currentIssue.devQaChecklist.devItems.filter(i => i.completed).length /
        currentIssue.devQaChecklist.devItems.length) *
      100
    : 0;
  const qaProgress = currentIssue.devQaChecklist
    ? (currentIssue.devQaChecklist.qaItems.filter(i => i.completed).length /
        currentIssue.devQaChecklist.qaItems.length) *
      100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-gray-100 bg-white">
        {/* Navigation / Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2 overflow-hidden whitespace-nowrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1 hover:text-gray-900 transition-colors"
          >
            Issues
          </button>
          {history.length > 0 &&
            history.map((h, i) => (
              <React.Fragment key={h.id}>
                <span>/</span>
                <button
                  onClick={() => handleBreadcrumbClick(i)}
                  className={cn(
                    'max-w-[120px] truncate transition-colors',
                    i === history.length - 1
                      ? 'text-gray-900 font-medium'
                      : 'hover:text-gray-900'
                  )}
                >
                  #{h.iid}
                </button>
              </React.Fragment>
            ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePop}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-mono text-gray-500">
              #{currentIssue.iid}
            </span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                statusStyle.bg,
                statusStyle.color
              )}
            >
              {statusStyle.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (currentIssue.webUrl) {
                  window.open(currentIssue.webUrl, '_blank');
                }
              }}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
              title="Open in GitLab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-amber-500 transition-colors"
              title="Pin Issue"
            >
              <Pin className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mt-2 leading-snug truncate">
          {currentIssue.title}
        </h1>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
          <span className="font-medium text-gray-500">
            {currentIssue.project.name}
          </span>
          <span>•</span>
          <span>Created by {currentIssue.author.name}</span>
          <span>•</span>
          <span>{formatDate(currentIssue.createdAt)}</span>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="flex">
          {/* Left Column - Main Content */}
          <div className="flex-1 min-w-0 p-6 space-y-6 border-r border-gray-100">
            {/* Description */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Description
              </h3>
              <div className="prose prose-sm text-gray-700 max-w-none whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-100">
                {currentIssue.description || (
                  <span className="text-gray-400 italic">
                    No description provided
                  </span>
                )}
              </div>
            </section>

            {/* Acceptance Criteria */}
            {currentIssue.acceptanceCriteria &&
              currentIssue.acceptanceCriteria.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Acceptance Criteria
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      (
                      {
                        currentIssue.acceptanceCriteria.filter(
                          ac => ac.completed
                        ).length
                      }
                      /{currentIssue.acceptanceCriteria.length})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {currentIssue.acceptanceCriteria.map(ac => (
                      <label
                        key={ac.id}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5',
                            ac.completed
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300'
                          )}
                        >
                          {ac.completed && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span
                          className={cn(
                            'text-sm',
                            ac.completed
                              ? 'text-gray-500 line-through'
                              : 'text-gray-700'
                          )}
                        >
                          {ac.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

            {/* Child Items */}
            {currentIssue.childIssues &&
              currentIssue.childIssues.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ListTree className="w-4 h-4" />
                      Child Items
                      <span className="text-xs text-gray-400 font-normal">
                        (
                        {
                          currentIssue.childIssues.filter(
                            c => c.status === 'CLOSED'
                          ).length
                        }
                        /{currentIssue.childIssues.length} completed)
                      </span>
                    </h3>
                    <button
                      onClick={() => setShowAddChildModal(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Add
                    </button>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-gray-200 rounded-full mb-4">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{
                        width: `${(currentIssue.childIssues.filter(c => c.status === 'CLOSED').length / currentIssue.childIssues.length) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    {currentIssue.childIssues.map(child => {
                      const childStatus =
                        statusConfig[child.status] || statusConfig.OPEN;
                      return (
                        <div
                          key={child.id}
                          onClick={() =>
                            child.fullIssue && handlePush(child.fullIssue)
                          }
                          className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-100/50 transition-all cursor-pointer group"
                        >
                          {/* Status indicator */}
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full flex-shrink-0',
                              child.status === 'OPEN'
                                ? 'bg-green-500'
                                : child.status === 'IN_QA'
                                  ? 'bg-blue-500'
                                  : child.status === 'BLOCKED'
                                    ? 'bg-red-500'
                                    : child.status === 'CLOSED'
                                      ? 'bg-gray-400'
                                      : 'bg-purple-500'
                            )}
                          />
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-gray-400">
                                #{child.iid}
                              </span>
                              <span className="text-sm text-gray-900 truncate">
                                {child.title}
                              </span>
                            </div>
                            {child.labels.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                {child.labels.slice(0, 2).map(label => (
                                  <span
                                    key={label.id}
                                    className="text-[9px] px-1.5 py-0.5 rounded border font-medium"
                                    style={{
                                      backgroundColor: `${label.color}15`,
                                      color: label.color,
                                      borderColor: `${label.color}30`,
                                    }}
                                  >
                                    {label.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Status badge */}
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0',
                              childStatus.bg,
                              childStatus.color
                            )}
                          >
                            {childStatus.label}
                          </span>
                          {/* Remove button */}
                          <button
                            className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove"
                            onClick={e => {
                              e.stopPropagation();
                              // logic to remove child item
                            }}
                          >
                            <X className="w-3 h-3 text-gray-400" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

            {currentIssue.testEnvironment && (
              <section>
                <button
                  onClick={() => toggleSection('testEnv')}
                  className="flex items-center justify-between w-full text-left mb-3"
                >
                  <h3 className="text-sm font-semibold text-gray-900">
                    Resource & Details
                  </h3>
                  {collapsedSections.testEnv ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {!collapsedSections.testEnv && (
                  <div className="space-y-4">
                    {/* Env URLs */}
                    <div className="bg-gray-50 space-y-4 rounded-xl p-4 border border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" /> Environment URL:
                        </span>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <a
                              href={currentIssue.testEnvironment.envUrls[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline truncate max-w-[200px]"
                            >
                              {currentIssue.testEnvironment.envUrls[0].url}
                            </a>
                            <button
                              onClick={() =>
                                handleCopy(
                                  currentIssue.testEnvironment?.envUrls[0]
                                    .url as string,
                                  `env-0`
                                )
                              }
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Copy URL"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" /> Test Account:
                        </span>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 mt-0.5 text-gray-500">
                            <span>
                              {
                                currentIssue.testEnvironment.testAccounts[0]
                                  .username
                              }
                            </span>
                            <span>•</span>
                            <span className="font-mono">
                              {showPasswords[
                                currentIssue.testEnvironment.testAccounts[0].id
                              ]
                                ? currentIssue.testEnvironment.testAccounts[0]
                                    .password
                                : '••••••••'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                togglePassword(
                                  currentIssue.testEnvironment?.testAccounts[0]
                                    .id as string
                                )
                              }
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Toggle password"
                            >
                              {showPasswords[
                                currentIssue.testEnvironment.testAccounts[0].id
                              ] ? (
                                <EyeOff className="w-3 h-3 text-gray-400" />
                              ) : (
                                <Eye className="w-3 h-3 text-gray-400" />
                              )}
                            </button>
                            <button
                              onClick={() =>
                                handleCopy(
                                  currentIssue.testEnvironment?.testAccounts[0]
                                    .password as string,
                                  currentIssue.testEnvironment?.testAccounts[0]
                                    .id as string
                                )
                              }
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Copy password"
                            >
                              {copiedId ===
                              currentIssue.testEnvironment.testAccounts[0]
                                .id ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Test Data Snippets */}
                      <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-3">
                        <Database className="w-3.5 h-3.5" /> Test Data Snippet:
                      </span>
                      <div className="space-y-2">
                        <div
                          key={
                            currentIssue.testEnvironment.testDataSnippets[1].id
                          }
                          className="bg-white rounded-lg p-2 border border-gray-100"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700">
                              {
                                currentIssue.testEnvironment.testDataSnippets[1]
                                  .label
                              }
                            </span>
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  'text-[9px] px-1.5 py-0.5 rounded uppercase font-medium',
                                  currentIssue.testEnvironment
                                    .testDataSnippets[0].type === 'sql'
                                    ? 'bg-orange-100 text-orange-600'
                                    : currentIssue.testEnvironment
                                          .testDataSnippets[0].type === 'json'
                                      ? 'bg-blue-100 text-blue-600'
                                      : 'bg-gray-100 text-gray-600'
                                )}
                              >
                                {
                                  currentIssue.testEnvironment
                                    .testDataSnippets[0].type
                                }
                              </span>
                              <button
                                onClick={() =>
                                  handleCopy(
                                    currentIssue.testEnvironment
                                      ?.testDataSnippets[0].content as string,
                                    currentIssue.testEnvironment
                                      ?.testDataSnippets[0].id as string
                                  )
                                }
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Copy"
                              >
                                {copiedId ===
                                currentIssue.testEnvironment.testDataSnippets[1]
                                  .id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3 text-gray-400" />
                                )}
                              </button>
                            </div>
                          </div>
                          <code className="text-[10px] text-gray-600 font-mono block truncate">
                            {
                              currentIssue.testEnvironment.testDataSnippets[1]
                                .content
                            }
                          </code>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Comments / Activity */}
            {currentIssue.comments && currentIssue.comments.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Activity
                  <span className="text-xs text-gray-400 font-normal">
                    ({currentIssue.comments.length})
                  </span>
                </h3>
                <div className="space-y-3">
                  {currentIssue.comments.map(comment => (
                    <div key={comment.id} className="flex gap-3">
                      <img
                        src={comment.author.avatarUrl}
                        alt=""
                        className="w-7 h-7 rounded-full flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-900">
                            {comment.author.name}
                          </span>
                          <span className="text-gray-400">
                            {getRelativeTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">
                          {comment.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Add comment input */}
                <div className="mt-4">
                  <textarea
                    placeholder="Add a comment..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    rows={2}
                  />
                </div>
              </section>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="flex-shrink-0 p-4 space-y-4 bg-gray-50/50">
            {/* Status & Assignee */}
            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-4">
              <div>
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
                  Status
                </span>
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
              </div>
              <div>
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
                  Assignee
                </span>
                <div className="mt-1 flex items-center gap-2">
                  {currentIssue.assignee ? (
                    <>
                      <img
                        src={currentIssue.assignee.avatarUrl}
                        className="w-5 h-5 rounded-full"
                        alt=""
                      />
                      <span className="text-xs font-medium text-gray-900">
                        {currentIssue.assignee.name}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400 italic">
                      Unassigned
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Labels */}
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
                Labels
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {currentIssue.labels.length > 0 ? (
                  currentIssue.labels.map(label => (
                    <span
                      key={label.id}
                      className="text-[10px] px-2 py-0.5 rounded border font-medium"
                      style={{
                        backgroundColor: `${label.color}15`,
                        color: label.color,
                        borderColor: `${label.color}30`,
                      }}
                    >
                      {label.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400 italic">
                    No labels
                  </span>
                )}
              </div>
            </div>

            {/* Parent Issue */}
            {currentIssue.parentIssue && (
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1">
                  <CornerDownRight className="w-3 h-3" /> Parent Issue
                </span>
                TEST
                <div
                  className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors cursor-pointer"
                  onClick={() => {
                    const parentIndex = history.findIndex(
                      h => h.id === currentIssue.parentIssue?.id
                    );
                    if (parentIndex !== -1) {
                      handleBreadcrumbClick(parentIndex);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        currentIssue.parentIssue.status === 'OPEN'
                          ? 'bg-green-500'
                          : currentIssue.parentIssue.status === 'IN_QA'
                            ? 'bg-blue-500'
                            : currentIssue.parentIssue.status === 'BLOCKED'
                              ? 'bg-red-500'
                              : currentIssue.parentIssue.status === 'CLOSED'
                                ? 'bg-gray-400'
                                : 'bg-purple-500'
                      )}
                    />
                    <span className="text-[10px] font-mono text-gray-400">
                      #{currentIssue.parentIssue.iid}
                    </span>
                  </div>
                  <p className="text-xs text-gray-900 mt-1 line-clamp-2">
                    {currentIssue.parentIssue.title}
                  </p>
                </div>
              </div>
            )}

            {/* Milestone & Due Date */}
            {currentIssue.dueDate && (
              <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
                {currentIssue.dueDate && (
                  <div>
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Due Date
                    </span>
                    <div className="mt-1 text-xs font-medium text-gray-900">
                      {formatDate(currentIssue.dueDate)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MR Status */}
            {currentIssue.mrStatus && currentIssue.mrStatus !== 'NONE' && (
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
                  Merge Request
                </span>
                <div className="mt-2 flex items-center gap-2">
                  {currentIssue.mrStatus === 'MERGED' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                      <GitMerge className="w-3.5 h-3.5" /> Merged
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                      <GitPullRequest className="w-3.5 h-3.5" /> Open
                    </span>
                  )}
                  {currentIssue.mrId && (
                    <span className="text-xs text-gray-400">
                      !{currentIssue.mrId}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <AddChildModal
          isOpen={showAddChildModal}
          onClose={() => setShowAddChildModal(false)}
          onAdd={handleLinkChild}
          onCreate={handleCreateChild}
          parentIssue={currentIssue}
        />
      </ScrollArea>
    </motion.div>
  );
};
