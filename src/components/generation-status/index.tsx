import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, ExternalLink, X } from 'lucide-react';

interface GenerationStatusProps {
  status: 'idle' | 'generating' | 'success' | 'error';
  title?: string;
  error?: string;
  blueprintId?: string;
  onClose: () => void;
  onView: () => void;
}

export function GenerationStatusPanel({
  status,
  title,
  error,
  blueprintId,
  onClose,
  onView
}: GenerationStatusProps) {
  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-6 right-6 z-[2147483647] bg-white rounded-xl shadow-2xl border border-zinc-200 w-80 p-4 font-sans animate-slide-in-from-bottom animate-fade-in duration-300 flex flex-col gap-3 pointer-events-auto">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {status === 'generating' && (
            <div className="bg-blue-50 text-blue-500 p-2 rounded-full">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="bg-emerald-50 text-emerald-500 p-2 rounded-full">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          )}
          {status === 'error' && (
            <div className="bg-red-50 text-red-500 p-2 rounded-full">
              <XCircle className="w-5 h-5" />
            </div>
          )}
          
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">
              {status === 'generating' ? 'Generating Test...' : status === 'success' ? 'Test Ready' : 'Generation Failed'}
            </h4>
            <p className="text-xs text-zinc-500 line-clamp-1">
              {title || 'Flow Blueprint'}
            </p>
          </div>
        </div>
        
        {(status === 'success' || status === 'error') && (
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {status === 'error' && error && (
        <div className="bg-red-50 text-red-700 text-xs p-2 rounded border border-red-100 mt-1">
          {error}
        </div>
      )}

      {status === 'success' && (
        <button 
          onClick={onView}
          className="w-full mt-1 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
        >
          View Test Details
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
