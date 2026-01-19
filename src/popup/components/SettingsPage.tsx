import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiX,
  FiPlus,
  FiTrash2,
  FiAlertCircle,
  FiCheckCircle,
} from 'react-icons/fi';
import { normalizeDomainInput, isValidDomain } from '@/utils/domain-matcher';

interface SettingsPageProps {
  onClose: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onClose }) => {
  const [whitelistedDomains, setWhitelistedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleAddDomain = async () => {
    const trimmed = newDomain.trim();

    if (!trimmed) {
      showError('Please enter a domain');
      return;
    }

    const normalized = normalizeDomainInput(trimmed);

    if (!isValidDomain(normalized)) {
      showError('Invalid domain format. Example: example.com');
      return;
    }

    if (whitelistedDomains.includes(normalized)) {
      showError('Domain already in the list');
      return;
    }

    const updated = [...whitelistedDomains, normalized];
    setNewDomain('');
  };

  const handleRemoveDomain = async (domain: string) => {
    const updated = whitelistedDomains.filter(d => d !== domain);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddDomain();
    }
  };

  const showError = (message: string) => {
    setError(message);
    setSuccess(null);
    setTimeout(() => setError(null), 3000);
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 2000);
  };

  return (
    <div className="flex flex-col h-full w-full max-w-sm mx-auto glass-bg-pattern relative overflow-hidden">
      <div className="absolute inset-0 glass-bg-grid opacity-20"></div>

      {/* Header */}
      <div className="relative z-10 glass-nav p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          title="Close"
        >
          <FiX />
        </button>
      </div>

      {/* Messages */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="relative z-10 flex items-center gap-2 p-3 mx-4 mt-4 glass-glow-red text-sm font-medium text-red-800"
        >
          <FiAlertCircle />
          {error}
        </motion.div>
      )}

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="relative z-10 flex items-center gap-2 p-3 mx-4 mt-4 glass-glow-green text-sm font-medium text-green-800"
        >
          <FiCheckCircle />
          {success}
        </motion.div>
      )}

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-auto p-4">
        <div className="glass-card p-6 space-y-6">
          {/* Allowed Domains Section */}
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Allowed Domains</h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage domains where the floating trigger will be injected. Leave
              empty to enable on all sites.
            </p>

            {/* Add Domain Input */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                onClick={handleAddDomain}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <FiPlus />
                Add
              </button>
            </div>

            {/* Domain List */}
            {isLoading ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                Loading...
              </div>
            ) : whitelistedDomains.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p className="mb-2">No domains configured</p>
                <p className="text-xs">
                  Floating trigger is enabled on all sites
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {whitelistedDomains.map(domain => (
                  <motion.div
                    key={domain}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center justify-between p-3 glass-panel rounded-lg"
                  >
                    <span className="text-sm text-gray-900 font-mono">
                      {domain}
                    </span>
                    <button
                      onClick={() => handleRemoveDomain(domain)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove domain"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">
              How it works
            </h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Empty list = trigger enabled on all websites</li>
              <li>• Add domains to restrict where the trigger appears</li>
              <li>
                • Domain matching includes subdomains (e.g., app.example.com)
              </li>
              <li>• Changes take effect immediately on page reload</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
