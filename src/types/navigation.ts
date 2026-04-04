export type ViewType =
  | 'issues'
  | 'issue-detail'
  | 'boards'
  | 'pinned'
  | 'create-issue'
  | 'profile'
  | 'agent'
  | 'recordings'
  | 'test-scenarios'
  | 'login'
  | 'loading'
  | 'recording-detail';

export interface NavigationState<T = any> {
  view: ViewType;
  params?: T;
  title?: string;
}

export interface NavigationContextValue {
  current: NavigationState;
  stack: NavigationState[];
  push: <T>(view: ViewType, params?: T) => void;
  pop: () => void;
  replace: <T>(view: ViewType, params?: T) => void;
  reset: <T>(view: ViewType, params?: T) => void;
  canGoBack: boolean;
}
