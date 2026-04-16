import React from 'react';
import { Filter } from 'lucide-react';
import { ProjectSelect } from '@/components/project-select';

interface ProjectFilterProps {
  selectedProjectIds: (number | string)[];
  onSelect: (projectId: number | string) => void;
  className?: string;
  portalContainer?: HTMLDivElement | null;
  singleSelect?: boolean;
}

export function ProjectFilter({
  selectedProjectIds,
  onSelect,
  className,
  portalContainer,
  singleSelect,
}: ProjectFilterProps) {
  const selectedId =
    selectedProjectIds.length === 1 ? selectedProjectIds[0] : null;

  return (
    <ProjectSelect
      value={selectedId}
      onSelect={project => {
        if (project) {
          onSelect(project.id);
        }
      }}
      mode="single"
      portalContainer={portalContainer}
      className={className}
      placeholder="Filter projects..."
      extraOptions={{
        unassigned: false,
        allProjects: selectedProjectIds.length === 0,
      }}
    />
  );
}
