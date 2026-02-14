import React, { useState, useEffect, useRef } from 'react';
import { EventLogger } from './event-logger';
import { MessageType } from '@/types/messages';
import { RawEvent } from '@/types/recording';

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
    chrome.storage.local.get(['isRecording'], (result) => {
      if (result.isRecording) {
        logger.start();
        setIsRecording(true);
      }
    });

    const handleMessage = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      if (message.type === MessageType.START_RECORDING) {
        logger.start();
        setIsRecording(true);
        setEvents([]);
        sendResponse?.({ success: true });
      } else if (message.type === MessageType.STOP_RECORDING) {
        logger.stop();
        setIsRecording(false);
        sendResponse?.({ success: true, events: eventsRef.current });
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
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

  return (
    <div className="fixed bottom-24 right-6 flex flex-col items-end gap-2 pointer-events-auto">
      {isRecording && (
        <div className="bg-white/90 backdrop-blur-md border border-red-200 rounded-lg p-3 shadow-xl mb-2 min-w-[200px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Recording</span>
          </div>
          <div ref={scrollRef} className="max-h-48 overflow-y-auto custom-scrollbar">
            {events.length === 0 ? (
              <p className="text-[10px] text-gray-500 italic">Waiting for interactions...</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((e, i) => (
                  <li key={i} className="text-[10px] text-gray-700 border-b border-gray-100 pb-1.5">
                    <div className="flex justify-between items-start mb-0.5">
                      <span className="font-bold text-gray-900 uppercase text-[9px]">{e.type}</span>
                      <span className="text-gray-400 text-[8px]">{new Date(e.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <div className="font-mono bg-gray-50 p-1 rounded border border-gray-100 truncate mb-1" title={e.element.selector}>
                      {e.element.selector}
                    </div>
                    {e.element.textContent && (
                      <div className="text-gray-500 italic truncate">
                        "{e.element.textContent}"
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 text-[9px] text-gray-400 text-right">
            {events.length} events captured
          </div>
        </div>
      )}

      <button
        onClick={toggleRecording}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95
          ${isRecording 
            ? 'bg-red-600 text-white hover:bg-red-700' 
            : 'bg-white text-gray-900 hover:bg-gray-50 border border-gray-200'}
        `}
      >
        {isRecording ? (
          <>
            <div className="w-3 h-3 bg-white rounded-sm" />
            <span className="font-semibold text-sm">Stop Recording</span>
          </>
        ) : (
          <>
            <div className="w-3 h-3 bg-red-600 rounded-full" />
            <span className="font-semibold text-sm">Start Recording</span>
          </>
        )}
      </button>
    </div>
  );
};

export default RecorderUI;
