import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VideoEditorPage from './index';
import '@/styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <QueryClientProvider client={queryClient}>
      <VideoEditorPage />
    </QueryClientProvider>
  );
}
