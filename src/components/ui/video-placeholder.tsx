import React from 'react';
import { Video, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoThumbnail } from '@/pages/agent/hooks/use-video-thumbnail';

interface VideoPlaceholderProps {
  url: string;
  className?: string;
}

export function VideoPlaceholder({ url, className }: VideoPlaceholderProps) {
  const { thumbnail, isLoading, error } = useVideoThumbnail(url, 3);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex flex-col gap-3 p-4 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-all group max-w-sm my-2",
        className
      )}
    >
      <div className="aspect-video w-full rounded-lg bg-muted flex items-center justify-center relative overflow-hidden border shadow-inner">
        {thumbnail ? (
          <img 
            src={thumbnail} 
            alt="Video thumbnail" 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/20 opacity-50" />
            <div className="relative z-10 flex flex-col items-center gap-2 text-center p-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform duration-300">
                {isLoading ? (
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                ) : (
                  <Video className="h-6 w-6 text-primary" />
                )}
              </div>
              {error && !isLoading && (
                 <span className="text-[10px] text-muted-foreground line-clamp-2">
                   Could not load preview
                 </span>
              )}
            </div>
          </>
        )}
        
        {/* Play overlay on hover */}
        {thumbnail && (
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/40">
              <Video className="h-6 w-6 text-white" />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Video Recording</span>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {url.split('/').pop()}
          </span>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </a>
  );
}
