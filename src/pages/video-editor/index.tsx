import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Play, Pause, Scissors, Loader2, Check, X, Save, Clock, 
  MousePointer2, Terminal, Activity,
} from 'lucide-react';
import { MessageType } from '@/types/messages';
import { getQaWebAppRecordingDetailUrl } from '@/utils/qa-web-app-url';
import { TrimSlider } from './components/TrimSlider';

interface PendingRecording {
  recordingId: string;
  events: any[];
  videoBlobKey: string;
  startUrl: string;
  startTime: number;
  endTime: number;
  projectId?: number;
  title?: string;
  telemetry?: any;
}

interface VideoEditorProps {
  recordingId?: string;
  isModal?: boolean;
  onClose?: () => void;
  onGenerateStarted?: () => void;
}

const VideoEditorPage: React.FC<VideoEditorProps> = ({ 
  recordingId: propsRecordingId, 
  isModal = false,
  onClose,
  onGenerateStarted
}) => {
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

  // Get recording ID from URL params or props
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const recordingId = propsRecordingId || urlParams.get('id');
  const isModalFromUrl = urlParams.get('modal') === 'true';
  const finalIsModal = isModal || isModalFromUrl;

  useEffect(() => {
    if (finalIsModal) {
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
      
      // Also remove any classes that might set background
      document.body.classList.remove('bg-background');
    }
  }, [finalIsModal]);

  // Direct IndexedDB access to avoid message passing bottlenecks
  const getVideoBlobFromIndexedDB = async (key: string): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
      const DB_NAME = 'flowg-video-storage';
      const STORE_NAME = 'video-blobs';
      
      const request = indexedDB.open(DB_NAME, 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        try {
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const getRequest = store.get(key);
          
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => resolve(getRequest.result || null);
        } catch (e) {
          reject(e);
        }
      };
    });
  };

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === MessageType.BLUEPRINT_GENERATED) {
        const blueprint = message.data?.blueprint;
        if (blueprint && blueprint.id === recordingId) {
          if (blueprint.status === 'failed' || blueprint.status === 'error') {
            setError(blueprint.error || 'Recording processing failed');
            setIsSubmitting(false);
            return;
          }
          
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

    
    // Fetch pending recording data from background
    chrome.runtime.sendMessage(
      {
        type: MessageType.GET_PENDING_EDIT_RECORDING,
        data: { recordingId },
      },
      (response) => {
        if (response?.success && response.data) {
          const data = response.data;
          
          const initialDuration = (data.endTime - data.startTime) / 1000;
          
          setRecordingData(data);
          
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
      
      
      try {
        const blob = await getVideoBlobFromIndexedDB(blobKey);
        
        if (blob) {
          
          setVideoBlob(blob);
          
          if (finalIsModal) {
            window.parent.postMessage({ 
              type: '__QA_EXTENSION_MESSAGE__', 
              message: { type: 'RESIZE_IFRAME', data: { pointerEvents: 'auto' } } 
            }, '*');
          }
          
          setIsLoading(false);
          return;
        }
      } catch (idbError) {
        console.error('[VideoEditor] IndexedDB access failed, falling back:', idbError);
      }
      
      // Fallback if IndexedDB fails or is unavailable
      chrome.runtime.sendMessage(
        { type: 'GET_VIDEO_BLOB', data: { key: blobKey } },
        (response) => {
          if (response?.success && response.data?.videoData) {
            

            let rawData = response.data.videoData;
            
            // Fix: If videoData is an object-wrapped Uint8Array (common with serialization)
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData) && !(rawData instanceof Uint8Array)) {
              
              const keys = Object.keys(rawData).map(Number).sort((a, b) => a - b);
              const arr = new Uint8Array(keys.length);
              for (let i = 0; i < keys.length; i++) {
                arr[i] = rawData[keys[i]];
              }
              rawData = arr;
            }

            const blob = new Blob([rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)], { 
              type: response.data.type || 'video/webm' 
            });
            setVideoBlob(blob);
            
            if (finalIsModal) {
              window.parent.postMessage({ 
                type: '__QA_EXTENSION_MESSAGE__', 
                message: { type: 'RESIZE_IFRAME', data: { pointerEvents: 'auto' } } 
              }, '*');
            }
            
            setIsLoading(false);
          } else {
            console.error('[VideoEditor] Failed to fetch video blob:', response?.error);
            setError(response?.error || 'Failed to load video data');
            setIsLoading(false);
          }
        }
      );
    } catch (e) {
      console.error('[VideoEditor] Error fetching video:', e);
      setError('Failed to fetch video blob');
      setIsLoading(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      
      // Enforce trim boundaries during playback
      if (isPlaying) {
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
      
      
      // Fallback for Infinity or invalid duration (common in MediaRecorder WebM)
      if (videoDuration === Infinity || isNaN(videoDuration) || videoDuration <= 0) {
        if (recordingData) {
          videoDuration = (recordingData.endTime - recordingData.startTime) / 1000;
          
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

  const handleSaveRecording = async () => {
    if (!recordingData) return;

    setIsSubmitting(true);
    setError(null);

    // If in modal mode, notify parent that saving started so it can show a toast
    if (finalIsModal) {
      window.parent.postMessage({ 
        type: '__QA_EXTENSION_MESSAGE__', 
        message: { 
          type: 'GENERATION_STARTED', 
          data: { 
            recordingId: recordingData.recordingId,
            title: title || recordingData.title 
          } 
        } 
      }, '*');
      
      // Also call the callback if provided
      if (onGenerateStarted) {
        onGenerateStarted();
      }
    }

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
          const generationError =
            chrome.runtime.lastError?.message ||
            response?.error ||
            'Failed to start generation';

          setIsSubmitting(false);
          setError(generationError);

          if (finalIsModal) {
            window.parent.postMessage({ 
              type: '__QA_EXTENSION_MESSAGE__', 
              message: { 
                type: 'GENERATION_FAILED',
                data: {
                  recordingId: recordingData.recordingId,
                  title: title || recordingData.title,
                  error: generationError,
                }
              } 
            }, '*');
          }
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
      <div className={`h-screen text-zinc-900 flex flex-col font-sans relative overflow-hidden ${finalIsModal ? 'bg-black/60 backdrop-blur-sm p-4 md:p-8 animate-fade-in' : 'bg-zinc-50'}`}>
        <div className={`${finalIsModal ? 'bg-zinc-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center justify-center h-[80vh] max-w-5xl mx-auto w-full animate-slide-in-from-bottom mt-auto mb-auto' : 'flex flex-col items-center justify-center h-full'}`}>
          <Loader2 className="w-10 h-10 animate-spin text-zinc-900 mb-4" />
          <h3 className="text-zinc-900 font-bold text-lg mb-1">Loading Editor</h3>
          <p className="text-zinc-500 text-sm text-center">Preparing your recording for review...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`h-screen text-zinc-900 flex flex-col font-sans relative overflow-hidden ${finalIsModal ? 'bg-black/60 backdrop-blur-sm p-4 md:p-8 animate-fade-in' : 'bg-zinc-50'}`}>
        <div className={`${finalIsModal ? 'bg-zinc-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center justify-center h-[80vh] max-w-5xl mx-auto w-full animate-slide-in-from-bottom mt-auto mb-auto' : 'flex flex-col items-center justify-center h-full'}`}>
          <div className="max-w-sm w-full p-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6 border border-red-100">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-zinc-900 text-lg font-bold mb-2">Failed to load recording</p>
            <p className="text-zinc-500 mb-8 max-w-sm mx-auto">{error}</p>
            <button
              onClick={() => {
                if (finalIsModal) {
                  window.parent.postMessage({ 
                    type: '__QA_EXTENSION_MESSAGE__', 
                    message: { type: 'IFRAME_CLOSED_OVERLAY' } 
                  }, '*');
                } else if (onClose) {
                  onClose();
                } else {
                  window.close();
                }
              }}
              className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-all shadow-md font-medium w-full"
            >
              Close Editor
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isGenerated && generatedBlueprint) {
    return (
      <div className={`h-screen text-zinc-900 flex flex-col font-sans relative overflow-hidden ${finalIsModal ? 'bg-black/60 backdrop-blur-sm p-4 md:p-8 animate-fade-in' : 'bg-zinc-50'}`}>
        <div className={`${finalIsModal ? 'bg-zinc-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center justify-center h-[80vh] max-w-5xl mx-auto w-full animate-slide-in-from-bottom mt-auto mb-auto' : 'flex flex-col items-center justify-center h-full'}`}>
          <div className="max-w-md w-full p-8 text-center flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6 border border-emerald-100">
              <Check className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Recording Saved!</h1>
            <p className="text-zinc-500 mb-8">
              Your recording has been saved and is ready to view.
            </p>
            
            <div className="grid grid-cols-1 gap-4 w-full">
              <button
                onClick={() => {
                  const url =
                    getQaWebAppRecordingDetailUrl(generatedBlueprint.id) ||
                    chrome.runtime.getURL(`recording-detail.html?id=${generatedBlueprint.id}`);
                  if (finalIsModal) {
                    window.open(url, '_blank');
                    // Send message to content script to close the modal
                    window.parent.postMessage({ 
                      type: '__QA_EXTENSION_MESSAGE__', 
                      message: { type: 'IFRAME_CLOSED_OVERLAY' } 
                    }, '*');
                  } else {
                    window.location.href = url;
                  }
                }}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-semibold transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Clock className="w-5 h-5" />
                View Test Details
              </button>
              <button
                onClick={() => {
                  if (finalIsModal) {
                    window.parent.postMessage({ 
                      type: '__QA_EXTENSION_MESSAGE__', 
                      message: { type: 'IFRAME_CLOSED_OVERLAY' } 
                    }, '*');
                  } else if (onClose) {
                    onClose();
                  } else {
                    window.close();
                  }
                }}
                className="w-full py-3 bg-white hover:bg-zinc-50 text-zinc-900 rounded-xl font-semibold transition-all border border-zinc-200"
              >
                Close Editor
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen text-zinc-900 flex flex-col font-sans relative overflow-hidden ${finalIsModal ? 'bg-black/60 backdrop-blur-sm p-4 md:p-8 animate-fade-in' : 'bg-zinc-50'}`}>
      <div className={`${finalIsModal ? 'bg-zinc-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh] max-w-5xl mx-auto w-full animate-slide-in-from-bottom mt-auto mb-auto' : 'flex flex-col h-full'}`}>
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-zinc-200/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-zinc-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Review & Trim</h1>
            <p className="text-xs text-zinc-500">Refine your recording before saving</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveRecording}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-full font-medium transition-all flex items-center gap-2 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Recording
              </>
            )}
          </button>

          {finalIsModal && (
            <button
              onClick={() => {
                window.parent.postMessage({ 
                  type: '__QA_EXTENSION_MESSAGE__', 
                  message: { type: 'IFRAME_CLOSED_OVERLAY' } 
                }, '*');
              }}
              className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-full transition-colors"
              title="Close Editor"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>
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
                          <Play className="w-8 h-8 fill-current ml-1" />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                  <p className="text-sm font-medium">Loading video preview...</p>
                </div>
              )}
            </div>

            {/* Timeline & Controls */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => togglePlay()}
                    className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center text-white hover:bg-zinc-800 transition-all shadow-md active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>
                  <div>
                    <div className="text-lg font-bold tabular-nums text-zinc-900">
                      {formatTime(currentTime)}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                      Current Time
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-sm font-bold text-zinc-900 tabular-nums">
                      {formatTime(trimStart)}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Start</div>
                  </div>
                  <div className="h-8 w-px bg-zinc-100"></div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-zinc-900 tabular-nums">
                      {formatTime(trimEnd)}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">End</div>
                  </div>
                  <div className="h-8 w-px bg-zinc-100"></div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-zinc-900 tabular-nums">
                      {formatTime(trimEnd - trimStart)}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Duration</div>
                  </div>
                </div>
              </div>

              <div className="px-2">
                <TrimSlider
                  duration={duration}
                  trimStart={trimStart}
                  trimEnd={trimEnd}
                  currentTime={currentTime}
                  onChange={(start, end) => {
                    setTrimStart(start);
                    setTrimEnd(end);
                  }}
                  onSeek={handleSeek}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Events & Metadata */}
        <div className="flex flex-col h-full overflow-hidden bg-zinc-50/50">
          <div className="flex flex-col h-full p-6">
            <div className="bg-white rounded-2xl border border-zinc-200 flex flex-col h-full shadow-sm overflow-hidden">
              <div className="p-4 border-b border-zinc-100">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 block">
                  Recording Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Login flow with invalid credentials"
                  className="w-full bg-zinc-50 border-none rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-zinc-900 transition-all"
                />
              </div>

              <div className="flex gap-1 p-1.5 bg-zinc-100/50 mx-4 mt-4 rounded-lg">
                {[
                  { id: 'events', label: 'Steps', icon: <MousePointer2 className="w-3 h-3" />, count: recordingData?.events?.length },
                  { id: 'console', label: 'Logs', icon: <Terminal className="w-3 h-3" />, count: recordingData?.telemetry?.consoleLogs?.length },
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

              <div className="flex-1 overflow-y-auto border border-zinc-100 rounded-xl bg-zinc-50/30 p-2 custom-scrollbar m-4 mt-2">
                {activeTab === 'events' && recordingData && (
                  <div className="space-y-2">
                    {recordingData.events.map((event, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-white border border-zinc-100 rounded-lg shadow-sm transition-all hover:border-zinc-200">
                        <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center shrink-0 border border-zinc-100 text-[10px] font-bold text-zinc-500">
                          #{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-wider">
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
  </div>
  );
};

export default VideoEditorPage;
