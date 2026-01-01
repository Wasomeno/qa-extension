import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  Plus,
  Link as LinkIcon,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MockIssue } from './types';
import { MOCK_ISSUES } from './mock-data';

interface AddChildModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (issue: MockIssue) => void;
  onCreate: (title: string) => void;
  parentIssue: MockIssue;
}

export const AddChildModal: React.FC<AddChildModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  onCreate,
  parentIssue,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'create'>('link');
  const [searchQuery, setSearchQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredIssues = MOCK_ISSUES.filter(
    issue =>
      issue.id !== parentIssue.id &&
      !parentIssue.childIssues?.some(child => child.id === issue.id) &&
      (issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.iid.toString().includes(searchQuery))
  ).slice(0, 5);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    onCreate(newTitle);
    setNewTitle('');
    setIsSubmitting(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                Add Child Item
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-6 pt-2 border-b border-gray-100">
              <button
                onClick={() => setActiveTab('link')}
                className={cn(
                  'px-4 py-3 text-sm font-medium border-b-2 transition-all relative',
                  activeTab === 'link'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Link Existing
                </div>
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={cn(
                  'px-4 py-3 text-sm font-medium border-b-2 transition-all relative',
                  activeTab === 'create'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create New
                </div>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {activeTab === 'link' ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by title or #iid..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      Suggested Issues
                    </span>
                    {filteredIssues.length > 0 ? (
                      <div className="space-y-1">
                        {filteredIssues.map(issue => (
                          <button
                            key={issue.id}
                            onClick={() => onAdd(issue)}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all group text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-mono text-gray-400 flex-shrink-0">
                                #{issue.iid}
                              </span>
                              <span className="text-sm text-gray-700 truncate font-medium">
                                {issue.title}
                              </span>
                            </div>
                            <Plus className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No issues found</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Issue Title
                    </label>
                    <input
                      type="text"
                      placeholder="What needs to be done?"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      autoFocus
                      required
                    />
                  </div>

                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
                    <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 leading-relaxed">
                      New child issues will inherit the milestone and labels of
                      the parent by default.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!newTitle.trim() || isSubmitting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Create Child Issue
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
