import React, { useRef, useState, useEffect } from 'react';

interface TrimSliderProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  onTrimStartChange: (val: number) => void;
  onTrimEndChange: (val: number) => void;
  onSeek: (val: number) => void;
  events?: { timestamp: number; type: string }[];
  recordingStartTime?: number;
}

export const TrimSlider: React.FC<TrimSliderProps> = ({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  onTrimStartChange,
  onTrimEndChange,
  onSeek,
  events = [],
  recordingStartTime = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'playhead' | null>(null);

  // Convert absolute event timestamp to relative seconds
  const relativeEvents = React.useMemo(() => {
    return events.map(ev => {
      let relSecs = (ev.timestamp - recordingStartTime) / 1000;
      // Cap at duration if somehow it exceeds it (due to slight differences in start times)
      if (relSecs < 0) relSecs = 0;
      if (relSecs > duration) relSecs = duration;
      return { ...ev, relSecs };
    });
  }, [events, recordingStartTime, duration]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !containerRef.current || duration <= 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      let percent = (e.clientX - rect.left) / rect.width;
      percent = Math.max(0, Math.min(1, percent));
      const time = percent * duration;

      if (isDragging === 'start') {
        onTrimStartChange(Math.min(time, trimEnd - 0.1));
      } else if (isDragging === 'end') {
        onTrimEndChange(Math.max(time, trimStart + 0.1));
      } else if (isDragging === 'playhead') {
        setLocalCurrentTime(time);
        onSeek(time);
      }
    };

    const handlePointerUp = () => setIsDragging(null);

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, duration, trimStart, trimEnd, onTrimStartChange, onTrimEndChange, onSeek]);

  const [localCurrentTime, setLocalCurrentTime] = useState(currentTime);

  useEffect(() => {
    if (isDragging !== 'playhead') {
      setLocalCurrentTime(currentTime);
    }
  }, [currentTime, isDragging]);

  const startPercent = (trimStart / duration) * 100 || 0;
  const endPercent = (trimEnd / duration) * 100 || 100;
  const currentPercent = (localCurrentTime / duration) * 100 || 0;

  return (
    <div className="relative w-full h-[60px] bg-zinc-100 backdrop-blur-md rounded-xl select-none shadow-inner border border-zinc-200" ref={containerRef}>
      {/* Background Track */}
      <div 
        className="absolute inset-y-1 inset-x-0 bg-zinc-200 rounded-xl cursor-pointer border border-zinc-300 overflow-hidden shadow-sm"
        onPointerDown={(e) => {
          // If clicking on the track itself, move playhead
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            let percent = (e.clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            onSeek(percent * duration);
            setIsDragging('playhead');
          }
        }}
      >
        {/* Events markers */}
        {relativeEvents.map((ev, idx) => {
          const pos = (ev.relSecs / duration) * 100;
          return (
            <div
              key={idx}
              className="absolute top-1/2 -translate-y-1/2 w-[3px] h-3 rounded-full bg-blue-600 pointer-events-none"
              style={{ left: `${pos}%` }}
              title={ev.type}
            />
          );
        })}
      </div>

      {/* Selected Trim Area */}
      <div
        className="absolute inset-y-1 bg-blue-600/10 border-y-[1.5px] border-blue-600/30 pointer-events-none"
        style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
      />

      {/* Dimmed Out-of-bounds Areas */}
      <div
        className="absolute inset-y-1 left-0 bg-zinc-400/20 rounded-l-xl pointer-events-none backdrop-blur-[1px]"
        style={{ width: `${startPercent}%` }}
      />
      <div
        className="absolute inset-y-1 right-0 bg-zinc-400/20 rounded-r-xl pointer-events-none backdrop-blur-[1px]"
        style={{ width: `${100 - endPercent}%` }}
      />

      {/* Handles */}
      <div
        className="absolute top-0 bottom-0 w-5 -ml-[10px] bg-blue-600 rounded-md cursor-col-resize flex flex-col items-center justify-center hover:bg-blue-700 z-10 shadow-md border border-blue-700/20 transition-colors"
        style={{ left: `${startPercent}%` }}
        onPointerDown={(e) => { e.stopPropagation(); setIsDragging('start'); }}
      >
        <div className="w-0.5 h-4 bg-white rounded-full mb-0.5" />
        <div className="w-0.5 h-4 bg-white rounded-full" />
      </div>

      <div
        className="absolute top-0 bottom-0 w-5 -ml-[10px] bg-blue-600 rounded-md cursor-col-resize flex flex-col items-center justify-center hover:bg-blue-700 z-10 shadow-md border border-blue-700/20 transition-colors"
        style={{ left: `${endPercent}%` }}
        onPointerDown={(e) => { e.stopPropagation(); setIsDragging('end'); }}
      >
        <div className="w-0.5 h-4 bg-white rounded-full mb-0.5" />
        <div className="w-0.5 h-4 bg-white rounded-full" />
      </div>

      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-[1.5px] bg-red-500 z-20 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.4)]"
        style={{ left: `${currentPercent}%` }}
      >
        <div className="absolute top-0 -translate-x-1/2 -mt-1 w-3 h-3 bg-red-500 rounded-full shadow-md pointer-events-auto cursor-ew-resize ring-2 ring-white" 
             onPointerDown={(e) => { e.stopPropagation(); setIsDragging('playhead'); }} 
        />
      </div>
    </div>
  );
};
