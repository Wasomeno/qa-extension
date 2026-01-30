import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { CreateIssueWithChildRequest } from '@/api/issue';
import { useCreateIssueWithChild } from '../hooks/use-create-issue-with-child';
import { IssueFormFields, IssueFormState } from './issue-form-fields';

interface IssueWithChildTabProps {
  portalContainer?: HTMLElement | null;
}

const DEFAULT_FORM_STATE: IssueFormState = {
  title: '',
  description: '',
  selectedProject: null,
  selectedLabels: [],
  selectedAssignee: null,
};

export const IssueWithChildTab: React.FC<IssueWithChildTabProps> = ({
  portalContainer,
}) => {
  const [parentIssueState, setParentIssueState] =
    useState<IssueFormState>(DEFAULT_FORM_STATE);
  const [childIssues, setChildIssues] = useState<
    (IssueFormState & { id: string })[]
  >([{ id: uuidv4(), ...DEFAULT_FORM_STATE }]);

  const createIssueWithChildMutation = useCreateIssueWithChild({
    onSuccess: () => {
      toast.success('Parent and child issues created successfully');
      setParentIssueState(DEFAULT_FORM_STATE);
      setChildIssues([{ id: uuidv4(), ...DEFAULT_FORM_STATE }]);
    },
    onError: error => {
      console.error('Failed to create issues:', error);
      toast.error('Failed to create issues. Please try again.');
    },
  });

  const handleCreateParentAndChildren = async () => {
    const {
      title,
      description,
      selectedProject,
      selectedAssignee,
      selectedLabels,
    } = parentIssueState;

    if (!selectedProject || !title) {
      toast.error('Parent issue must have a project and title');
      return;
    }

    if (childIssues.length === 0) {
      toast.error('At least one child issue is required');
      return;
    }

    const request: CreateIssueWithChildRequest = {
      title,
      description,
      assignee_ids: selectedAssignee ? [selectedAssignee.id] : [],
      labels: selectedLabels.map(l => l.name),
      child_issues: childIssues.map(child => ({
        title: child.title,
        description: child.description,
        assignee_ids: child.selectedAssignee ? [child.selectedAssignee.id] : [],
        labels: child.selectedLabels.map(l => l.name),
      })),
    };

    createIssueWithChildMutation.mutate({
      projectId: selectedProject.id,
      request,
    });
  };

  const addChildIssue = () => {
    setChildIssues(prev => [...prev, { id: uuidv4(), ...DEFAULT_FORM_STATE }]);
  };

  const removeChildIssue = (id: string) => {
    if (childIssues.length <= 1) return;
    setChildIssues(prev => prev.filter(c => c.id !== id));
  };

  const updateChildIssue = (id: string, updates: any) => {
    setChildIssues(prev =>
      prev.map(c => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  return (
    <div className="space-y-8 mt-0">
      {/* Parent Issue Form */}
      <div className="border-b pb-6">
        <IssueFormFields
          formState={parentIssueState}
          onChange={updates =>
            setParentIssueState(prev => ({ ...prev, ...updates }))
          }
          portalContainer={portalContainer}
        />
      </div>

      {/* Child Issues */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Child Issues</h2>
          <Button onClick={addChildIssue} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>

        <Accordion
          type="multiple"
          defaultValue={[childIssues[0]?.id]}
          className="space-y-4"
        >
          {childIssues.map((child, index) => (
            <AccordionItem
              key={child.id}
              value={child.id}
              className="border rounded-lg px-4 bg-white"
            >
              <div className="flex items-center w-full">
                <AccordionTrigger className="flex-1 hover:no-underline py-4">
                  <span className="font-medium text-gray-700">
                    {child.title || `Child Issue #${index + 1}`}
                  </span>
                </AccordionTrigger>
                {childIssues.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 text-gray-400 hover:text-red-500"
                    onClick={e => {
                      e.stopPropagation();
                      removeChildIssue(child.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <AccordionContent className="pt-2 pb-6 px-1">
                <IssueFormFields
                  formState={{
                    ...child,
                    selectedProject: parentIssueState.selectedProject, // Inherit project
                  }}
                  onChange={updates => updateChildIssue(child.id, updates)}
                  portalContainer={portalContainer}
                  hideProjectPicker={true}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      <div className="flex justify-center">
        <Button
          className="flex-1 max-w-sm"
          size="lg"
          onClick={handleCreateParentAndChildren}
          disabled={
            !parentIssueState.selectedProject ||
            !parentIssueState.title ||
            childIssues.length === 0 ||
            createIssueWithChildMutation.isPending
          }
        >
          {createIssueWithChildMutation.isPending && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          Create Issue with {childIssues.length} Children
        </Button>
      </div>
    </div>
  );
};
