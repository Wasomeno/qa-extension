import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPlus,
  FiSettings,
  FiUser,
  FiActivity,
  FiGitlab,
  FiSlack,
  FiLogOut,
  FiRefreshCw,
  FiAlertTriangle,
  FiCheckCircle,
  FiCamera,
  FiFileText,
  FiArrowLeft,
} from 'react-icons/fi';

// NO GLOBAL CSS IMPORT - This component is for content script use only

interface PopupState {
  currentView: 'dashboard' | 'create-issue' | 'login' | 'loading';
  user: any | null;
  isAuthenticated: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  recentScreenshots: Array<{
    screenshot: string;
    url?: string;
    title?: string;
    timestamp: number;
  }>;
  error: string | null;
  success: string | null;
}

const ContentPopup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    currentView: 'login',
    user: null,
    isAuthenticated: false,
    connectionStatus: 'disconnected',
    recentScreenshots: [],
    error: null,
    success: null,
  });

  // Simple mock data for now
  useEffect(() => {
    // Simulate quick load
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        currentView: 'dashboard',
        isAuthenticated: true,
        connectionStatus: 'connected',
        user: {
          email: 'user@example.com',
          username: 'user',
          fullName: 'Demo User',
        }
      }));
    }, 500);
  }, []);

  const renderDashboard = () => (
    <div style={{ padding: '20px' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '20px',
        paddingBottom: '15px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          backgroundColor: '#3b82f6', 
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: '12px',
          color: 'white'
        }}>
          <FiUser size={20} />
        </div>
        <div>
          <div style={{ fontWeight: '600', fontSize: '14px' }}>
            {state.user?.fullName || 'Demo User'}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {state.user?.email || 'user@example.com'}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          onClick={() => setState(prev => ({ ...prev, currentView: 'create-issue' }))}
        >
          <FiPlus size={16} />
          Create New Issue
        </button>

        
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: '500', 
          color: '#6b7280', 
          marginBottom: '8px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Status
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#f3f4f6',
          borderRadius: '6px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: state.connectionStatus === 'connected' ? '#10b981' : '#ef4444'
          }} />
          <span style={{ fontSize: '12px', color: '#374151' }}>
            {state.connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: '500', 
          color: '#6b7280', 
          marginBottom: '8px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Quick Actions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#374151'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FiGitlab size={14} />
            Open GitLab
          </button>
          <button
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#374151'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FiSettings size={14} />
            Settings
          </button>
        </div>
      </div>
    </div>
  );

  const renderLogin = () => (
    <div style={{ 
      padding: '30px 20px',
      textAlign: 'center'
    }}>
      <div style={{
        width: '60px',
        height: '60px',
        backgroundColor: '#3b82f6',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
        color: 'white'
      }}>
        <FiActivity size={24} />
      </div>
      <h2 style={{ 
        fontSize: '18px', 
        fontWeight: '600', 
        marginBottom: '8px',
        color: '#111827'
      }}>
        QA Command Center
      </h2>
      <p style={{ 
        fontSize: '14px', 
        color: '#6b7280', 
        marginBottom: '24px',
        lineHeight: '1.4'
      }}>
        Connect your GitLab account to start creating issues and managing your QA workflow.
      </p>
      <button
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
        onClick={() => setState(prev => ({ ...prev, currentView: 'dashboard', isAuthenticated: true }))}
      >
        <FiGitlab size={16} />
        Connect GitLab
      </button>
    </div>
  );

  const renderCreateIssue = () => {
    const [formData, setFormData] = useState({
      title: '',
      description: '',
      severity: 'medium'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: any) => {
      e.preventDefault();
      if (!formData.title || !formData.description) return;

      setIsSubmitting(true);
      try {
        // Send message to background script to create issue
        await new Promise<void>((resolve) => {
          chrome.runtime.sendMessage({
            type: 'CREATE_ISSUE',
            data: {
              ...formData,
              context: { url: window.location.href, title: document.title }
            }
          }, () => { void chrome.runtime.lastError; resolve(); });
        });
        
        setState(prev => ({ 
          ...prev, 
          currentView: 'dashboard',
          success: 'Issue created successfully!'
        }));
      } catch (error) {
        console.error('Failed to create issue:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Failed to create issue. Please try again.'
        }));
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header with back button */}
        <div style={{ 
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <button
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            onClick={() => setState(prev => ({ ...prev, currentView: 'dashboard' }))}
          >
            <FiArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontWeight: '600', fontSize: '16px', color: '#111827' }}>
              Create Issue
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Report bugs and request features
            </div>
          </div>
        </div>
        
        {/* Issue Form */}
        <div style={{ 
          flex: 1, 
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{ 
            height: '100%', 
            overflowY: 'auto',
            padding: '20px'
          }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Title */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief description of the issue"
                  required
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Severity */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Severity
                </label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData(prev => ({ ...prev, severity: e.target.value }))}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of the issue, steps to reproduce..."
                  required
                  disabled={isSubmitting}
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Context Info */}
              <div style={{
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#6b7280'
              }}>
                <div><strong>URL:</strong> {window.location.href}</div>
                <div><strong>Page:</strong> {document.title}</div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!formData.title || !formData.description || isSubmitting}
                style={{
                  padding: '12px',
                  backgroundColor: !formData.title || !formData.description || isSubmitting ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: !formData.title || !formData.description || isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isSubmitting ? (
                  <>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #ffffff',
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Creating...
                  </>
                ) : (
                  <>
                    <FiPlus size={16} />
                    Create Issue
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (state.currentView) {
      case 'loading':
        return (
          <div style={{ 
            padding: '40px 20px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f3f4f6',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ fontSize: '14px', color: '#6b7280' }}>Loading...</p>
          </div>
        );
      case 'login':
        return renderLogin();
      case 'dashboard':
        return renderDashboard();
      case 'create-issue':
        return renderCreateIssue();
      default:
        return renderDashboard();
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'white',
      borderRadius: '16px',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position: 'relative'
    }}>
      {renderContent()}
      
      {/* CSS animations */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ContentPopup;
