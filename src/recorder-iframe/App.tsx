import React, { useState, useEffect, useRef } from 'react';
import { Square, Play } from 'lucide-react';
import { MessageType } from '@/types/messages';
import { RawEvent } from '@/types/recording';

// Bridge messages between content script and iframe using postMessage
const CONTENT_SCRIPT_MESSAGE_TYPE = '__QA_EXTENSION_MESSAGE__';

interface BridgeMessage {
  type: string;
  message?: {
    type: string;
    data?: any;
  };
  data?: any;
}

const App = () => {
  const [targetRecordingId, setTargetRecordingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Guard against multiple clicks
  const isStartingRef = useRef(false);

  // Use refs to avoid stale closure issues
  const isRecordingRef = useRef(isRecording);
  const targetRecordingIdRef = useRef(targetRecordingId);

  // Keep refs in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    targetRecordingIdRef.current = targetRecordingId;
  }, [targetRecordingId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Listen for messages from parent page (content script) via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const bridgeMessage = event.data as BridgeMessage;
      
      // Only accept our bridge messages
      if (!bridgeMessage || bridgeMessage.type !== CONTENT_SCRIPT_MESSAGE_TYPE) return;
      
      const { type, data } = bridgeMessage.message || {};
      console.log('[Recorder Iframe] Message received from parent:', type, 'data:', data);

      if (type === MessageType.IFRAME_PREPARE_RECORDING) {
        // Only set if not already recording and not already set
        if (isRecordingRef.current) {
          console.log('[Recorder Iframe] Already recording, ignoring IFRAME_PREPARE_RECORDING');
          return;
        }
        if (targetRecordingIdRef.current) {
          console.log('[Recorder Iframe] targetRecordingId already set, ignoring IFRAME_PREPARE_RECORDING');
          return;
        }
        const id = data?.id || `rec_${Date.now()}`;
        console.log('[Recorder Iframe] Setting targetRecordingId:', id);
        setTargetRecordingId(id);
        setError(null);
      } else if (type === MessageType.IFRAME_STOP_RECORDING) {
        console.log('[Recorder Iframe] IFRAME_STOP_RECORDING received');
        setIsRecording(false);
        setTargetRecordingId(null);
        setEvents([]);
        chrome.storage.local.set({ isRecording: false });
      } else if (type === MessageType.IFRAME_LOG_EVENT) {
        if (isRecordingRef.current) {
          setEvents(prev => [...prev, data]);
        }
      } else if (type === 'RECORDING_CONFIRMED') {
        // Recording has been confirmed by content script, ensure state is correct
        console.log('[Recorder Iframe] Recording confirmed by content script, current isRecordingRef:', isRecordingRef.current);
        if (!isRecordingRef.current) {
          console.log('[Recorder Iframe] Setting isRecording to true (from confirmation)');
          setIsRecording(true);
        }
      } else if (type === MessageType.RECORDING_ERROR) {
        console.error('[Recorder Iframe] Recording error:', data?.error);
        isStartingRef.current = false;
        setError(data?.error || 'Failed to start recording');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Helper to send message to parent (content script)
  const sendToParent = (message: { type: string; data?: any }) => {
    console.log('[Recorder Iframe] sendToParent called with:', message);
    console.log('[Recorder Iframe] window.parent:', window.parent ? 'exists' : 'undefined');
    console.log('[Recorder Iframe] window.parent === window:', window.parent === window);
    
    try {
      // Check if we have a valid parent window reference
      if (!window.parent) {
        console.error('[Recorder Iframe] No parent window available');
        return;
      }
      
      if (window.parent === window) {
        console.log('[Recorder Iframe] window.parent === window (not in iframe), skipping postMessage');
        return;
      }
      
      const bridgeMessage = {
        type: CONTENT_SCRIPT_MESSAGE_TYPE,
        message: message,
      };
      console.log('[Recorder Iframe] Sending to parent:', JSON.stringify(bridgeMessage));
      window.parent.postMessage(bridgeMessage, '*');
      console.log('[Recorder Iframe] postMessage called successfully');
    } catch (e) {
      console.error('[Recorder Iframe] Failed to send message to parent:', e);
    }
  };

  const startDomRecording = async (id: string) => {
    console.log('[Recorder Iframe] Starting DOM recording with id:', id);

    // Don't set isRecording yet - wait for confirmation from content script
    setEvents([]);
    setError(null);
    console.log('[Recorder Iframe] State updated, waiting for confirmation');

    try {
      console.log('[Recorder Iframe] Attempting to set storage...');
      await chrome.storage.local.set({
        isRecording: true,
        currentRecordingId: id,
      });
      console.log('[Recorder Iframe] Storage set successfully');

      // Send actual start recording to background via content script
      console.log('[Recorder Iframe] Calling sendToParent for ACTUAL_START_RECORDING...');
      sendToParent({
        type: 'ACTUAL_START_RECORDING',
        data: { id },
      });
      console.log('[Recorder Iframe] sendToParent called for ACTUAL_START_RECORDING');

      // Send started event to content script
      console.log('[Recorder Iframe] Calling sendToParent for IFRAME_STARTED_RECORDING...');
      sendToParent({
        type: MessageType.IFRAME_STARTED_RECORDING,
      });
      console.log('[Recorder Iframe] sendToParent called for IFRAME_STARTED_RECORDING');

      console.log('[Recorder Iframe] Waiting for confirmation from content script');
    } catch (error) {
      console.error('[Recorder Iframe] Error starting DOM recording:', error);
      setError(error instanceof Error ? error.message : 'Failed to start recording');
      setTargetRecordingId(null);
      isStartingRef.current = false;
      try {
        await chrome.storage.local.remove(['isRecording', 'currentRecordingId']);
      } catch (e) {
        console.error('[Recorder Iframe] Failed to clear storage:', e);
      }
      sendToParent({
        type: MessageType.IFRAME_CLOSED_OVERLAY,
      });
    }
  };

  const startRecording = () => {
    // Prevent multiple clicks
    if (isStartingRef.current) {
      console.log('[Recorder Iframe] Already starting, ignoring click');
      return;
    }
    
    const currentId = targetRecordingIdRef.current;
    if (currentId && !isRecordingRef.current) {
      console.log('[Recorder Iframe] User clicked Start Recording, id:', currentId);
      isStartingRef.current = true;
      startDomRecording(currentId).finally(() => {
        // Reset the guard after a short delay to allow future starts
        setTimeout(() => {
          isStartingRef.current = false;
        }, 1000);
      });
    } else if (isRecordingRef.current) {
      console.log('[Recorder Iframe] Already recording, ignoring click');
    } else {
      console.error('[Recorder Iframe] No targetRecordingId available');
      setError('Recording ID not available');
    }
  };

  const requestStopRecording = () => {
    console.log('[Recorder Iframe] User clicked Stop Recording');
    setIsRecording(false);
    setTargetRecordingId(null);
    setEvents([]);
    sendToParent({
      type: MessageType.STOP_RECORDING,
    });
  };

  const cancelRecording = () => {
    console.log('[Recorder Iframe] User cancelled recording');
    isStartingRef.current = false;
    setTargetRecordingId(null);
    setIsRecording(false);
    setEvents([]);
    setError(null);
    chrome.storage.local.remove(['isRecording', 'currentRecordingId']);
    chrome.action.setBadgeText({ text: '' });
    sendToParent({
      type: MessageType.IFRAME_CLOSED_OVERLAY,
    });
  };

  // Show nothing if no recording state
  if (!isRecording && !targetRecordingId) {
    console.log('[Recorder Iframe] Rendering: showing nothing (isRecording=false, targetRecordingId=null)');
    return null;
  }

  console.log('[Recorder Iframe] Rendering: isRecording=', isRecording, 'targetRecordingId=', targetRecordingId);

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
      {/* Confirmation Popup - shown when not recording but have a target ID */}
      {!isRecording && targetRecordingId && (
        <div
          className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center border border-gray-100"
          style={{
            pointerEvents: 'auto',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #f3f4f6',
          }}
        >
          <h2
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
            style={{
              fontSize: '14px',
              color: '#4b5563',
              marginBottom: '16px',
            }}
          >
            Click the button below to select what you want to share and start recording.
          </p>

          {error && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                borderColor: '#fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                border: '1px solid #fecaca',
              }}
            >
              <p style={{ fontSize: '12px', color: '#dc2626' }}>
                {error}
              </p>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={cancelRecording}
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

      {/* Recording UI - shown when recording is active */}
      {isRecording && (
        <div
          style={{
            pointerEvents: 'none',
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
            style={{
              pointerEvents: 'auto',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  animation: 'pulse 1s infinite',
                }}
              />
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: '#dc2626',
                  textTransform: 'uppercase',
                }}
              >
                Recording
              </span>
            </div>
            <div
              ref={scrollRef}
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                overflowX: 'hidden',
                width: '100%',
              }}
            >
              {events.length === 0 ? (
                <p
                  style={{
                    fontSize: '10px',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                  }}
                >
                  Waiting for clicks...
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                  {events.map((e, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '10px',
                        borderBottom: '1px solid #f9fafb',
                        paddingBottom: '4px',
                        width: '100%',
                        overflow: 'hidden',
                      }}
                    >
                      <div
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
                        style={{
                          color: '#6b7280',
                          wordBreak: 'break-word',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: '1.25',
                        }}
                      >
                        {e.element?.selector || 'No selector'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={requestStopRecording}
            style={{
              pointerEvents: 'auto',
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
