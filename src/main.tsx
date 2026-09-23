import './monaco-workers';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppGate } from './AppGate';
import { AuthProvider } from './contexts/AuthContext';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <FeatureFlagProvider>
        <AppGate />
      </FeatureFlagProvider>
    </AuthProvider>
  </React.StrictMode>
);
