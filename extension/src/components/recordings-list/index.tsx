import React from 'react';
import rrwebRecorder from '@/services/rrweb-recorder';
import { storageService } from '@/services/storage';
import { Button } from '@/src/components/ui/ui/button';

interface Props {
  className?: string;
}

const formatTime = (ts?: number) => (ts ? new Date(ts).toLocaleString() : '-');

const RecordingsList: React.FC<Props> = ({ className }) => {
  const [items, setItems] = React.useState<Awaited<ReturnType<typeof rrwebRecorder.listRecordings>>>([]);
  const [loading, setLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await rrwebRecorder.listRecordings();
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    // Refresh when recordings index changes
    const unsub = storageService.onChanged('recordings' as any, () => {
      load();
    });
    return () => {
      unsub && unsub();
    };
  }, [load]);

  const handleExport = async (id: string) => {
    setExporting(id);
    try {
      const rec = await rrwebRecorder.loadRecording(id);
      if (!rec) return;
      // Try to include network events if available
      const network = await rrwebRecorder.loadNetworkEvents(id);
      const enriched = network ? { ...rec, network } : rec;
      const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(null);
    }
  };

  const handleDelete = async (id: string) => {
    await rrwebRecorder.deleteRecording(id);
    await load();
  };

  return (
    <div className={className}>
      <div className="p-3 text-xs text-gray-600">Stored locally in your browser.</div>
      {loading ? (
        <div className="p-4 text-sm text-gray-500">Loading recordings…</div>
      ) : items.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No recordings yet.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((r) => {
            const duration = r.endedAt && r.startedAt ? Math.max(0, Math.round((r.endedAt - r.startedAt) / 1000)) : 0;
            return (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{r.title || r.url}</div>
                  <div className="text-xs text-gray-500 truncate">{r.url}</div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    <span>Events: {r.eventCount}</span>
                    <span className="mx-2">•</span>
                    <span>Start: {formatTime(r.startedAt)}</span>
                    {r.endedAt && (
                      <>
                        <span className="mx-2">•</span>
                        <span>Duration: {duration}s</span>
                      </>
                    )}
                    {(r as any).consoleCount != null && (
                      <>
                        <span className="mx-2">•</span>
                        <span>Console: {(r as any).consoleCount}</span>
                      </>
                    )}
                    {(r as any).networkCount != null && (
                      <>
                        <span className="mx-2">•</span>
                        <span>Network: {(r as any).networkCount}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleExport(r.id)} disabled={exporting === r.id}>
                    {exporting === r.id ? 'Exporting…' : 'Export JSON'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecordingsList;
