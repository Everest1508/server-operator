import React, { createContext, useContext, useState, useEffect } from 'react';
import { DEFAULT_FLAGS, FeatureFlags } from '../types';

interface FeatureFlagContextProps {
  flags: FeatureFlags;
  toggleFlag: (key: keyof FeatureFlags) => void;
  setSidebarUx: (val: 'hidden' | 'disabled') => void;
  resetToDefaults: () => void;
  loading: boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextProps | undefined>(undefined);

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.serverOperator?.loadFeaturesConfig) {
      window.serverOperator.loadFeaturesConfig()
        .then((savedConfig: any) => {
          if (savedConfig) {
            setFlags({ ...DEFAULT_FLAGS, ...savedConfig });
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load feature configuration:', err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const saveConfig = (newFlags: FeatureFlags) => {
    setFlags(newFlags);
    if (window.serverOperator?.saveFeaturesConfig) {
      window.serverOperator.saveFeaturesConfig(newFlags).catch((err) => {
        console.error('Failed to save feature configuration:', err);
      });
    }
  };

  const toggleFlag = (key: keyof FeatureFlags) => {
    if (key === 'sidebarUx') return;
    const CORE_KEYS: string[] = ['servers', 'files', 'docker', 'deployModule', 'notes', 'aiAssistant', 'configCreators', 'serverAdmin'];
    if (CORE_KEYS.includes(key)) return; // Core features cannot be turned off

    const currentVal = flags[key] as boolean;
    const nextVal = !currentVal;

    const nextFlags = { ...flags, [key]: nextVal };

    // Hierarchical rule 1: If top-level module is disabled, disable its sub-features
    if (key === 'deployModule' && !nextVal) {
      nextFlags.deployPipeline = false;
      nextFlags.deployHistory = false;
    }

    // Hierarchical rule 2: If a sub-feature is enabled, ensure its parent module is enabled
    if (nextVal && (key === 'deployPipeline' || key === 'deployHistory')) {
      nextFlags.deployModule = true;
    }

    saveConfig(nextFlags);
  };

  const setSidebarUx = (val: 'hidden' | 'disabled') => {
    saveConfig({ ...flags, sidebarUx: val });
  };

  const resetToDefaults = () => {
    saveConfig(DEFAULT_FLAGS);
  };

  return (
    <FeatureFlagContext.Provider value={{ flags, toggleFlag, setSidebarUx, resetToDefaults, loading }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = () => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  return context;
};

export const useFeatureFlag = (flagName: keyof FeatureFlags): boolean => {
  const { flags } = useFeatureFlags();
  if (flagName === 'sidebarUx') return false; // not a toggle flag
  return !!flags[flagName];
};
