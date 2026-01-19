import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { CreateIssueRequest } from '@/api/issue';
import { useCreateIssue } from '../hooks/use-create-issue';
import { IssueFormFields, IssueFormState } from './issue-form-fields';

interface SingleIssueTabProps {
  portalContainer?: HTMLElement | null;
}

const DEFAULT_FORM_STATE: IssueFormState = {
  title: '',
  description: '',
  selectedProject: null,
  selectedLabels: [],
  selectedAssignee: null,
};

export const SingleIssueTab: React.FC<SingleIssueTabProps> = ({
  portalContainer,
}) => {
  const [formState, setFormState] =
    useState<IssueFormState>(DEFAULT_FORM_STATE);

  const createIssueMutation = useCreateIssue({
    onSuccess: () => {
      toast.success('Issue created successfully');
      setFormState(DEFAULT_FORM_STATE);
    },
    onError: error => {
      console.error('Failed to create issue:', error);
      toast.error('Failed to create issue. Please try again.');
    },
  });

  const handleCreateSingleIssue = () => {
    const {
      title,
      description,
      selectedProject,
      selectedAssignee,
      selectedLabels,
    } = formState;
    if (!selectedProject || !title) return;

    const request: CreateIssueRequest = {
      title,
      description,
      assignee_ids: selectedAssignee ? [selectedAssignee.id] : [],
      labels: selectedLabels.map(l => l.name),
    };

    createIssueMutation.mutate({ projectId: selectedProject.id, request });
  };

  return (
    <div className="space-y-6 max-w-2xl mt-0">
      <IssueFormFields
        formState={formState}
        onChange={updates => setFormState(prev => ({ ...prev, ...updates }))}
        portalContainer={portalContainer}
      />

      <div className="flex gap-3 pt-4">
        <Button
          className="flex-1"
          size="lg"
          onClick={handleCreateSingleIssue}
          disabled={
            !formState.selectedProject ||
            !formState.title ||
            createIssueMutation.isPending
          }
        >
          {createIssueMutation.isPending && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          Create Issue
        </Button>
        <Button variant="secondary" size="lg">
          Save Draft
        </Button>
      </div>
    </div>
  );
};
