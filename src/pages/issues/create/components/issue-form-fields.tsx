import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectPicker } from './project-picker';
import { LabelPicker } from './label-picker';
import { AssigneePicker } from './assignee-picker';
import { RecordingPicker } from './recording-picker';
import { DescriptionEditor } from './description-editor';
import { useGetProjects } from '../hooks/use-get-projects';
import { useGetProjectLabels } from '../hooks/use-get-project-labels';
import { useGetProjectMembers } from '../hooks/use-get-project-members';
import { useQuery } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import { TestBlueprint } from '@/types/recording';
import { toast } from 'sonner';

export interface IssueFormState {
  title: string;
  description: string;
  selectedProject: any | null;
  selectedLabels: any[];
  selectedAssignee: any | null;
  selectedRecording: TestBlueprint | null;
}

interface IssueFormFieldsProps {
  formState: IssueFormState;
  onChange: (updates: Partial<IssueFormState>) => void;
  portalContainer?: HTMLElement | null;
  hideProjectPicker?: boolean; // For child issues where project is inherited
}

export const IssueFormFields: React.FC<IssueFormFieldsProps> = ({
  formState,
  onChange,
  portalContainer,
  hideProjectPicker = false,
}) => {
  const [aiLoading, setAiLoading] = useState(false);

  const {
    title,
    description,
    selectedProject,
    selectedLabels,
    selectedAssignee,
    selectedRecording,
  } = formState;

  // --- Data Fetching ---
  const { data: projects = [], isLoading: isLoadingProjects } =
    useGetProjects();
  const { data: labels = [], isLoading: isLoadingLabels } = useGetProjectLabels(
    selectedProject?.id
  );
  const { data: members = [], isLoading: isLoadingMembers } =
    useGetProjectMembers(selectedProject?.id);

  const { data: recordings = [], isLoading: isLoadingRecordings } = useQuery({
    queryKey: ['recordings-blueprints'],
    queryFn: async () => {
      const data = await storageService.get('test-blueprints');
      return (data || []) as TestBlueprint[];
    },
  });

  const handleToggleLabel = (label: any) => {
    const isSelected = selectedLabels.some(l => l.id === label.id);
    const newLabels = isSelected
      ? selectedLabels.filter(l => l.id !== label.id)
      : [...selectedLabels, label];
    onChange({ selectedLabels: newLabels });
  };

  const handleSelectRecording = (recording: TestBlueprint | null) => {
    onChange({ selectedRecording: recording });

  };

  const handleAIRequest = () => {
    setAiLoading(true);
    // Simulate AI delay
    setTimeout(() => {
      setAiLoading(false);
      toast.info('AI enhancement is coming soon!');
    }, 1000);
  };

  const TEMPLATES = {
    default: `### Issue Description:

[Description of the issue]

---

### Scope:

- [ ] [Scope item]

---

### Testing Steps:

1. [Step 1]
2. [Step 2]

---

### Expectation

| Actual | Expectation |
|--------|-------------|
| [Actual Condition] | [Expected Condition] |

---

### Notes:

- Username Login **(required)**
- Issue Monitoring Line & Link **(required)**
- cURL _(gunakan pastebin.com)_ **(required)**
- Picture Link
- Sentry Link
- File Link
- Note
- etc.`,
  };

  return (
    <div className="space-y-6">
      {/* Project */}
      {!hideProjectPicker && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Project</label>
          <ProjectPicker
            projects={projects}
            isLoading={isLoadingProjects}
            selectedProject={selectedProject}
            onSelect={project => {
              onChange({
                selectedProject: project,
                selectedLabels: [],
                selectedAssignee: null,
              });
            }}
            portalContainer={portalContainer}
          />
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Title</label>
        <Input
          placeholder="Issue title"
          value={title}
          onChange={e => onChange({ title: e.target.value })}
          className="bg-gray-50 border-gray-200"
        />
      </div>

      {/* Labels & Assignee Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Labels</label>
          <LabelPicker
            labels={labels}
            isLoading={isLoadingLabels}
            selectedLabels={selectedLabels}
            onToggle={handleToggleLabel}
            disabled={!selectedProject}
            portalContainer={portalContainer}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Assignee</label>
          <AssigneePicker
            members={members}
            isLoading={isLoadingMembers}
            selectedAssignee={selectedAssignee}
            onSelect={assignee => onChange({ selectedAssignee: assignee })}
            disabled={!selectedProject}
            portalContainer={portalContainer}
          />
        </div>
      </div>

      {/* Recording */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Include a Recording
        </label>
        <RecordingPicker
          recordings={recordings}
          isLoading={isLoadingRecordings}
          selectedRecording={selectedRecording}
          onSelect={handleSelectRecording}
          portalContainer={portalContainer}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <DescriptionEditor
          content={description}
          onChange={desc => onChange({ description: desc })}
          templates={TEMPLATES}
          onAIRequest={handleAIRequest}
          aiLoading={aiLoading}
          portalContainer={portalContainer}
        />
      </div>
    </div>
  );
};
