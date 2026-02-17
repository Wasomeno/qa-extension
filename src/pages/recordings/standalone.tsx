import React from 'react';
import { createRoot } from 'react-dom/client';
import { RecordingDetailPage } from './detail';
import '@/styles/globals.css';
import { NavigationProvider } from '@/contexts/navigation-context';
import { TestBlueprint } from '@/types/recording';
import { storageService } from '@/services/storage';

const StandaloneDetailApp = () => {
  const [blueprint, setBlueprint] = React.useState<TestBlueprint | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      const blueprints = await storageService.get('test-blueprints') || [];
      const found = blueprints.find((b: TestBlueprint) => b.id === id);
      setBlueprint(found || null);
      setLoading(false);
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

  if (!blueprint) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-500">
        <h1 className="text-xl font-bold mb-2">Recording Not Found</h1>
        <p>The recording you are looking for does not exist or has been deleted.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      <NavigationProvider initialView="recording-detail" initialParams={blueprint}>
        <div className="max-w-5xl mx-auto h-full shadow-xl bg-white border-x">
          <RecordingDetailPage blueprint={blueprint} />
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
