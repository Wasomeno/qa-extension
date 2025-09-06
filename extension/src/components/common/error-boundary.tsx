import React from 'react';

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  fallbackRender?: (error: Error) => React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('IssueList ErrorBoundary caught', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender(this.state.error);
      }
      return (
        this.props.fallback || (
          <div className="p-4 text-xs text-red-600">Something went wrong loading this view.</div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
