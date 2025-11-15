import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2 } from 'lucide-react';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
import { Textarea } from '@/src/components/ui/ui/textarea';
import { ScrollArea } from '@/src/components/ui/ui/scroll-area';
import { Badge } from '@/src/components/ui/ui/badge';
import useAuth from '@/hooks/useAuth';
import { apiService } from '@/services/api';
import { storageService } from '@/services/storage';

interface FloatingTriggerPopupProps {
  feature: 'issue' | 'issues' | 'pinned';
  position: { x: number; y: number };
  selectedIssue?: any | null;
  onClose: () => void;
  onIssueSelect?: (issue: any) => void;
}

const FloatingTriggerPopup: React.FC<FloatingTriggerPopupProps> = ({
  feature,
  position,
  selectedIssue,
  onClose,
  onIssueSelect,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const portalRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();

  const renderContent = () => {
    switch (feature) {
      case 'issue':
        return (
          <CompactIssueCreator
            onClose={onClose}
            portalContainer={portalRef.current}
          />
        );
      case 'issues':
        return (
          <CompactIssueList
            onClose={onClose}
            onSelect={onIssueSelect}
            portalContainer={portalRef.current}
          />
        );
      case 'pinned':
        return (
          <CompactPinnedIssues
            onClose={onClose}
            onSelect={onIssueSelect}
            portalContainer={portalRef.current}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed bg-white rounded-xl shadow-2xl border border-gray-200"
        style={{
          left: position.x,
          top: position.y,
          width: 360,
          zIndex: 1000000,
        }}
        {...keyboardIsolation}
      >
        {renderContent()}

        {/* Tooltip arrow pointing down */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            bottom: -8,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid white',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            bottom: -9,
            borderLeft: '9px solid transparent',
            borderRight: '9px solid transparent',
            borderTop: '9px solid #e5e7eb',
          }}
        />
      </motion.div>
      <div ref={portalRef} className="pointer-events-none" />
    </>
  );
};

// Compact Issue Creator
const CompactIssueCreator: React.FC<{
  onClose: () => void;
  portalContainer: HTMLElement | null;
}> = ({ onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');

  React.useEffect(() => {
    const loadProjects = async () => {
      try {
        const result = await apiService.getProjects();
        if (result.success && result.data) {
          setProjects(result.data);
          if (result.data.length > 0) {
            setSelectedProject(result.data[0].id.toString());
          }
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
      }
    };
    loadProjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const projectId = parseInt(selectedProject);
      await apiService.createGitLabIssue(
        projectId,
        {
          title: title.trim(),
          description: description.trim(),
        },
        undefined
      );

      // Reset form
      setTitle('');
      setDescription('');
      onClose();
    } catch (error) {
      console.error('Failed to create issue:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Create Issue</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Project Select */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">
            Project
          </label>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">
            Title
          </label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Brief description..."
            className="text-sm h-9"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">
            Description
          </label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add details..."
            className="text-sm min-h-[120px] resize-none"
          />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading || !title.trim()}
          className="w-full h-9 text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Create Issue
            </>
          )}
        </Button>
      </form>
    </div>
  );
};

// Compact Issue List
const CompactIssueList: React.FC<{
  onClose: () => void;
  onSelect?: (issue: any) => void;
  portalContainer: HTMLElement | null;
}> = ({ onClose, onSelect }) => {
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const loadIssues = async () => {
      try {
        const result = await apiService.getIssues();
        if (result.success && result.data) {
          setIssues(result.data.slice(0, 20)); // Get first 20 issues
        }
      } catch (error) {
        console.error('Failed to load issues:', error);
      } finally {
        setLoading(false);
      }
    };
    loadIssues();
  }, []);

  return (
    <div className="flex flex-col h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Issues</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : issues.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              No issues found
            </div>
          ) : (
            issues.map(issue => (
              <button
                key={issue.id}
                onClick={() => onSelect?.(issue)}
                className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                      {issue.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      #{issue.iid} · {issue.project?.name}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {issue.state}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

// Compact Pinned Issues
const CompactPinnedIssues: React.FC<{
  onClose: () => void;
  onSelect?: (issue: any) => void;
  portalContainer: HTMLElement | null;
}> = ({ onClose, onSelect }) => {
  const [pinnedIssues, setPinnedIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const loadPinned = async () => {
      try {
        const pinned = await storageService.getPinnedIssues();
        setPinnedIssues(pinned);
      } catch (error) {
        console.error('Failed to load pinned issues:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPinned();
  }, []);

  return (
    <div className="flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Pinned Issues</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : pinnedIssues.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              No pinned issues
            </div>
          ) : (
            pinnedIssues.map(issue => (
              <button
                key={issue.id}
                onClick={() => onSelect?.(issue)}
                className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                      {issue.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      #{issue.iid} · {issue.project?.name}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {issue.state}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FloatingTriggerPopup;
