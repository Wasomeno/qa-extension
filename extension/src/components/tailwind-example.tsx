import React from 'react';
import { FiActivity, FiSettings, FiUser, FiPlay, FiSquare } from 'react-icons/fi';

interface TailwindExampleProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  recordingDuration: number;
  interactionCount: number;
}

const TailwindExample: React.FC<TailwindExampleProps> = ({
  isRecording,
  onToggleRecording,
  recordingDuration,
  interactionCount
}) => {
  return (
    <div className="extension-popup bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-b-lg">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Gitlab Companion</h1>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-error-400 animate-pulse' : 'bg-success-400'}`} />
            <span className="text-sm opacity-90">
              {isRecording ? 'Recording' : 'Ready'}
            </span>
          </div>
        </div>
        <p className="text-sm opacity-80">AI-powered testing & issue tracking</p>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Recording Control Section */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FiActivity className="w-5 h-5 text-primary-600" />
                <h3 className="card-title text-lg">Recording</h3>
              </div>
              {isRecording && (
                <div className="recording-indicator" />
              )}
            </div>
            <p className="card-description">
              Capture user interactions for automated test generation
            </p>
          </div>
          
          <div className="card-content">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={onToggleRecording}
                className={`btn ${isRecording ? 'btn-error' : 'btn-primary'} btn-lg flex items-center space-x-2`}
              >
                {isRecording ? (
                  <>
                    <FiSquare className="w-4 h-4" />
                    <span>Stop Recording</span>
                  </>
                ) : (
                  <>
                    <FiPlay className="w-4 h-4" />
                    <span>Start Recording</span>
                  </>
                )}
              </button>
              
              <div className="text-right">
                <div className="text-2xl font-mono text-primary-600">
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-secondary-600">{interactionCount} interactions</div>
              </div>
            </div>
            
            {isRecording && (
              <div className="bg-success-50 border border-success-200 rounded-lg p-3">
                <div className="flex items-center space-x-2 text-success-800">
                  <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium">Active Recording</span>
                </div>
                <p className="text-xs text-success-700 mt-1">
                  All clicks, inputs, and navigation are being captured
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-outline p-4 h-auto flex flex-col items-center space-y-2 hover:bg-primary-50 hover:border-primary-300">
            <FiUser className="w-6 h-6 text-primary-600" />
            <span className="text-sm font-medium">Create Issue</span>
            <span className="text-xs text-secondary-600">AI-powered</span>
          </button>
          
          <button className="btn btn-outline p-4 h-auto flex flex-col items-center space-y-2 hover:bg-secondary-50">
            <FiSettings className="w-6 h-6 text-secondary-600" />
            <span className="text-sm font-medium">Settings</span>
            <span className="text-xs text-secondary-600">Configure</span>
          </button>
        </div>

        {/* Status Section */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <div className="status-connected w-2 h-2 rounded-full" />
              <span className="text-secondary-700">Backend connected</span>
            </div>
            <span className="text-secondary-500">v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TailwindExample;