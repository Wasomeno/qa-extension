import React, { useState, useEffect, useRef } from 'react';
import { Square, Play } from 'lucide-react';

const CONTENT_SCRIPT_MESSAGE_TYPE = '__QA_EXTENSION_MESSAGE__';

const App = () => {
  const [view, setView] = useState<'recording' | 'editor'>('recording');
  const [targetRecordingId, setTargetRecordingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    
    window.parent.postMessage({ 
      type: CONTENT_SCRIPT_MESSAGE_TYPE, 
      message: { type: 'IFRAME_READY' } 
    }, '*');
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== CONTENT_SCRIPT_MESSAGE_TYPE) return;
      const { type, data } = event.data.message || {};
      

      if (type === 'IFRAME_PREPARE_RECORDING') {
        setTargetRecordingId(data?.id || 'rec_test');
        setView('recording');
      } else if (type === 'OPEN_VIDEO_EDITOR_MODAL') {
        setTargetRecordingId(data?.recordingId);
        setView('editor');
      } else if (type === 'RECORDING_CONFIRMED') {
        setIsRecording(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const start = () => {
    window.parent.postMessage({ 
      type: CONTENT_SCRIPT_MESSAGE_TYPE, 
      message: { type: 'ACTUAL_START_RECORDING', data: { id: targetRecordingId } } 
    }, '*');
  };

  if (view === 'editor') {
    return (
      <div style={{ background: 'white', padding: '40px', textAlign: 'center', height: '100vh' }}>
        <h1 style={{ color: 'black' }}>Video Editor (Mock)</h1>
        <p style={{ color: 'gray' }}>Recording ID: {targetRecordingId}</p>
        <button onClick={() => window.parent.postMessage({ type: CONTENT_SCRIPT_MESSAGE_TYPE, message: { type: 'IFRAME_CLOSED_OVERLAY' } }, '*')} style={{ padding: '10px 20px', background: '#000', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}>
          Close Modal
        </button>
      </div>
    );
  }

  if (!isRecording && !targetRecordingId) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      {!isRecording ? (
        <div style={{ background: 'white', padding: '32px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center', border: '1px solid #eee' }}>
          <h2 style={{ color: 'black', margin: '0 0 8px 0' }}>Ready to Record</h2>
          <p style={{ color: 'gray', margin: '0 0 24px 0' }}>Debug Build: Communication Check</p>
          <button onClick={start} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
            Start Recording
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default App;
