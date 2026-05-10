import React from 'react';
import { createRoot } from 'react-dom/client';
import { RecordingDetailPage } from './detail';
import '@/styles/globals.css';
import { NavigationProvider } from '@/contexts/navigation-context';
import { TestBlueprint } from '@/types/recording';
import { getRecording } from '@/api/recording';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[StandaloneDetail] Rendering crashed:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-500 p-8">
          <h1 className="text-xl font-bold mb-2 text-red-600">Something went wrong</h1>
          <p className="text-sm text-center max-w-md">{this.state.errorMessage}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const StandaloneDetailApp = () => {
  const [blueprint, setBlueprint] = React.useState<TestBlueprint | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      setError('No recording ID provided');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const result = await getRecording(id);
        

        if (!result || typeof result !== 'object') {
          setError('Invalid response from server');
          return;
        }

        const bp = result as unknown as TestBlueprint;
        if (!Array.isArray(bp.steps)) {
          console.warn('[StandaloneDetail] Missing or invalid steps, defaulting to empty array');
          bp.steps = [];
        }
        setBlueprint(bp);
      } catch (error) {
        console.error('Failed to load recording:', error);
        setError('Failed to load recording. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-500">
        <h1 className="text-xl font-bold mb-2 text-red-600">Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!blueprint) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-500">
        <h1 className="text-xl font-bold mb-2">Recording Not Found</h1>
        <p>The recording you are looking for does not exist or has been deleted.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 overflow-hidden w-full">
      <NavigationProvider initialView="recording-detail" initialParams={blueprint}>
        <div className="w-full h-full bg-white">
          <ErrorBoundary>
            <RecordingDetailPage blueprint={blueprint} />
          </ErrorBoundary>
        </div>
      </NavigationProvider>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<StandaloneDetailApp />);
}
