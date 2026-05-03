import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VideoEditorPage from './index';
import '@/styles/globals.css';
import { AlertCircle } from 'lucide-react';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[VideoEditor Boundary] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-zinc-50 text-zinc-900 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6 border border-red-100">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold mb-2 text-zinc-900">Video Editor Crashed</h1>
          <p className="text-sm text-zinc-500 mb-8 max-w-md mx-auto leading-relaxed">
            {this.state.error?.message || 'An unexpected error occurred during rendering.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-all shadow-md font-medium"
          >
            Reload Editor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 300_000,
      gcTime: 300_000,
    },
  },
});

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <VideoEditorPage />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
