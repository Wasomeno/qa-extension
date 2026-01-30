import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { LabelPicker } from '@/pages/issues/create/components/label-picker';
import { AssigneePicker } from '@/pages/issues/create/components/assignee-picker';
import { DescriptionEditor } from '@/pages/issues/create/components/description-editor';
import { useGetProjectLabels } from '@/pages/issues/create/hooks/use-get-project-labels';
import { useGetProjectMembers } from '@/pages/issues/create/hooks/use-get-project-members';
import { toast } from 'sonner';
import { IssueFormState } from '@/pages/issues/create/components/issue-form-fields';

interface ChildIssueFormFieldsProps {
  formState: IssueFormState;
  onChange: (updates: Partial<IssueFormState>) => void;
  portalContainer?: HTMLElement | null;
  projectId: number;
}

export const ChildIssueFormFields: React.FC<ChildIssueFormFieldsProps> = ({
  formState,
  onChange,
  portalContainer,
  projectId,
}) => {
  const [aiLoading, setAiLoading] = useState(false);

  const { title, description, selectedLabels, selectedAssignee } = formState;

  // --- Data Fetching ---
  const { data: labels = [], isLoading: isLoadingLabels } =
    useGetProjectLabels(projectId);
  const { data: members = [], isLoading: isLoadingMembers } =
    useGetProjectMembers(projectId);

  const handleToggleLabel = (label: any) => {
    const isSelected = selectedLabels.some(l => l.id === label.id);
    const newLabels = isSelected
      ? selectedLabels.filter(l => l.id !== label.id)
      : [...selectedLabels, label];
    onChange({ selectedLabels: newLabels });
  };

  const handleAIRequest = () => {
    setAiLoading(true);
    setTimeout(() => {
      setAiLoading(false);
      toast.info('AI enhancement is coming soon!');
    }, 1000);
  };

  const TEMPLATES = {
    bug: `### Description\n[Description of the bug]\n\n### Reproduction Steps\n1. [Step 1]\n\n### Expected Behavior\n[What should happen]\n\n### Actual Behavior\n[What actually happened]`,
    feature: `### Problem Statement\n[What problem are we solving?]\n\n### User Story\nAs a [user], I want to [action] so that [benefit].`,
  };

  return (
    <div className="space-y-4 px-1">
      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Title
        </label>
        <Input
          placeholder="Issue title"
          value={title}
          onChange={e => onChange({ title: e.target.value })}
          className="h-9 text-sm bg-gray-50 border-gray-200 focus:bg-white transition-colors"
          autoFocus
        />
      </div>

      {/* Labels & Assignee Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Labels
          </label>
          <LabelPicker
            labels={labels}
            isLoading={isLoadingLabels}
            selectedLabels={selectedLabels}
            onToggle={handleToggleLabel}
            portalContainer={portalContainer}
            disabled={isLoadingLabels}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Assignee
          </label>
          <AssigneePicker
            members={members}
            isLoading={isLoadingMembers}
            selectedAssignee={selectedAssignee}
            onSelect={assignee => onChange({ selectedAssignee: assignee })}
            portalContainer={portalContainer}
            disabled={isLoadingMembers}
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Description
        </label>
        <DescriptionEditor
          content={description}
          onChange={desc => onChange({ description: desc })}
          templates={TEMPLATES}
          onAIRequest={handleAIRequest}
          aiLoading={aiLoading}
          portalContainer={portalContainer}
          className="min-h-[120px] text-sm"
        />
      </div>
    </div>
  );
};
