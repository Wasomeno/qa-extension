import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/globals.css';
import {
  FiSave,
  FiRefreshCw,
  FiTrash2,
  FiDownload,
  FiUpload,
  FiGitlab,
  FiSlack,
  FiCheck,
  FiX,
  FiAlertTriangle,
  FiCheckCircle,
  FiSettings,
  FiUser,
  FiBell,
  FiShield,
  FiDatabase,
  FiInfo,
  FiExternalLink,
} from 'react-icons/fi';

import { UserData } from '@/types/messages';
import { ExtensionSettings } from '@/services/storage';

interface OptionsState {
  currentSection: string;
  user: UserData | null;
  settings: null;
  integrations: {
    gitlab: { connected: boolean; token?: string };
    slack: { connected: boolean; token?: string };
  };
  notifications: {
    desktop: boolean;
    sound: boolean;
    slack: boolean;
  };
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  success: string | null;
}

const OptionsApp: React.FC = () => {
  const [state, setState] = useState<OptionsState>({
    currentSection: 'general',
    user: null,
    settings: null,
    integrations: {
      gitlab: { connected: false },
      slack: { connected: false },
    },
    notifications: {
      desktop: true,
      sound: true,
      slack: false,
    },
    isLoading: true,
    isSaving: false,
    error: null,
    success: null,
  });

  const [tempSettings, setTempSettings] = useState<Partial<ExtensionSettings>>(
    {}
  );
  const [integrationTokens, setIntegrationTokens] = useState({
    gitlab: '',
    slack: '',
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      // Mock loading
      setTimeout(() => {
        setState(prev => ({ ...prev, isLoading: false }));
      }, 500);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to load settings',
        isLoading: false,
      }));
    }
  };

  const saveSettings = async () => {
    setState(prev => ({ ...prev, isSaving: true }));
    try {
      // Mock saving
      await new Promise(resolve => setTimeout(resolve, 1000));
      setState(prev => ({ ...prev, success: 'Settings saved successfully' }));
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to save settings' }));
    } finally {
      setState(prev => ({ ...prev, isSaving: false }));
    }
  };

  const exportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tempSettings));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "settings.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files[0]) {
      fileReader.readAsText(event.target.files[0], "UTF-8");
      fileReader.onload = e => {
        if (e.target?.result) {
          try {
            const parsed = JSON.parse(e.target.result as string);
            setTempSettings(parsed);
            setState(prev => ({ ...prev, success: 'Data imported successfully' }));
          } catch (error) {
            setState(prev => ({ ...prev, error: 'Failed to parse file' }));
          }
        }
      };
    }
  };

  const clearAllData = () => {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      setTempSettings({});
      setState(prev => ({ ...prev, success: 'All data cleared' }));
    }
  };

  const clearMessages = (): void => {
    setState(prev => ({
      ...prev,
      error: null,
      success: null,
    }));
  };

  // Auto-clear messages after 5 seconds
  useEffect(() => {
    if (state.error || state.success) {
      const timer = setTimeout(clearMessages, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.error, state.success]);

  const renderGeneralSection = (): JSX.Element => (
    <div className="section active">
      <h2 className="section-title">General Settings</h2>
      <p className="section-description">
        Configure basic extension settings and preferences
      </p>

      <div className="form-group">
        <label className="form-label">Theme</label>
        <select
          value={tempSettings.theme || 'auto'}
          onChange={e =>
            setTempSettings(prev => ({
              ...prev,
              theme: e.target.value as 'light' | 'dark' | 'auto',
            }))
          }
          className="form-select"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">Auto (System)</option>
        </select>
      </div>

      {/* Recording feature removed: auto-record setting no longer applicable */}

      <div className="form-group">
        <label className="form-label">Default Project</label>
        <input
          type="text"
          value={tempSettings.defaultProject || ''}
          onChange={e =>
            setTempSettings(prev => ({
              ...prev,
              defaultProject: e.target.value,
            }))
          }
          className="form-input"
          placeholder="Default project ID for new issues"
        />
      </div>
    </div>
  );

  // Recording settings removed

  const renderIntegrationsSection = (): JSX.Element => (
    <div className="section active">
      <h2 className="section-title">Integrations</h2>
      <p className="section-description">
        Connect with GitLab and Slack for seamless workflow integration
      </p>

      {/* GitLab Integration */}
      <div className="card">
        <div className="card-title">
          <FiGitlab />
          GitLab Integration
          {state.integrations.gitlab.connected && (
            <span className="status-badge status-connected">Connected</span>
          )}
        </div>

        <p className="card-description">
          Connect with GitLab to automatically create issues and sync project
          data.
        </p>

        {!state.integrations.gitlab.connected ? (
          <div className="integration-form">
            <div className="form-group">
              <label className="form-label">GitLab Personal Access Token</label>
              <input
                type="password"
                value={integrationTokens.gitlab}
                onChange={e =>
                  setIntegrationTokens(prev => ({
                    ...prev,
                    gitlab: e.target.value,
                  }))
                }
                className="form-input"
                placeholder="Enter your GitLab token"
              />
              <small className="form-help">
                <a
                  href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  How to create a GitLab token <FiExternalLink />
                </a>
              </small>
            </div>
            <button className="btn btn-primary" disabled={state.isSaving}>
              {state.isSaving ? <FiRefreshCw className="spin" /> : <FiGitlab />}
              Connect GitLab
            </button>
          </div>
        ) : (
          <div className="integration-connected">
            <div className="connected-info">
              <FiCheck />
              <span>GitLab is connected and ready to use</span>
            </div>
            <button className="btn btn-danger btn-sm" disabled={state.isSaving}>
              {state.isSaving ? <FiRefreshCw className="spin" /> : <FiX />}
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Slack Integration */}
      <div className="card">
        <div className="card-title">
          <FiSlack />
          Slack Integration
          {state.integrations.slack.connected && (
            <span className="status-badge status-connected">Connected</span>
          )}
        </div>

        <p className="card-description">
          Connect with Slack to receive notifications and collaborate on issues.
        </p>

        {!state.integrations.slack.connected ? (
          <div className="integration-form">
            <div className="form-group">
              <label className="form-label">Slack Bot Token</label>
              <input
                type="password"
                value={integrationTokens.slack}
                onChange={e =>
                  setIntegrationTokens(prev => ({
                    ...prev,
                    slack: e.target.value,
                  }))
                }
                className="form-input"
                placeholder="Enter your Slack bot token"
              />
              <small className="form-help">
                <a
                  href="https://api.slack.com/authentication/token-types#bot"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  How to create a Slack bot token <FiExternalLink />
                </a>
              </small>
            </div>
            <button className="btn btn-primary" disabled={state.isSaving}>
              {state.isSaving ? <FiRefreshCw className="spin" /> : <FiSlack />}
              Connect Slack
            </button>
          </div>
        ) : (
          <div className="integration-connected">
            <div className="connected-info">
              <FiCheck />
              <span>Slack is connected and ready to use</span>
            </div>
            <button className="btn btn-danger btn-sm" disabled={state.isSaving}>
              {state.isSaving ? <FiRefreshCw className="spin" /> : <FiX />}
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderNotificationsSection = (): JSX.Element => (
    <div className="section active">
      <h2 className="section-title">Notifications</h2>
      <p className="section-description">
        Configure how and when you receive notifications
      </p>

      <div className="form-group">
        <div className="toggle-wrapper">
          <input
            type="checkbox"
            checked={tempSettings.notificationSettings?.desktop || false}
            onChange={e =>
              setTempSettings(prev => ({
                ...prev,
                notificationSettings: {
                  desktop: e.target.checked,
                  sound: prev.notificationSettings?.sound || false,
                  slack: prev.notificationSettings?.slack || false,
                },
              }))
            }
            className="toggle-input"
            id="desktop-notifications"
          />
          <label htmlFor="desktop-notifications" className="toggle-label">
            <FiBell />
            Desktop Notifications
          </label>
        </div>
        <small className="form-help">
          Show browser notifications for important events
        </small>
      </div>

      <div className="form-group">
        <div className="toggle-wrapper">
          <input
            type="checkbox"
            checked={tempSettings.notificationSettings?.sound || false}
            onChange={e =>
              setTempSettings(prev => ({
                ...prev,
                notificationSettings: {
                  desktop: prev.notificationSettings?.desktop || false,
                  sound: e.target.checked,
                  slack: prev.notificationSettings?.slack || false,
                },
              }))
            }
            className="toggle-input"
            id="sound-notifications"
          />
          <label htmlFor="sound-notifications" className="toggle-label">
            Sound Notifications
          </label>
        </div>
        <small className="form-help">Play sounds for notifications</small>
      </div>

      <div className="form-group">
        <div className="toggle-wrapper">
          <input
            type="checkbox"
            checked={tempSettings.notificationSettings?.slack || false}
            onChange={e =>
              setTempSettings(prev => ({
                ...prev,
                notificationSettings: {
                  desktop: prev.notificationSettings?.desktop || false,
                  sound: prev.notificationSettings?.sound || false,
                  slack: e.target.checked,
                },
              }))
            }
            className="toggle-input"
            id="slack-notifications"
            disabled={!state.integrations.slack.connected}
          />
          <label htmlFor="slack-notifications" className="toggle-label">
            <FiSlack />
            Slack Notifications
          </label>
        </div>
        <small className="form-help">
          {state.integrations.slack.connected
            ? 'Send notifications to Slack channels'
            : 'Connect Slack to enable this feature'}
        </small>
      </div>
    </div>
  );

  const renderDataSection = (): JSX.Element => (
    <div className="section active">
      <h2 className="section-title">Data & Privacy</h2>
      <p className="section-description">
        Manage your data, privacy settings, and storage options
      </p>

      <div className="card">
        <div className="card-title">
          <FiDatabase />
          Data Management
        </div>

        <div className="data-actions">
          <button onClick={exportData} className="btn btn-secondary">
            <FiDownload />
            Export Data
          </button>

          <label className="btn btn-secondary" htmlFor="import-file">
            <FiUpload />
            Import Data
            <input
              id="import-file"
              type="file"
              accept=".json"
              onChange={importData}
              style={{ display: 'none' }}
            />
          </label>

          <button onClick={clearAllData} className="btn btn-danger">
            <FiTrash2 />
            Clear All Data
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <FiShield />
          Privacy Settings
        </div>

        <div className="form-group">
          <div className="toggle-wrapper">
            <input
              type="checkbox"
              checked={true}
              disabled
              className="toggle-input"
              id="local-storage"
            />
            <label htmlFor="local-storage" className="toggle-label">
              Store data locally only
            </label>
          </div>
          <small className="form-help">
            All settings are stored locally in your browser
          </small>
        </div>

        <div className="form-group">
          <div className="toggle-wrapper">
            <input
              type="checkbox"
              checked={false}
              disabled
              className="toggle-input"
              id="analytics"
            />
            <label htmlFor="analytics" className="toggle-label">
              Share anonymous analytics
            </label>
          </div>
          <small className="form-help">
            Currently disabled - no analytics are collected
          </small>
        </div>
      </div>
    </div>
  );

  const renderAboutSection = (): JSX.Element => (
    <div className="section active">
      <h2 className="section-title">About</h2>
      <p className="section-description">
        Information about Gitlab Companion extension
      </p>

      <div className="card">
        <div className="card-title">
          <FiInfo />
          Extension Information
        </div>

        <div className="about-info">
          <div className="info-item">
            <label>Version:</label>
            <span>1.0.0</span>
          </div>
          <div className="info-item">
            <label>Author:</label>
            <span>Gitlab Companion Team</span>
          </div>
          <div className="info-item">
            <label>License:</label>
            <span>MIT</span>
          </div>
          <div className="info-item">
            <label>Repository:</label>
            <a
              href="https://github.com/your-repo/qa-extension"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub <FiExternalLink />
            </a>
          </div>
        </div>

        <div className="about-links">
          <a href="#" className="link-btn">
            <FiInfo />
            Documentation
          </a>
          <a href="#" className="link-btn">
            <FiBell />
            Report Issue
          </a>
          <a href="#" className="link-btn">
            <FiUser />
            Contact Support
          </a>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Third-party Libraries</div>

        <div className="libraries-list">
          <div className="library-item">
            <span>React</span>
            <span>18.2.0</span>
          </div>
          <div className="library-item">
            <span>Framer Motion</span>
            <span>10.12.0</span>
          </div>
          <div className="library-item">
            <span>React Hook Form</span>
            <span>7.45.0</span>
          </div>
          <div className="library-item">
            <span>React Icons</span>
            <span>4.10.0</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (state.isLoading) {
    return (
      <div className="container">
        <div className="loading">
          <FiRefreshCw className="spin" />
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <div className="header-content">
          <h1>Gitlab Companion</h1>
          <p>Configure your testing and issue tracking preferences</p>
        </div>
      </div>

      <div className="main-content">
        <div className="sidebar">
          <nav>
            <ul className="nav-menu">
              {[
                { id: 'general', label: 'General', icon: <FiSettings /> },
                {
                  id: 'integrations',
                  label: 'Integrations',
                  icon: <FiGitlab />,
                },
                {
                  id: 'notifications',
                  label: 'Notifications',
                  icon: <FiBell />,
                },
                { id: 'data', label: 'Data & Privacy', icon: <FiShield /> },
                { id: 'about', label: 'About', icon: <FiInfo /> },
              ].map(section => (
                <li key={section.id} className="nav-item">
                  <button
                    onClick={() =>
                      setState(prev => ({
                        ...prev,
                        currentSection: section.id,
                      }))
                    }
                    className={`nav-link ${state.currentSection === section.id ? 'active' : ''}`}
                  >
                    {section.icon}
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="content-area">
          {/* Messages */}
          <AnimatePresence>
            {state.error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="alert alert-error"
              >
                <FiAlertTriangle />
                {state.error}
              </motion.div>
            )}

            {state.success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="alert alert-success"
              >
                <FiCheckCircle />
                {state.success}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content Sections */}
          {state.currentSection === 'general' && renderGeneralSection()}
          {state.currentSection === 'integrations' &&
            renderIntegrationsSection()}
          {state.currentSection === 'notifications' &&
            renderNotificationsSection()}
          {state.currentSection === 'data' && renderDataSection()}
          {state.currentSection === 'about' && renderAboutSection()}

          {/* Save Button (except for integrations, data, and about sections) */}
          {!['integrations', 'data', 'about'].includes(
            state.currentSection
          ) && (
            <div className="save-section">
              <button
                onClick={saveSettings}
                className="btn btn-primary btn-large"
                disabled={state.isSaving}
              >
                {state.isSaving ? <FiRefreshCw className="spin" /> : <FiSave />}
                {state.isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .container {
              max-width: 1200px;
              margin: 0 auto;
              padding: 20px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #f5f6fa;
              min-height: 100vh;
            }

            .loading {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 400px;
              gap: 12px;
              color: #666;
              font-size: 16px;
            }

            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 0;
              margin: -20px -20px 40px -20px;
              border-radius: 0 0 20px 20px;
            }

            .header-content {
              max-width: 1200px;
              margin: 0 auto;
              padding: 0 20px;
              text-align: center;
            }

            .header h1 {
              font-size: 32px;
              font-weight: 600;
              margin-bottom: 8px;
            }

            .header p {
              font-size: 16px;
              opacity: 0.9;
            }

            .main-content {
              display: grid;
              grid-template-columns: 250px 1fr;
              gap: 30px;
            }

            .sidebar {
              background: white;
              border-radius: 12px;
              padding: 20px;
              height: fit-content;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            }

            .nav-menu {
              list-style: none;
              margin: 0;
              padding: 0;
            }

            .nav-item {
              margin-bottom: 8px;
            }

            .nav-link {
              display: flex;
              align-items: center;
              gap: 12px;
              width: 100%;
              padding: 12px 16px;
              color: #666;
              background: none;
              border: none;
              border-radius: 8px;
              transition: all 0.2s;
              font-weight: 500;
              font-size: 14px;
              cursor: pointer;
              text-align: left;
            }

            .nav-link:hover {
              background: #f8f9ff;
              color: #667eea;
            }

            .nav-link.active {
              background: #667eea;
              color: white;
            }

            .content-area {
              background: white;
              border-radius: 12px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
              min-height: 600px;
            }

            .section-title {
              font-size: 24px;
              font-weight: 600;
              margin-bottom: 8px;
              color: #333;
            }

            .section-description {
              color: #666;
              margin-bottom: 30px;
              font-size: 14px;
              line-height: 1.5;
            }

            .alert {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 16px;
              border-radius: 8px;
              margin-bottom: 20px;
              font-size: 14px;
            }

            .alert-error {
              background: #fee;
              border: 1px solid #fcc;
              color: #c33;
            }

            .alert-success {
              background: #efe;
              border: 1px solid #cfc;
              color: #3c3;
            }

            .form-group {
              margin-bottom: 24px;
            }

            .form-label {
              display: block;
              font-weight: 500;
              margin-bottom: 8px;
              color: #333;
              font-size: 14px;
            }

            .form-input, .form-select {
              width: 100%;
              padding: 12px 16px;
              border: 2px solid #e0e0e0;
              border-radius: 8px;
              font-size: 14px;
              transition: border-color 0.2s;
            }

            .form-input:focus, .form-select:focus {
              outline: none;
              border-color: #667eea;
            }

            .form-help {
              display: block;
              font-size: 12px;
              color: #666;
              margin-top: 4px;
            }

            .form-help a {
              color: #667eea;
              text-decoration: none;
              display: inline-flex;
              align-items: center;
              gap: 4px;
            }

            .form-help a:hover {
              text-decoration: underline;
            }

            .toggle-wrapper {
              display: flex;
              align-items: center;
              gap: 12px;
            }

            .toggle-input {
              width: 18px;
              height: 18px;
              accent-color: #667eea;
            }

            .toggle-label {
              display: flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
              font-size: 14px;
              color: #333;
            }

            .shortcuts-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 16px;
            }

            .shortcut-item {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }

            .shortcut-item label {
              font-size: 12px;
              color: #666;
              font-weight: 500;
            }

            .card {
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 20px;
            }

            .card-title {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 8px;
              color: #333;
            }

            .card-description {
              color: #666;
              font-size: 14px;
              margin-bottom: 16px;
              line-height: 1.5;
            }

            .status-badge {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 500;
              margin-left: auto;
            }

            .status-connected {
              background: #d4edda;
              color: #155724;
            }

            .integration-form {
              display: flex;
              flex-direction: column;
              gap: 16px;
            }

            .integration-connected {
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .connected-info {
              display: flex;
              align-items: center;
              gap: 8px;
              color: #28a745;
              font-weight: 500;
            }

            .data-actions {
              display: flex;
              gap: 12px;
              flex-wrap: wrap;
            }

            .about-info {
              display: grid;
              gap: 12px;
              margin-bottom: 20px;
            }

            .info-item {
              display: grid;
              grid-template-columns: 100px 1fr;
              gap: 12px;
              padding: 8px 0;
              border-bottom: 1px solid #e0e0e0;
            }

            .info-item:last-child {
              border-bottom: none;
            }

            .info-item label {
              font-weight: 500;
              color: #666;
            }

            .info-item a {
              color: #667eea;
              text-decoration: none;
              display: inline-flex;
              align-items: center;
              gap: 4px;
            }

            .about-links {
              display: flex;
              gap: 12px;
              flex-wrap: wrap;
            }

            .link-btn {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 8px 16px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              font-size: 14px;
              transition: background 0.2s;
            }

            .link-btn:hover {
              background: #5a6fd8;
            }

            .libraries-list {
              display: grid;
              gap: 8px;
            }

            .library-item {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e0e0e0;
              font-size: 14px;
            }

            .library-item:last-child {
              border-bottom: none;
            }

            .btn {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 10px 20px;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
              text-decoration: none;
            }

            .btn-primary {
              background: #667eea;
              color: white;
            }

            .btn-primary:hover {
              background: #5a6fd8;
              transform: translateY(-1px);
            }

            .btn-primary:disabled {
              background: #ccc;
              cursor: not-allowed;
              transform: none;
            }

            .btn-secondary {
              background: #6c757d;
              color: white;
            }

            .btn-secondary:hover {
              background: #5a6268;
            }

            .btn-danger {
              background: #dc3545;
              color: white;
            }

            .btn-danger:hover {
              background: #c82333;
            }

            .btn-sm {
              padding: 6px 12px;
              font-size: 12px;
            }

            .btn-large {
              padding: 14px 28px;
              font-size: 16px;
            }

            .save-section {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              text-align: right;
            }

            .spin {
              animation: spin 1s linear infinite;
            }

            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }

            @media (max-width: 768px) {
              .container {
                padding: 10px;
              }

              .main-content {
                grid-template-columns: 1fr;
                gap: 20px;
              }

              .header {
                margin: -10px -10px 20px -10px;
              }

              .header h1 {
                font-size: 24px;
              }

              .content-area {
                padding: 20px;
              }

              .shortcuts-grid {
                grid-template-columns: 1fr;
              }

              .data-actions {
                flex-direction: column;
              }

              .about-links {
                flex-direction: column;
              }
            }
          `,
        }}
      />
    </div>
  );
};

// Initialize the options page
const container = document.getElementById('options-root');
if (container) {
  // Show React root and hide the loading content
  (container as HTMLElement).style.display = 'block';
  const loadingContent = document.querySelector('.content-area .loading');
  if (loadingContent) {
    (loadingContent as HTMLElement).style.display = 'none';
  }

  const root = createRoot(container);
  root.render(<OptionsApp />);
} else {
  console.error('Options root element not found');
}

export default OptionsApp;
