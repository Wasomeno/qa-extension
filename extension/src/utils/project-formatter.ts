/**
 * Formats a project display name to include the group/namespace
 * @param project - Project object with name and optional path_with_namespace
 * @returns Formatted string in "GroupName / ProjectName" format, or just project name if no namespace
 */
export function formatProjectName(project: {
  name: string;
  path_with_namespace?: string;
}): string {
  if (!project.path_with_namespace) {
    return project.name;
  }

  // path_with_namespace format: "group/project-name"
  const parts = project.path_with_namespace.split('/');
  if (parts.length < 2) {
    return project.name;
  }

  // Get group name (everything except the last part) and uppercase it
  const groupName = parts.slice(0, -1).join('/').toUpperCase();

  return `${groupName} / ${project.name}`;
}
