import React from 'react';
import { createRoot } from 'react-dom/client';
import { GeneratedDetailPage } from './generated-detail';
import '@/styles/globals.css';
import { NavigationProvider } from '@/contexts/navigation-context';
import { TestBlueprint } from '@/types/recording';
import { listRecordings } from '@/api/recording';

const GeneratedStandaloneApp = () => {
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
      try {
        const recordings = await listRecordings();
        const found = recordings.find((b: any) => b.id === id);
        setBlueprint((found as unknown as TestBlueprint) || null);
      } catch (error) {
        console.error('Failed to load generated script:', error);
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

  if (!blueprint) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-500">
        <h1 className="text-xl font-bold mb-2">Draft Not Found</h1>
        <p>The generated test script you are looking for does not exist or has been deleted.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      <NavigationProvider initialView={"generated-test-detail" as any} initialParams={blueprint}>
        <div className="max-w-4xl mx-auto h-full shadow-xl bg-white border-x">
          <GeneratedDetailPage blueprint={blueprint} />
        </div>
      </NavigationProvider>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<GeneratedStandaloneApp />);
}
