import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectPicker } from './project-picker';
import { LabelPicker } from './label-picker';
import { AssigneePicker } from './assignee-picker';
import { DescriptionEditor } from './description-editor';
import { useGetProjects } from '../hooks/use-get-projects';
import { useGetProjectLabels } from '../hooks/use-get-project-labels';
import { useGetProjectMembers } from '../hooks/use-get-project-members';
import { toast } from 'sonner';

export interface IssueFormState {
  title: string;
  description: string;
  selectedProject: any | null;
  selectedLabels: any[];
  selectedAssignee: any | null;
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
  } = formState;

  // --- Data Fetching ---
  const { data: projects = [], isLoading: isLoadingProjects } =
    useGetProjects();
  const { data: labels = [], isLoading: isLoadingLabels } = useGetProjectLabels(
    selectedProject?.id
  );
  const { data: members = [], isLoading: isLoadingMembers } =
    useGetProjectMembers(selectedProject?.id);

  const handleToggleLabel = (label: any) => {
    const isSelected = selectedLabels.some(l => l.id === label.id);
    const newLabels = isSelected
      ? selectedLabels.filter(l => l.id !== label.id)
      : [...selectedLabels, label];
    onChange({ selectedLabels: newLabels });
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
    bug: `### Description
[Description of the bug]

### Reproduction Steps
1. [Step 1]
2. [Step 2]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happened]

### Environment
- URL: [URL]
- Browser: [Browser]
- Device: [Device]`,

    feature: `### Problem Statement
[What problem are we solving?]

### User Story
As a [user], I want to [action] so that [benefit].

### Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2

### Design / Resources
[Links to Figma, docs, etc.]`,
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
