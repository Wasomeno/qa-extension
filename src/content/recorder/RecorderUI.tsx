import React, { useState, useEffect, useRef } from 'react';
import { EventLogger } from './event-logger';
import { MessageType, ExtensionMessage } from '@/types/messages';
import { RawEvent } from '@/types/recording';
import { Square } from 'lucide-react';

interface RecorderUIProps {
  shadowHostId: string;
}

const RecorderUI: React.FC<RecorderUIProps> = ({ shadowHostId }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<RawEvent[]>([]);
  const eventsRef = useRef<RawEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    eventsRef.current = events;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const [logger] = useState(() => new EventLogger(shadowHostId, (event) => {
    setEvents(prev => [...prev, event]);
  }));

  useEffect(() => {
    // 1. Check injected global state first (fastest)
    const injectedState = (window as any).__QA_RECORDING_STATE__;
    if (injectedState?.isRecording) {
      logger.start();
      setIsRecording(true);
    }

    // 2. Check storage
    chrome.storage.local.get(['isRecording'], (result) => {
      if (result.isRecording) {
        logger.start();
        setIsRecording(true);
      }
    });

    const handleMessage = (message: ExtensionMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      if (message.type === MessageType.START_RECORDING) {
        logger.start();
        setIsRecording(true);
        if (message.data?.resetEvents !== false) setEvents([]);
        sendResponse?.({ success: true });
      } else if (message.type === MessageType.STOP_RECORDING) {
        logger.stop();
        setIsRecording(false);
        sendResponse?.({ success: true, events: eventsRef.current });
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.isRecording) {
        const newValue = changes.isRecording.newValue;
        if (newValue) {
          logger.start();
          setIsRecording(true);
        } else {
          logger.stop();
          setIsRecording(false);
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [logger]);

  const toggleRecording = () => {
    const newState = !isRecording;
    if (newState) {
      logger.start();
      setIsRecording(true);
      setEvents([]);
      chrome.runtime.sendMessage({ type: MessageType.START_RECORDING });
    } else {
      logger.stop();
      setIsRecording(false);
      chrome.runtime.sendMessage({ type: MessageType.STOP_RECORDING });
    }
    chrome.storage.local.set({ isRecording: newState });
  };

  if (!isRecording) return null;

  return (
    <div 
      className="fixed bottom-6 right-6 flex flex-col items-end gap-2 pointer-events-auto"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        pointerEvents: 'auto',
      }}
    >
      {isRecording && (
        <div 
          className="bg-white/95 backdrop-blur-md border border-red-200 rounded-xl p-3 shadow-2xl mb-2 min-w-[220px]"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #fee2e2',
            borderRadius: '12px',
            padding: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            marginBottom: '8px',
            minWidth: '220px'
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ backgroundColor: '#ef4444' }} />
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider" style={{ color: '#dc2626' }}>Recording</span>
          </div>
          <div 
            ref={scrollRef} 
            className="max-h-40 overflow-y-auto custom-scrollbar"
            style={{ maxHeight: '160px', overflowY: 'auto' }}
          >
            {events.length === 0 ? (
              <p className="text-[10px] text-gray-400 italic" style={{ fontSize: '10px', color: '#9ca3af' }}>Waiting for clicks...</p>
            ) : (
              <div className="space-y-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {events.map((e, i) => (
                  <div key={i} className="text-[10px] border-b border-gray-50 pb-1" style={{ fontSize: '10px', borderBottom: '1px solid #f9fafb', paddingBottom: '4px' }}>
                    <div className="font-bold text-gray-900" style={{ fontWeight: 'bold', color: '#111827' }}>{e.type}</div>
                    <div className="text-gray-500 truncate" style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.element.selector}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={toggleRecording}
        className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 bg-red-600 text-white hover:bg-red-700"
        style={{
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
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Square className="w-3.5 h-3.5 fill-current" size={14} />
        <span>Stop Recording</span>
      </button>
    </div>
  );
};

export default RecorderUI;
