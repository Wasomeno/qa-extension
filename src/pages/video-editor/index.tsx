import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Play, Pause, Scissors, Loader2, Check, X, Wand2, Clock, 
  MousePointer2, AlertCircle, Globe, Terminal, Bug, Activity, 
  ChevronRight, ChevronDown, ListFilter 
} from 'lucide-react';
import { MessageType } from '@/types/messages';
import { TrimSlider } from './components/TrimSlider';

interface PendingRecording {
  recordingId: string;
  events: any[];
  videoBlobKey: string;
  startUrl: string;
  startTime: number;
  endTime: number;
  telemetry?: any;
}

const VideoEditorPage: React.FC = () => {
  const [recordingData, setRecordingData] = useState<PendingRecording | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Trim state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  
  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [generatedBlueprint, setGeneratedBlueprint] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'events' | 'console' | 'network'>('events');
  const [title, setTitle] = useState('');

  // Get recording ID from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const recordingId = urlParams.get('id');

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === MessageType.BLUEPRINT_GENERATED) {
        const blueprint = message.data?.blueprint;
        if (blueprint && blueprint.id === recordingId) {
          console.log('[VideoEditor] Blueprint generated successfully:', blueprint);
          setGeneratedBlueprint(blueprint);
          setIsGenerated(true);
          setIsSubmitting(false);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [recordingId]);

  useEffect(() => {
    if (!recordingId) {
      setError('No recording ID provided');
      setIsLoading(false);
      return;
    }

    console.log('[VideoEditor] Fetching recording data for ID:', recordingId);
    // Fetch pending recording data from background
    chrome.runtime.sendMessage(
      {
        type: MessageType.GET_PENDING_EDIT_RECORDING,
        data: { recordingId },
      },
      (response) => {
        if (response?.success && response.data) {
          const data = response.data;
          console.log('[VideoEditor] Received recording data:', data);
          const initialDuration = (data.endTime - data.startTime) / 1000;
          
          setRecordingData(data);
          console.log('RECORDING_DATA_FULL:', data);
          if (data.title) {
            setTitle(data.title);
          }
          if (initialDuration > 0 && !isNaN(initialDuration)) {
            setDuration(initialDuration);
            setTrimEnd(initialDuration);
          }
          fetchVideoBlob(data.videoBlobKey);
        } else {
          setError(response?.error || 'Failed to load recording');
          setIsLoading(false);
        }
      }
    );
  }, [recordingId]);

  const fetchVideoBlob = async (blobKey: string) => {
    try {
      console.log('[VideoEditor] Fetching video blob for key:', blobKey);
      // Request blob from offscreen document via background
      chrome.runtime.sendMessage(
        { type: 'GET_VIDEO_BLOB', data: { key: blobKey } },
        (response) => {
          if (response?.success && response.data?.videoData) {
            console.log('[VideoEditor] Received video data, size:', response.data.size);
            
            // Check if videoData is an object with numeric keys (standard serialization for Uint8Array in some environments)
            let rawData = response.data.videoData;
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData) && !(rawData instanceof Uint8Array)) {
              console.log('[VideoEditor] Converting object-based Uint8Array to actual Uint8Array');
              const keys = Object.keys(rawData).map(Number).sort((a, b) => a - b);
              const arr = new Uint8Array(keys.length);
              for (let i = 0; i < keys.length; i++) {
                arr[i] = rawData[keys[i]];
              }
              rawData = arr;
            }

            const blob = new Blob([rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)], {
              type: response.data.type || 'video/webm',
            });
            console.log('[VideoEditor] Created blob:', blob.size, blob.type);
            setVideoBlob(blob);
          } else {
            console.error('[VideoEditor] Failed to fetch video blob:', response?.error);
            setError('Failed to load video: ' + (response?.error || 'Unknown error'));
          }
          setIsLoading(false);
        }
      );
    } catch (err) {
      console.error('[VideoEditor] Exception fetching blob:', err);
      setError('Failed to load video data');
      setIsLoading(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      
      // If playing, enforce trimEnd constraint
      if (!videoRef.current.paused) {
        if (time >= trimEnd) {
          videoRef.current.pause();
          videoRef.current.currentTime = trimStart;
          setCurrentTime(trimStart);
          return;
        }
        
        // If somehow we are before trimStart while playing, jump to it
        if (time < trimStart - 0.1) {
          videoRef.current.currentTime = trimStart;
          setCurrentTime(trimStart);
          return;
        }
      }
      
      setCurrentTime(time);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      let videoDuration = videoRef.current.duration;
      console.log('[VideoEditor] Metadata loaded. Raw duration:', videoDuration);
      
      // Fallback for Infinity or invalid duration (common in MediaRecorder WebM)
      if (videoDuration === Infinity || isNaN(videoDuration) || videoDuration <= 0) {
        if (recordingData) {
          videoDuration = (recordingData.endTime - recordingData.startTime) / 1000;
          console.log('[VideoEditor] Duration invalid, using fallback:', videoDuration);
        }
      }
      
      if (videoDuration > 0 && !isNaN(videoDuration) && videoDuration !== Infinity) {
        setDuration(videoDuration);
        setTrimEnd(prev => {
          // If prev is 0 or was the initial guess, update it with more accurate data
          if (prev === 0 || prev === Infinity || isNaN(prev)) return videoDuration;
          // Otherwise keep user's manual trim unless it's out of bounds
          return Math.min(prev, videoDuration);
        });

        // Forced refresh of the video frame
        if (videoRef.current.currentTime === 0) {
          videoRef.current.currentTime = 0.001;
        }
      }
    }
  };

  // Handle video stalls and error states
  const handleVideoError = useCallback(() => {
    if (videoRef.current?.error) {
      console.error('[VideoEditor] Video element error:', videoRef.current.error);
      const code = videoRef.current.error.code;
      const message = videoRef.current.error.message;
      setError(`Video player error (${code}): ${message || 'Failed to load video file'}.`);
    }
  }, []);

  // Second-chance duration check for problematic WebM files
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && (duration === 0 || duration === Infinity)) {
        handleLoadedMetadata();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [duration, recordingData]);

  const togglePlay = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (videoRef.current) {
      if (videoRef.current.paused) {
        // If we are at or past trimEnd, reset to trimStart before playing
        const current = videoRef.current.currentTime;
        if (current >= trimEnd - 0.1 || current < trimStart - 0.1) {
          videoRef.current.currentTime = trimStart;
        }
        
        console.log('[VideoEditor] Attempting to play from:', videoRef.current.currentTime);
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.error('[VideoEditor] Play failed:', err);
          });
        }
      } else {
        videoRef.current.pause();
      }
    }
  }, [trimStart, trimEnd]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGenerateTest = async () => {
    if (!recordingData) return;

    setIsSubmitting(true);
    setError(null);

    chrome.runtime.sendMessage(
      {
        type: MessageType.FINALIZE_EDITED_RECORDING,
        data: {
          recordingId: recordingData.recordingId,
          trimStart,
          trimEnd,
          title: title || undefined,
        },
      },
      (response) => {
        if (!response?.success) {
          setIsSubmitting(false);
          setError(response?.error || 'Failed to start generation');
        }
      }
    );
  };

  const videoUrl = useMemo(() => {
    if (!videoBlob) return null;
    try {
      return URL.createObjectURL(videoBlob);
    } catch (e) {
      console.error('[VideoEditor] Failed to create object URL:', e);
      return null;
    }
  }, [videoBlob]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        <span className="ml-3 text-zinc-500 font-medium">Loading recording...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-50 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6 border border-red-100">
          <X className="w-8 h-8 text-red-500" />
        </div>
        <p className="text-zinc-900 text-lg font-bold mb-2">Failed to load recording</p>
        <p className="text-zinc-500 mb-8 max-w-sm mx-auto">{error}</p>
        <button
          onClick={() => window.close()}
          className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-all shadow-md font-medium"
        >
          Close Editor
        </button>
      </div>
    );
  }

  if (isGenerated && generatedBlueprint) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6 border border-emerald-100">
          <Check className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Test Blueprint Ready!</h1>
        <p className="text-zinc-500 mb-8 max-w-md">
          Your recording has been processed, trimmed, and analyzed by AI. 
          The test steps and video are now available.
        </p>
        
        <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
          <button
            onClick={() => {
              const url = chrome.runtime.getURL(`recording-detail.html?id=${generatedBlueprint.id}`);
              window.location.href = url;
            }}
            className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-semibold transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Clock className="w-5 h-5" />
            View Test Details
          </button>
          <button
            onClick={() => window.close()}
            className="w-full py-3 bg-white hover:bg-zinc-50 text-zinc-900 rounded-xl font-semibold transition-all border border-zinc-200"
          >
            Close Editor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans relative overflow-hidden">
      {/* Processing Overlay */}
      {isSubmitting && (
        <div className="absolute inset-0 z-[100] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-4 border-zinc-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Wand2 className="w-8 h-8 text-blue-500 animate-pulse" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-zinc-900">Generating Blueprint...</h2>
          <p className="text-zinc-500 max-w-xs">
            We're trimming your video and using AI to transcribe the steps. This takes about 10-20 seconds.
          </p>
          <div className="mt-8 flex items-center gap-2 text-xs text-zinc-400 uppercase tracking-widest font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
            AI processing in progress
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-zinc-200/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-zinc-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Review & Trim</h1>
            <p className="text-xs text-zinc-500">Refine your recording before generating</p>
          </div>
        </div>

        <button
          onClick={handleGenerateTest}
          disabled={isSubmitting}
          className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-full font-medium transition-all flex items-center gap-2 shadow-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Generate Test Blueprint
            </>
          )}
        </button>
      </header>

      <main className="flex-1 w-full grid grid-cols-1 xl:grid-cols-[1fr_400px] overflow-hidden">
        
        {/* Left Column: Video & Timeline */}
        <div className="flex flex-col h-full overflow-hidden border-r border-zinc-200 bg-white/50">
          
          {/* Video Player Container */}
          <div className="flex-1 flex flex-col min-h-0 p-6">
            <div 
              className="flex-1 rounded-2xl overflow-hidden bg-zinc-900 ring-1 ring-zinc-200 shadow-2xl relative group flex flex-col justify-center mb-6"
            >
              {videoUrl ? (
                <>
                  <div className="relative w-full h-full flex items-center justify-center cursor-pointer group/video" onClick={(e) => togglePlay(e)}>
                    <video
                      ref={videoRef}
                      src={videoUrl || undefined}
                      className="w-full h-full object-contain pointer-events-none"
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => {
                        setIsPlaying(false);
                        handleSeek(trimStart);
                      }}
                      onError={handleVideoError}
                      playsInline
                      preload="auto"
                    />
                    
                    {!isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 transition-all duration-300">
                        <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-2xl group-hover/video:bg-white/20 transform group-hover/video:scale-105 transition-all">
                          <Play className="w-10 h-10 ml-1.5 fill-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-8 pt-32 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex flex-col gap-5">
                      <div className="flex items-center justify-between text-[10px] text-white/80 px-2 font-mono tracking-widest font-bold uppercase">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                            Start: {formatTime(trimStart)}
                          </span>
                          <span className="w-px h-3 bg-white/20"></span>
                          <span>End: {formatTime(trimEnd)}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white/60">{formatTime(currentTime)} / {formatTime(duration)}</span>
                          <span className="px-2 py-0.5 rounded bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]">
                            Selected: {formatTime(trimEnd - trimStart)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            togglePlay();
                          }}
                          className="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-full transition-all text-white border border-white/20 shadow-xl hover:scale-105 active:scale-95 z-50"
                        >
                          {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 ml-1 fill-white" />}
                        </button>
                        
                        <div className="flex-1">
                          <TrimSlider 
                            duration={duration}
                            trimStart={trimStart}
                            trimEnd={trimEnd}
                            currentTime={currentTime}
                            onTrimStartChange={(val) => { setTrimStart(val); handleSeek(val); }}
                            onTrimEndChange={(val) => { setTrimEnd(val); handleSeek(val); }}
                            onSeek={handleSeek}
                            events={recordingData?.events}
                            recordingStartTime={recordingData?.startTime}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 bg-zinc-50 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Metadata & Insights */}
        <div className="h-full bg-white flex flex-col border-l border-zinc-200 shadow-[-1px_0_10px_rgba(0,0,0,0.02)] overflow-hidden">
          
          <div className="p-6 space-y-6 flex-1 flex flex-col min-h-0">
            {/* 1. Title */}
            <div className="space-y-3 shrink-0">
              <div className="flex items-center gap-2 text-zinc-400 uppercase tracking-widest text-[10px] font-bold">
                <Wand2 className="w-3 h-3" />
                Test Title
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., User Onboarding Flow"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all shadow-sm"
              />
            </div>

            {/* 2. Events, Logs, and Network */}
            <div className="flex-1 flex flex-col min-h-0 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-400 uppercase tracking-widest text-[10px] font-bold">
                  <Activity className="w-3 h-3" />
                  Telemetry & Logs
                </div>
                {recordingData && (
                  <div className="text-[10px] font-mono text-zinc-400">
                    {recordingData.events.length} events
                  </div>
                )}
              </div>

              <div className="flex p-1 bg-zinc-100 rounded-lg shrink-0">
                {[
                  { id: 'events', label: 'Events', icon: <MousePointer2 className="w-3 h-3" /> },
                  { id: 'console', label: 'Console', icon: <Terminal className="w-3 h-3" />, count: recordingData?.telemetry?.consoleLogs?.length },
                  { id: 'network', label: 'Network', icon: <Activity className="w-3 h-3" />, count: recordingData?.telemetry?.networkRequests?.length }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                      activeTab === tab.id 
                        ? 'bg-white text-zinc-900 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${
                        activeTab === tab.id ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-600'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto border border-zinc-100 rounded-xl bg-zinc-50/30 p-2 custom-scrollbar">
                {activeTab === 'events' && recordingData && (
                  <div className="space-y-2">
                    {recordingData.events.map((event, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-white border border-zinc-100 rounded-lg shadow-sm transition-all hover:border-zinc-200">
                        <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center shrink-0 border border-zinc-100 text-[10px] font-bold text-zinc-500">
                          #{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                              {event.type}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400">
                              +{Math.round((event.timestamp - recordingData.startTime) / 1000)}s
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-600 font-medium truncate">
                            {event.element?.tagName?.toLowerCase() || 'browser'}{event.element?.id ? `#${event.element.id}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'console' && recordingData && (
                  <div className="space-y-1">
                    {(!recordingData.telemetry?.consoleLogs || recordingData.telemetry.consoleLogs.length === 0) ? (
                      <div className="py-8 text-center text-[11px] text-zinc-400 italic">No console logs captured</div>
                    ) : (
                      recordingData.telemetry.consoleLogs.map((log: any, i: number) => (
                        <div key={i} className={`p-2 rounded text-[10px] font-mono border-l-2 ${
                          log.level === 'error' ? 'bg-red-50 text-red-700 border-red-400' :
                          log.level === 'warn' ? 'bg-amber-50 text-amber-700 border-amber-400' :
                          'bg-white text-zinc-600 border-zinc-200'
                        }`}>
                          <div className="flex justify-between mb-0.5 opacity-60">
                            <span>{log.level.toUpperCase()}</span>
                            <span>+{Math.round((log.timestamp - recordingData.startTime) / 1000)}s</span>
                          </div>
                          <div className="break-all whitespace-pre-wrap">{log.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'network' && recordingData && (
                  <div className="space-y-1">
                    {(!recordingData.telemetry?.networkRequests || recordingData.telemetry.networkRequests.length === 0) ? (
                      <div className="py-8 text-center text-[11px] text-zinc-400 italic">No network activity captured</div>
                    ) : (
                      recordingData.telemetry.networkRequests.map((req: any, i: number) => (
                        <div key={i} className="p-2 bg-white border border-zinc-100 rounded text-[10px] font-mono shadow-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-bold ${
                              req.status >= 400 ? 'text-red-600' : 
                              req.status >= 300 ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                              {req.status || '???'}
                            </span>
                            <span className="font-bold text-zinc-900">{req.method}</span>
                            <span className="text-zinc-400 ml-auto">+{Math.round((req.timestamp - recordingData.startTime) / 1000)}s</span>
                          </div>
                          <div className="truncate text-zinc-600" title={req.url}>{req.url}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Custom Scrollbar Styles for the events list */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #52525b;
        }
      `}} />
    </div>
  );
};

export default VideoEditorPage;
