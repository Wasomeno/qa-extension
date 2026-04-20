/**
 * Formats a project display name to include the group/namespace
 * @param project - Project object with name and optional path_with_namespace or pathWithNamespace
 * @returns Formatted string in "GroupName / ProjectName" format, or just project name if no namespace
 */
export function formatProjectName(project: {
  name: string;
  path_with_namespace?: string;
  pathWithNamespace?: string;
}): string {
  const pathWithNamespace = project.path_with_namespace || project.pathWithNamespace;
  
  if (!pathWithNamespace) {
    return project.name;
  }

  // path_with_namespace format: "group/project-name"
  const parts = pathWithNamespace.split('/');
  if (parts.length < 2) {
    return project.name;
  }

  // Get group name (everything except the last part) and uppercase it
  const groupName = parts.slice(0, -1).join('/').toUpperCase();

  return `${groupName} / ${project.name}`;
}
