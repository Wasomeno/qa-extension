import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { storageService } from '@/services/storage';
import { GitLabProject } from '@/types/project';

const STORAGE_KEY = 'selectedProject';
const STORAGE_ID_KEY = 'selectedProjectId';
const STORAGE_NAME_KEY = 'selectedProjectName';
const STORAGE_PATH_KEY = 'selectedProjectPath';

interface SelectedProjectContextValue {
  selectedProject: GitLabProject | null;
  selectedProjectId: string | null;
  setSelectedProject: (project: GitLabProject | null) => void;
  isLoaded: boolean;
}

const SelectedProjectContext = createContext<SelectedProjectContextValue | undefined>(undefined);

interface SelectedProjectProviderProps {
  children: ReactNode;
}

export const SelectedProjectProvider: React.FC<SelectedProjectProviderProps> = ({ children }) => {
  const [selectedProject, setSelectedProjectState] = useState<GitLabProject | null>(null);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted project on mount
  useEffect(() => {
    const loadPersistedProject = async () => {
      try {
        const [storedProject, storedId, storedName, storedPath] = await Promise.all([
          storageService.get(STORAGE_KEY),
          storageService.get(STORAGE_ID_KEY),
          storageService.get(STORAGE_NAME_KEY),
          storageService.get(STORAGE_PATH_KEY),
        ]);

        if (storedProject) {
          setSelectedProjectState(storedProject);
          setSelectedProjectIdState(storedId);
        } else if (storedId && storedName) {
          // If we have an ID and name but no full project object, reconstruct a minimal project object
          // This handles the case where projects list hasn't loaded yet
          const reconstructedProject = {
            id: parseInt(storedId, 10),
            name: storedName,
            description: '',
            path: '',
            path_with_namespace: storedPath || storedName,
            web_url: '',
            avatar_url: '',
          } as GitLabProject;
          setSelectedProjectState(reconstructedProject);
          setSelectedProjectIdState(storedId);
        }
      } catch (error) {
        console.warn('Failed to load selected project:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadPersistedProject();
  }, []);

  const setSelectedProject = useCallback((project: GitLabProject | null) => {
    setSelectedProjectState(project);
    setSelectedProjectIdState(project?.id.toString() ?? null);

    // Persist to chrome.storage.local
    if (project) {
      storageService.set(STORAGE_KEY, project);
      storageService.set(STORAGE_ID_KEY, project.id.toString());
      storageService.set(STORAGE_NAME_KEY, project.name);
      storageService.set(STORAGE_PATH_KEY, project.path_with_namespace || project.name);
    } else {
      storageService.remove(STORAGE_KEY);
      storageService.remove(STORAGE_ID_KEY);
      storageService.remove(STORAGE_NAME_KEY);
      storageService.remove(STORAGE_PATH_KEY);
    }
  }, []);

  return (
    <SelectedProjectContext.Provider
      value={{
        selectedProject,
        selectedProjectId,
        setSelectedProject,
        isLoaded,
      }}
    >
      {children}
    </SelectedProjectContext.Provider>
  );
};

export const useSelectedProject = () => {
  const context = useContext(SelectedProjectContext);
  if (!context) {
    throw new Error('useSelectedProject must be used within a SelectedProjectProvider');
  }
  return context;
};

// Helper to sync ProjectSelect with persisted state
export const usePersistedProjectId = () => {
  const { selectedProjectId, setSelectedProject } = useSelectedProject();
  return { selectedProjectId, setSelectedProject };
};
