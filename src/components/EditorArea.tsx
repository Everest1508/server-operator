import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode, Save, Loader2, X } from 'lucide-react';
import type { ServerConnection, ViewId, ProxySettings } from '../types';
import { DockerView } from './DockerView';
import { DeployView } from './DeployView';
import { ServerOverview } from './ServerOverview';

function languageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', sh: 'shell', bash: 'shell',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', html: 'html', css: 'css', scss: 'scss',
    sql: 'sql', xml: 'xml', dockerfile: 'dockerfile', env: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

interface EditorAreaProps {
  currentServer: ServerConnection | null;
  servers: ServerConnection[];
  activeView: ViewId;
  proxy: ProxySettings;
  onPanelTab: (tab: 'logs' | 'terminal') => void;
  onPanelOpen: () => void;
  onOpenTerminalAndRun?: (command: string, label?: string) => void;
  serverSysInfo?: import('./ServerOverview').ServerSysInfo | null;
  serverStatusLoading?: boolean;
  onRefreshServerStatus?: () => void;
  dockerContainers?: import('../types').DockerContainer[];
  dockerLoading?: boolean;
  dockerError?: string | null;
  setDockerError?: (error: string | null) => void;
  dockerServicesByPath?: Record<string, string[]>;
  dockerServicesLoading?: boolean;
  onRefreshDocker?: () => void;
  onViewChange?: (view: ViewId) => void;
  openTabs?: string[];
  activeTabPath?: string | null;
  contentByPath?: Record<string, string>;
  savedContentByPath?: Record<string, string>;
  onContentChange?: (path: string, content: string) => void;
  loadingPath?: string | null;
  fileLoadError?: string | null;
  currentPath?: string;
  basePath?: string;
  onSaveFile?: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
  onCloseTab?: (path: string) => void;
  onSelectTab?: (path: string) => void;
  composePaths?: string[];
  projectRepos?: string[];
  projectTreeListings?: Record<string, string>;
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

export function EditorArea({
  currentServer,
  activeView,
  proxy,
  onPanelTab: _onPanelTab,
  onPanelOpen,
  onOpenTerminalAndRun,
  serverSysInfo,
  serverStatusLoading,
  onRefreshServerStatus,
  dockerContainers = [],
  dockerLoading = false,
  dockerError = null,
  setDockerError,
  dockerServicesByPath = {},
  dockerServicesLoading = false,
  onRefreshDocker,
  onViewChange,
  openTabs = [],
  activeTabPath = null,
  contentByPath = {},
  savedContentByPath = {},
  onContentChange,
  loadingPath = null,
  fileLoadError = null,
  currentPath: _currentPath,
  basePath: _basePath,
  onSaveFile,
  onCloseTab,
  onSelectTab,
  composePaths = [],
  projectRepos = [],
  projectTreeListings = {},
}: EditorAreaProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const activeContent = activeTabPath ? (contentByPath[activeTabPath] ?? '') : '';
  const activeSaved = activeTabPath ? (savedContentByPath[activeTabPath] ?? '') : '';
  const isDirty = activeTabPath ? activeContent !== activeSaved : false;
  const isLoading = Boolean(loadingPath && activeTabPath === loadingPath);
  const language = activeTabPath ? languageFromPath(activeTabPath) : 'plaintext';

  useEffect(() => {
    setSaveError(null);
  }, [activeTabPath]);

  const handleSave = useCallback(() => {
    if (!activeTabPath || !onSaveFile) return;
    setSaving(true);
    setSaveError(null);
    onSaveFile(activeTabPath, activeContent)
      .then((res) => {
        if (!res.ok) setSaveError(res.error || 'Save failed');
      })
      .finally(() => setSaving(false));
  }, [activeTabPath, activeContent, onSaveFile]);
  if (!currentServer) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-secondary)]">
        <p>No server selected.</p>
      </div>
    );
  }

  // Single layout: keep DeployView mounted when not active so its terminal stays connected
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {currentServer && (
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ display: activeView === 'deploy' ? 'flex' : 'none' }}
        >
          <DeployView
            currentServer={currentServer}
            proxy={proxy}
            onOpenPanel={onPanelOpen}
            currentPath={_currentPath}
            basePath={_basePath}
            activeFilePath={activeTabPath}
            projectRepos={projectRepos}
            projectTreeListings={projectTreeListings}
            onOpenTerminalAndRun={onOpenTerminalAndRun}
          />
        </div>
      )}
      {activeView === 'docker' && (
        <div className="flex-1 flex flex-col min-h-0">
          <DockerView
            currentServer={currentServer}
            proxy={proxy}
            onOpenLogs={onPanelOpen}
            onOpenTerminalAndRun={onOpenTerminalAndRun}
            composePaths={composePaths}
            containers={dockerContainers}
            loading={dockerLoading}
            error={dockerError}
            setError={setDockerError}
            servicesByPath={dockerServicesByPath}
            servicesLoading={dockerServicesLoading}
            onRefresh={onRefreshDocker}
          />
        </div>
      )}
      {activeView === 'files' && (
        <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-h-0">
          {openTabs.length > 0 ? (
            <>
              <div className="flex items-center gap-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0 min-h-0">
                <div className="flex items-center gap-0 overflow-x-auto min-w-0 flex-1">
                  {openTabs.map((path) => {
                    const active = path === activeTabPath;
                    return (
                      <div
                        key={path}
                        role="tab"
                        className={`flex items-center gap-1.5 px-3 py-2 border-r border-[var(--border)] cursor-pointer shrink-0 max-w-[200px] min-w-0 group ${
                          active ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                        }`}
                        onClick={() => onSelectTab?.(path)}
                        title={path}
                      >
                        <FileCode size={14} className="text-[var(--accent)] shrink-0" />
                        <span className="text-sm truncate min-w-0 flex-1">{basename(path)}</span>
                        {onCloseTab && (
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseTab(path);
                            }}
                            aria-label="Close tab"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {activeTabPath && onSaveFile && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className="flex items-center gap-1.5 px-3 py-1.5 m-2 rounded bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:pointer-events-none shrink-0"
                    title="Save to server"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                )}
              </div>
              {saveError && (
                <div className="px-4 py-2 bg-[var(--error)]/20 border-b border-[var(--error)]/40 text-[var(--error)] text-sm shrink-0">
                  {saveError}
                </div>
              )}
              {fileLoadError && (
                <div className="px-4 py-3 bg-[var(--error)]/15 border-b border-[var(--error)]/40 text-[var(--error)] text-sm shrink-0">
                  <p className="font-medium">Could not load file</p>
                  <p className="mt-1 text-[var(--text-primary)] break-words">{fileLoadError}</p>
                </div>
              )}
              <div className="flex-1 min-h-0 min-w-0" style={{ minHeight: 200 }}>
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
                    <Loader2 size={24} className="animate-spin mr-2" /> Loading...
                  </div>
                ) : activeTabPath ? (
                  <Editor
                    key={activeTabPath}
                    height="100%"
                    language={language}
                    theme="vs-dark"
                    value={activeContent}
                    onChange={(v) => onContentChange?.(activeTabPath, v ?? '')}
                    options={{
                      minimap: { enabled: true },
                      fontSize: 13,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      padding: { top: 16 },
                      automaticLayout: true,
                    }}
                    loading={null}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
              Select a file from the left to view or edit (e.g. Dockerfile, docker-compose.yml)
            </div>
          )}
        </div>
      )}
      {activeView === 'servers' && (
        <ServerOverview
          currentServer={currentServer}
          proxy={proxy}
          onViewChange={onViewChange}
          serverSysInfo={serverSysInfo}
          serverStatusLoading={serverStatusLoading}
          onRefreshServerStatus={onRefreshServerStatus}
        />
      )}
    </div>
  );
}
