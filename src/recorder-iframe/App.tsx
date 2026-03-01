import React, { useState, useEffect, useRef } from 'react';
import { Square, Play } from 'lucide-react';
import { videoStorage } from '@/services/video-storage';
import { MessageType } from '@/types/messages';
import { RawEvent } from '@/types/recording';

const App = () => {
  const [targetRecordingId, setTargetRecordingId] = useState<string | null>(
    null
  );
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<RawEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  useEffect(() => {
    const handleMessage = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (message.type === 'IFRAME_PREPARE_RECORDING') {
        setTargetRecordingId(message.data?.id || `rec_${Date.now()}`);
        sendResponse({ success: true });
        return false;
      } else if (message.type === 'IFRAME_STOP_RECORDING') {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== 'inactive'
        ) {
          mediaRecorderRef.current.stop();
        }
        chrome.storage.local.set({ isRecording: false });
        sendResponse({ success: true });
        return false;
      } else if (message.type === 'IFRAME_LOG_EVENT') {
        if (isRecording) {
          setEvents(prev => [...prev, message.data]);
        }
        return false;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });

      streamRef.current = stream;
      recordedChunksRef.current = [];

      const supportedTypes = [
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9',
        'video/webm',
      ];
      const mimeType =
        supportedTypes.find(type => MediaRecorder.isTypeSupported(type)) ||
        'video/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const idToSave = targetRecordingId || `rec_${Date.now()}`;
        const blob = new Blob(recordedChunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        if (blob.size > 0) {
          try {
            await videoStorage.saveVideo(idToSave, blob);
            chrome.runtime
              .sendMessage({
                type: 'VIDEO_SAVED',
                data: { id: idToSave, success: true },
              })
              .catch(() => {});
          } catch (e) {
            console.error('Error saving video to IndexedDB:', e);
            chrome.runtime
              .sendMessage({
                type: 'VIDEO_SAVED',
                data: { id: idToSave, success: false, error: 'Failed to save' },
              })
              .catch(() => {});
          }
        }

        stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;
        streamRef.current = null;
        setIsRecording(false);
        setTargetRecordingId(null);
        chrome.runtime.sendMessage({ type: 'IFRAME_CLOSED_OVERLAY' });
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setEvents([]);

      chrome.runtime.sendMessage({
        type: 'ACTUAL_START_RECORDING',
        data: { id: targetRecordingId },
      });
      chrome.storage.local.set({
        isRecording: true,
        currentRecordingId: targetRecordingId,
      });

      stream.getVideoTracks()[0].onended = () => {
        requestStopRecording();
      };

      chrome.runtime.sendMessage({ type: 'IFRAME_STARTED_RECORDING' });
    } catch (error) {
      console.error('Error starting recording:', error);
      setTargetRecordingId(null);
      chrome.runtime.sendMessage({ type: 'IFRAME_CLOSED_OVERLAY' });
    }
  };

  const requestStopRecording = () => {
    chrome.runtime.sendMessage({ type: MessageType.STOP_RECORDING });
  };

  const cancelRecording = () => {
    setTargetRecordingId(null);
    chrome.runtime.sendMessage({ type: 'IFRAME_CLOSED_OVERLAY' });
  };

  if (!isRecording && !targetRecordingId) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{
        width: '100%',
        height: '100%',
        pointerEvents: isRecording ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: isRecording ? 'flex-end' : 'center',
        alignItems: isRecording ? 'flex-end' : 'center',
      }}
    >
      {!isRecording && targetRecordingId && (
        <div
          className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center border border-gray-100"
          style={{
            pointerEvents: 'auto',
            background: 'white',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #f3f4f6',
          }}
        >
          <h2
            className="text-xl font-bold mb-2 text-gray-900"
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              marginBottom: '8px',
              color: '#111827',
            }}
          >
            Ready to Record
          </h2>
          <p
            className="text-sm text-gray-600 mb-6"
            style={{ fontSize: '14px', color: '#4b5563', marginBottom: '24px' }}
          >
            Click the button below to select what you want to share and start
            recording.
          </p>
          <div
            className="flex gap-3 justify-center"
            style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}
          >
            <button
              onClick={cancelRecording}
              className="px-4 py-2 rounded-full font-medium text-gray-600 hover:bg-gray-100"
              style={{
                padding: '8px 16px',
                borderRadius: '9999px',
                fontWeight: '500',
                color: '#4b5563',
                background: '#f3f4f6',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-6 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 24px',
                borderRadius: '9999px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              <Play size={16} />
              Start Recording
            </button>
          </div>
        </div>
      )}

      {isRecording && (
        <div
          style={{
            pointerEvents: 'none', // Ensure the wrapper itself does not block
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px',
            marginBottom: '14px',
            marginRight: '10px',
            maxWidth: '300px',
          }}
        >
          <div
            className="bg-white/95 backdrop-blur-md border border-red-200 rounded-xl p-3 shadow-2xl mb-2 min-w-[220px] max-w-[280px]"
            style={{
              pointerEvents: 'auto', // Explicitly allow clicks here
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid #fee2e2',
              borderRadius: '12px',
              padding: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              marginBottom: '8px',
              minWidth: '220px',
              maxWidth: '280px',
              width: '280px',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2 h-2 rounded-full bg-red-500 animate-pulse"
                style={{ backgroundColor: '#ef4444' }}
              />
              <span
                className="text-[10px] font-bold text-red-600 uppercase tracking-wider"
                style={{ color: '#dc2626' }}
              >
                Recording
              </span>
            </div>
            <div
              ref={scrollRef}
              className="max-h-40 overflow-y-auto overflow-x-hidden custom-scrollbar w-full"
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                overflowX: 'hidden',
                width: '100%',
              }}
            >
              {events.length === 0 ? (
                <p
                  className="text-[10px] text-gray-400 italic"
                  style={{ fontSize: '10px', color: '#9ca3af' }}
                >
                  Waiting for clicks...
                </p>
              ) : (
                <div
                  className="space-y-1.5 w-full"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    width: '100%',
                  }}
                >
                  {events.map((e, i) => (
                    <div
                      key={i}
                      className="text-[10px] border-b border-gray-50 pb-1 w-full"
                      style={{
                        fontSize: '10px',
                        borderBottom: '1px solid #f9fafb',
                        paddingBottom: '4px',
                        width: '100%',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        className="font-bold text-gray-900 truncate w-full"
                        style={{
                          fontWeight: 'bold',
                          color: '#111827',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.type}
                      </div>
                      <div
                        className="text-gray-500 w-full"
                        style={{
                          color: '#6b7280',
                          overflow: 'hidden',
                          whiteSpace: 'normal',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: '1.25',
                          width: '100%',
                        }}
                      >
                        {e.element.selector}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={requestStopRecording}
            className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 bg-red-600 text-white hover:bg-red-700"
            style={{
              pointerEvents: 'auto', // Explicitly allow clicks here
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              fontWeight: '600',
              fontSize: '14px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
          >
            <Square className="w-3.5 h-3.5 fill-current" size={14} />
            <span>Stop Recording</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
