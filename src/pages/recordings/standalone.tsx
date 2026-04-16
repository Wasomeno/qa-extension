import React from 'react';
import { createRoot } from 'react-dom/client';
import { RecordingDetailPage } from './detail';
import '@/styles/globals.css';
import { NavigationProvider } from '@/contexts/navigation-context';
import { TestBlueprint } from '@/types/recording';
import { listRecordings } from '@/api/recording';

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
      try {
        const result = await listRecordings();
        console.log('[StandaloneDetail] API result:', result);
        
        // Handle both array response and paginated response { data: [...] }
        let recordings: any[] = [];
        if (result && typeof result === 'object' && !Array.isArray(result) && 'data' in result) {
          recordings = (result as any).data || [];
          console.log('[StandaloneDetail] Using paginated response, found recordings:', recordings.length);
        } else if (Array.isArray(result)) {
          recordings = result;
          console.log('[StandaloneDetail] Using array response, found recordings:', recordings.length);
        } else {
          console.warn('[StandaloneDetail] Unexpected API response format:', result);
        }
        
        console.log('[StandaloneDetail] Looking for ID:', id);
        recordings.forEach(r => console.log('[StandaloneDetail] Recording ID:', r.id, 'Name:', r.name));
        
        const found = recordings.find((b: any) => b.id === id);
        console.log('[StandaloneDetail] Found blueprint:', found);
        setBlueprint(found as unknown as TestBlueprint || null);
      } catch (error) {
        console.error('Failed to load recordings:', error);
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
