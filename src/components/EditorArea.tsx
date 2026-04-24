import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode, Save, Loader2, X, Download, ChevronDown, Plus, FolderOpen, Shield } from 'lucide-react';
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
  onSaveFile?: (filePath: string, content: string, opts?: { useSudo?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  onCloseTab?: (path: string) => void;
  onSelectTab?: (path: string) => void;
  onOpenFileByPath?: (filePath: string, opts?: { useSudo?: boolean }) => void;
  onCreateFileByPath?: (filePath: string, opts?: { useSudo?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  activeTabUsesSudo?: boolean;
  /** Save remote file to disk via native dialog (Electron). */
  onDownloadRemoteFile?: (remoteFilePath: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string; savedTo?: string }>;
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
  onOpenFileByPath,
  onCreateFileByPath,
  activeTabUsesSudo = false,
  onDownloadRemoteFile,
  composePaths = [],
  projectRepos = [],
  projectTreeListings = {},
}: EditorAreaProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [pathDialogMode, setPathDialogMode] = useState<'open' | 'create'>('open');
  const [pathDialogSudo, setPathDialogSudo] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const activeContent = activeTabPath ? (contentByPath[activeTabPath] ?? '') : '';
  const activeSaved = activeTabPath ? (savedContentByPath[activeTabPath] ?? '') : '';
  const isDirty = activeTabPath ? activeContent !== activeSaved : false;
  const isLoading = Boolean(loadingPath && activeTabPath === loadingPath);
  const language = activeTabPath ? languageFromPath(activeTabPath) : 'plaintext';

  useEffect(() => {
    setSaveError(null);
    setDownloadError(null);
    setFileMenuOpen(false);
    setPathDialogOpen(false);
  }, [activeTabPath]);

  useEffect(() => {
    if (!fileMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setFileMenuOpen(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [fileMenuOpen]);

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

  const handleDownload = useCallback(() => {
    if (!activeTabPath || !onDownloadRemoteFile) return;
    setDownloading(true);
    setDownloadError(null);
    onDownloadRemoteFile(activeTabPath)
      .then((res) => {
        if (res.canceled) return;
        if (!res.ok) setDownloadError(res.error || 'Download failed');
      })
      .finally(() => setDownloading(false));
  }, [activeTabPath, onDownloadRemoteFile]);

  const handleOpenFromPath = useCallback((useSudo: boolean) => {
    const suggested = (activeTabPath || _currentPath || _basePath || '').trim() || '.';
    setPathDialogMode('open');
    setPathDialogSudo(useSudo);
    setPathInput(suggested === '.' ? '' : suggested);
    setPathDialogOpen(true);
    setFileMenuOpen(false);
  }, [activeTabPath, _basePath, _currentPath]);

  const handleCreateFromPath = useCallback((useSudo: boolean) => {
    const base = ((_currentPath && _currentPath !== '.') ? _currentPath.replace(/\/+$/, '') + '/' : '');
    const suggested = `${base}new-file.txt`;
    setPathDialogMode('create');
    setPathDialogSudo(useSudo);
    setPathInput(suggested);
    setPathDialogOpen(true);
    setFileMenuOpen(false);
  }, [_currentPath]);

  const submitPathDialog = useCallback(() => {
    const path = pathInput.trim().replace(/^\.\/+/, '');
    if (!path || path === '.') {
      setSaveError('Please enter a valid file path');
      return;
    }
    setSaveError(null);
    setDownloadError(null);
    if (pathDialogMode === 'open') {
      onOpenFileByPath?.(path, { useSudo: pathDialogSudo });
    } else {
      onCreateFileByPath?.(path, { useSudo: pathDialogSudo }).then((res) => {
        if (!res.ok) setSaveError(res.error || 'Create file failed');
      });
    }
    setPathDialogOpen(false);
  }, [onCreateFileByPath, onOpenFileByPath, pathDialogMode, pathDialogSudo, pathInput]);

  const handleSaveAsSudo = useCallback(() => {
    if (!activeTabPath || !onSaveFile) return;
    setSaving(true);
    setSaveError(null);
    onSaveFile(activeTabPath, activeContent, { useSudo: true })
      .then((res) => {
        if (!res.ok) setSaveError(res.error || 'Save failed');
      })
      .finally(() => setSaving(false));
    setFileMenuOpen(false);
  }, [activeContent, activeTabPath, onSaveFile]);
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
          {pathDialogOpen && (
            <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
                  {pathDialogMode === 'open'
                    ? (pathDialogSudo ? 'Open file as sudo' : 'Open file')
                    : (pathDialogSudo ? 'Create file as sudo' : 'Create file')}
                </p>
                <input
                  autoFocus
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPathDialog();
                    if (e.key === 'Escape') setPathDialogOpen(false);
                  }}
                  placeholder="e.g. /etc/nginx/nginx.conf or app/config.json"
                  className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPathDialogOpen(false)}
                    className="px-3 py-1.5 rounded border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitPathDialog}
                    className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)]"
                  >
                    {pathDialogMode === 'open' ? 'Open' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}
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
                {activeTabPath && onDownloadRemoteFile && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 m-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/50 disabled:opacity-50 shrink-0"
                    title="Download a copy to your computer"
                  >
                    {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Download
                  </button>
                )}
                {onOpenFileByPath && (
                  <button
                    type="button"
                    onClick={() => handleOpenFromPath(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 m-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/50 shrink-0"
                    title="Edit file by path"
                  >
                    <FolderOpen size={14} />
                    Edit
                  </button>
                )}
                {onCreateFileByPath && (
                  <button
                    type="button"
                    onClick={() => handleCreateFromPath(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 m-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/50 shrink-0"
                    title="Create file by path"
                  >
                    <Plus size={14} />
                    Create
                  </button>
                )}
                {(onOpenFileByPath || onCreateFileByPath || (activeTabPath && onSaveFile)) && (
                  <div className="relative shrink-0" ref={menuRef}>
                    <button
                      type="button"
                      onClick={() => setFileMenuOpen((v) => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 m-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/50"
                      title="File actions"
                    >
                      File
                      <ChevronDown size={14} />
                    </button>
                    {fileMenuOpen && (
                      <div className="absolute right-2 top-full mt-1 py-1 min-w-[190px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg z-20">
                        {onOpenFileByPath && (
                          <>
                            <button type="button" onClick={() => handleOpenFromPath(false)} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                              <FolderOpen size={12} />
                              Open by path
                            </button>
                            <button type="button" onClick={() => handleOpenFromPath(true)} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                              <Shield size={12} />
                              Open as sudo
                            </button>
                          </>
                        )}
                        {onCreateFileByPath && (
                          <>
                            <button type="button" onClick={() => handleCreateFromPath(false)} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                              <Plus size={12} />
                              Create by path
                            </button>
                            <button type="button" onClick={() => handleCreateFromPath(true)} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                              <Shield size={12} />
                              Create as sudo
                            </button>
                          </>
                        )}
                        {activeTabPath && onSaveFile && (
                          <>
                            <div className="border-t border-[var(--border)] my-1" />
                            <button type="button" onClick={handleSaveAsSudo} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                              <Shield size={12} />
                              Save as sudo
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                {activeTabPath && activeTabUsesSudo && (
                  <span className="mr-2 px-2 py-1 rounded-full text-[10px] font-medium bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
                    sudo mode
                  </span>
                )}
              </div>
              {(saveError || downloadError) && (
                <div className="px-4 py-2 bg-[var(--error)]/20 border-b border-[var(--error)]/40 text-[var(--error)] text-sm shrink-0">
                  {saveError || downloadError}
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
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] text-sm gap-3">
              <p>Select a file from the left to view or edit (e.g. Dockerfile, docker-compose.yml)</p>
              <div className="flex items-center gap-2">
                {onOpenFileByPath && (
                  <button
                    type="button"
                    onClick={() => handleOpenFromPath(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/50"
                  >
                    <FolderOpen size={14} />
                    Edit by path
                  </button>
                )}
                {onCreateFileByPath && (
                  <button
                    type="button"
                    onClick={() => handleCreateFromPath(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm font-medium hover:border-[var(--accent)]/50"
                  >
                    <Plus size={14} />
                    Create by path
                  </button>
                )}
              </div>
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
