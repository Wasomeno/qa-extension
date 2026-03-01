import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { CreateIssueRequest } from '@/api/issue';
import { uploadProjectFile } from '@/api/project';
import { videoStorage } from '@/services/video-storage';
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
  selectedRecording: null,
};

export const SingleIssueTab: React.FC<SingleIssueTabProps> = ({
  portalContainer,
}) => {
  const [formState, setFormState] =
    useState<IssueFormState>(DEFAULT_FORM_STATE);
  const [isUploading, setIsUploading] = useState(false);

  const createIssueMutation = useCreateIssue({
    onSuccess: () => {
      toast.success('Issue created successfully');
      setFormState(DEFAULT_FORM_STATE);
    },
    onError: error => {
      toast.error('Failed to create issue. Please try again.');
    },
  });

  const handleCreateSingleIssue = async () => {
    const {
      title,
      description,
      selectedProject,
      selectedAssignee,
      selectedLabels,
      selectedRecording,
    } = formState;
    if (!selectedProject || !title) return;

    let finalDescription = description;

    if (selectedRecording) {
      setIsUploading(true);
      try {
        const videoBlob = await videoStorage.getVideo(selectedRecording.id);
        if (videoBlob) {
          const fileName = `${selectedRecording.name.replace(/\s+/g, '_')}_${Date.now()}.mp4`;
          const uploadResult = await uploadProjectFile(selectedProject.id, videoBlob, fileName);

          if (uploadResult.success && uploadResult.data?.markdown) {
            const videoMarkdown = uploadResult.data.markdown;
            
            if (finalDescription.includes('### Evidence')) {
              finalDescription = finalDescription.replace(
                /### Evidence/,
                `### Evidence\n\n${videoMarkdown}`
              );
            } else {
              // Try to insert before Notes or at the end
              if (finalDescription.includes('### Notes:')) {
                finalDescription = finalDescription.replace(
                  /### Notes:/,
                  `### Evidence\n\n${videoMarkdown}\n\n### Notes:`
                );
              } else {
                finalDescription = `${finalDescription}\n\n### Evidence\n\n${videoMarkdown}`;
              }
            }
          } else {
            toast.error(uploadResult.error || 'Failed to upload recording. Creating issue without it.');
          }
        }
      } catch (e) {
        console.error('Failed to process recording upload:', e);
        toast.error('Failed to process recording upload. Creating issue without it.');
      } finally {
        setIsUploading(false);
      }
    }

    const request: CreateIssueRequest = {
      title,
      description: finalDescription,
      assignee_ids: selectedAssignee ? [selectedAssignee.id] : [],
      labels: selectedLabels.map(l => l.name),
    };

    createIssueMutation.mutate({ projectId: selectedProject.id, request });
  };

  return (
    <div className="space-y-6 mt-0">
      <IssueFormFields
        formState={formState}
        onChange={updates => setFormState(prev => ({ ...prev, ...updates }))}
        portalContainer={portalContainer}
      />
      <div className="flex justify-center">
        <Button
          className="flex-1 max-w-sm"
          size="lg"
          onClick={handleCreateSingleIssue}
          disabled={
            !formState.selectedProject ||
            !formState.title ||
            createIssueMutation.isPending ||
            isUploading
          }
        >
          {(createIssueMutation.isPending || isUploading) && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          {isUploading ? 'Uploading Recording...' : 'Create Issue'}
        </Button>
      </div>
    </div>
  );
};
