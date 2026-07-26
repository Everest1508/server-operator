import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode, Save, Loader2, X, Download, ChevronDown, Plus, FolderOpen, Shield, Play, Check, Copy, Keyboard, Terminal, Database, Workflow, History, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { ServerConnection, ViewId, ProxySettings } from '../types';
import { DockerView } from './DockerView';
import { DeployView } from './DeployView';
import { ServerOverview } from './ServerOverview';
import { DatabaseView } from './DatabaseView';
import { FirewallView } from './FirewallView';

function languageFromPath(path: string): string {
  if (path.startsWith('notes://')) return 'markdown';
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
  onSelectServer?: (server: ServerConnection) => void;
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
  deploySelectedProjectPath?: string;
  deployContextText?: string;
  deployContextLoading?: boolean;
  bottomPanelOpen?: boolean;
  bottomPanelTab?: 'logs' | 'terminal';
  selectedGuideId?: string;
  connectedSqlitePath?: string | null;
  onSqliteDisconnect?: () => void;
}

function basename(path: string): string {
  if (path === 'notes://general') return 'General Notes';
  if (path === 'notes://server') return 'Server Notes';
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

export function EditorArea({
  currentServer,
  servers,
  onSelectServer,
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
  deploySelectedProjectPath = '',
  deployContextText = '',
  deployContextLoading = false,
  bottomPanelOpen = false,
  bottomPanelTab = 'logs',
  selectedGuideId = 'database',
  connectedSqlitePath = null,
  onSqliteDisconnect,
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

  if (!currentServer && activeView !== 'guide') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary text-text-secondary select-none">
        <p className="text-xs font-mono text-text-muted">Select a server to view analytics, configurations, and logs.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary">
      {currentServer && (
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ display: activeView === 'deploy' ? 'flex' : 'none' }}
        >
          <DeployView
            currentServer={currentServer}
            servers={servers}
            onSelectServer={onSelectServer}
            proxy={proxy}
            onOpenPanel={onPanelOpen}
            currentPath={_currentPath}
            basePath={_basePath}
            activeFilePath={activeTabPath}
            projectRepos={projectRepos}
            projectTreeListings={projectTreeListings}
            selectedDeployProjectPath={deploySelectedProjectPath}
            deployContextText={deployContextText}
            loadingDeployContext={deployContextLoading}
            onOpenTerminalAndRun={onOpenTerminalAndRun}
            bottomPanelOpen={bottomPanelOpen}
            bottomPanelTab={bottomPanelTab}
          />
        </div>
      )}
      {activeView === 'docker' && currentServer && (
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

      <div className={activeView === 'database' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        <DatabaseView
          currentServer={currentServer}
          proxy={proxy}
          activeView={activeView}
          connectedSqlitePath={connectedSqlitePath}
          onSqliteDisconnect={onSqliteDisconnect}
        />
      </div>

      {activeView === 'firewall' && currentServer && (
        <div className="flex-1 flex flex-col min-h-0">
          <FirewallView currentServer={currentServer} proxy={proxy} />
        </div>
      )}
      {activeView === 'files' && (
        <div className="flex-1 flex flex-col bg-bg-primary min-h-0 relative">
          {pathDialogOpen && (
            <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-bg-secondary/95 shadow-2xl p-6">
                <p className="text-sm font-semibold text-text-primary mb-3">
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/40 bg-bg-primary/50 text-text-primary text-xs placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-150 font-mono"
                />
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPathDialogOpen(false)}
                    className="px-4 py-2 rounded-xl border border-border/40 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/30 transition-all cursor-pointer font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitPathDialog}
                    className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover shadow-sm transition-all cursor-pointer"
                  >
                    {pathDialogMode === 'open' ? 'Open' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {openTabs.length > 0 ? (
            <>
              <div className="flex items-center justify-between bg-bg-secondary/35 border-b border-border/20 px-2 py-1.5 shrink-0 min-h-0 select-none">
                <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 flex-1 pr-4">
                  {openTabs.map((path) => {
                    const active = path === activeTabPath;
                    return (
                      <div
                        key={path}
                        role="tab"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer shrink-0 max-w-[200px] min-w-0 group transition-all duration-150 border text-xs ${
                          active
                            ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
                            : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
                        }`}
                        onClick={() => onSelectTab?.(path)}
                        title={path}
                      >
                        <FileCode size={13} className={active ? 'text-accent shrink-0' : 'text-text-muted shrink-0'} />
                        <span className="truncate min-w-0 flex-1 font-sans">{basename(path)}</span>
                        {onCloseTab && (
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-all duration-100 shrink-0 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseTab(path);
                            }}
                            aria-label="Close tab"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {activeTabPath && activeTabUsesSudo && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-error/10 text-error uppercase tracking-wider border border-error/20 mr-1 animate-pulse">
                      sudo mode
                    </span>
                  )}
                  {activeTabPath && onDownloadRemoteFile && (
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={downloading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/30 bg-bg-primary/40 text-text-primary text-xs font-semibold hover:bg-bg-tertiary/60 hover:border-border/60 disabled:opacity-50 transition-all duration-150 shrink-0 cursor-pointer"
                      title="Download a copy to your computer"
                    >
                      {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      Download
                    </button>
                  )}
                  {onOpenFileByPath && (
                    <button
                      type="button"
                      onClick={() => handleOpenFromPath(false)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/30 bg-bg-primary/40 text-text-primary text-xs font-semibold hover:bg-bg-tertiary/60 hover:border-border/60 shrink-0 transition-all duration-150 cursor-pointer"
                      title="Edit file by path"
                    >
                      <FolderOpen size={12} />
                      Edit
                    </button>
                  )}
                  {onCreateFileByPath && (
                    <button
                      type="button"
                      onClick={() => handleCreateFromPath(false)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/30 bg-bg-primary/40 text-text-primary text-xs font-semibold hover:bg-bg-tertiary/60 hover:border-border/60 shrink-0 transition-all duration-150 cursor-pointer"
                      title="Create file by path"
                    >
                      <Plus size={12} />
                      Create
                    </button>
                  )}
                  {(onOpenFileByPath || onCreateFileByPath || (activeTabPath && onSaveFile)) && (
                    <div className="relative shrink-0" ref={menuRef}>
                      <button
                        type="button"
                        onClick={() => setFileMenuOpen((v) => !v)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/30 bg-bg-primary/40 text-text-primary text-xs font-semibold hover:bg-bg-tertiary/60 hover:border-border/60 shrink-0 transition-all duration-150 cursor-pointer"
                        title="File actions"
                      >
                        File
                        <ChevronDown size={12} />
                      </button>
                      {fileMenuOpen && (
                        <div className="absolute right-0 top-full mt-1.5 py-1.5 px-1 min-w-[190px] rounded-xl border border-border/40 bg-bg-tertiary/95 shadow-2xl backdrop-blur-md z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                          {onOpenFileByPath && (
                            <>
                              <button type="button" onClick={() => handleOpenFromPath(false)} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer">
                                <FolderOpen size={12} />
                                Open by path
                              </button>
                              <button type="button" onClick={() => handleOpenFromPath(true)} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer">
                                <Shield size={12} />
                                Open as sudo
                              </button>
                            </>
                          )}
                          {onCreateFileByPath && (
                            <>
                              <button type="button" onClick={() => handleCreateFromPath(false)} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer">
                                <Plus size={12} />
                                Create by path
                              </button>
                              <button type="button" onClick={() => handleCreateFromPath(true)} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer">
                                <Shield size={12} />
                                Create as sudo
                              </button>
                            </>
                          )}
                          {activeTabPath && onSaveFile && (
                            <>
                              <div className="border-t border-border/20 my-1" />
                              <button type="button" onClick={handleSaveAsSudo} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer">
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
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-hover shadow-sm disabled:opacity-40 disabled:pointer-events-none transition-all duration-150 shrink-0 cursor-pointer"
                      title="Save to server"
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Save
                    </button>
                  )}
                </div>
              </div>
              {(saveError || downloadError) && (
                <div className="px-4 py-2 bg-error/10 border-b border-error/20 text-error text-xs shrink-0 select-none font-mono">
                  {saveError || downloadError}
                </div>
              )}
              {fileLoadError && (
                <div className="px-4 py-3 bg-error/10 border-b border-error/20 text-error text-xs shrink-0 select-none">
                  <p className="font-semibold text-error">Could not load file</p>
                  <p className="mt-1 text-text-primary break-words font-mono">{fileLoadError}</p>
                </div>
              )}
              <div className="flex-1 min-h-[200px] min-w-0">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-3 select-none">
                    <Loader2 size={24} className="animate-spin text-accent" />
                    <span className="text-xs font-mono text-text-muted">Fetching file content...</span>
                  </div>
                ) : fileLoadError ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-full p-6 text-center text-text-secondary gap-4 select-none"
                  >
                    <div className="p-3 rounded-full bg-error/10 text-error border border-error/20">
                      <FileCode size={24} />
                    </div>
                    <div className="max-w-md">
                      <h3 className="text-sm font-bold text-text-primary mb-1">Failed to load file</h3>
                      <p className="text-[11px] text-text-muted mb-4 font-mono whitespace-pre-wrap break-all bg-bg-tertiary/50 p-2.5 rounded-xl border border-border/40">{fileLoadError}</p>
                      <button
                        type="button"
                        onClick={() => activeTabPath && onOpenFileByPath?.(activeTabPath, { useSudo: activeTabUsesSudo })}
                        className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                      >
                        Retry Loading File
                      </button>
                    </div>
                  </motion.div>
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
                      contextmenu: false,
                    }}
                    loading={null}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-xs gap-4 select-none">
              <p className="text-text-muted font-sans text-center max-w-sm px-4">Select a configuration or project file in the sidebar explorer to edit, or access direct paths below.</p>
              <div className="flex items-center gap-2">
                {onOpenFileByPath && (
                  <button
                    type="button"
                    onClick={() => handleOpenFromPath(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 bg-bg-secondary text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all cursor-pointer shadow-sm"
                  >
                    <FolderOpen size={12} />
                    Open by Path
                  </button>
                )}
                {onCreateFileByPath && (
                  <button
                    type="button"
                    onClick={() => handleCreateFromPath(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 bg-bg-secondary text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all cursor-pointer shadow-sm"
                  >
                    <Plus size={12} />
                    Create by Path
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeView === 'guide' && (
        <div className="flex-1 flex flex-col min-h-0 bg-bg-primary p-6 overflow-y-auto select-none">
          {(() => {
            const guides = [
              {
                id: 'database',
                title: 'Database Manager & SQL Query Runner',
                icon: Database,
                badge: 'SQL Client',
                color: '#4ec9b0',
                description: 'Establish end-to-end encrypted connections to remote PostgreSQL, MySQL/MariaDB, and Redis instances. Write and execute queries inside Monaco Editor with dynamic schema autocompletion, query timers, and instant CSV exports—fully offline-ready without exposing ports to the public Internet.',
                howItWorks: 'Instead of requiring you to expose raw database ports (like 5432 or 3306) on your firewalls or configure complex VPC security groups, Server Operator uses your active SSH connection to establish secure local TCP port forwarding. When you initiate a connection, our Node.js main process starts a temporary local TCP server on your machine on a randomized free port. Any traffic received on this local port is intercepted, encrypted, and safely encapsulated inside the active SSH tunnel, before being forwarded directly to the target database host relative to the remote server itself. When the tunnel is open, the app initiates a direct database driver connection to the local port, meaning your data travels securely inside the SSH stream. Furthermore, the schema explorer immediately executes specialized system catalog queries to discover available tables, columns, and Redis keys, dynamically injecting them into Monaco Editor\'s autocomplete provider.',
                steps: [
                  'Open the Feature Guide or navigate to the Database tab in the left-hand Activity Bar.',
                  'Select your database engine (PostgreSQL, MySQL, or Redis) from the engine selector. The default port and connection user fields will automatically populate.',
                  'Specify the target database parameters. Enter the host (use "127.0.0.1" if the database is running on the same server, or a private IP like "10.0.0.8" if it resides inside the remote server\'s local network), authentication details, and the name or index of the database.',
                  'Click the "Establish DB Tunnel" button. The system will securely perform the SSH port forwarding handshake and test database access. On successful connection, the indicator will turn green, displaying "Active Tunnel" and the local port in use.',
                  'Explore the Database Sidebar to inspect your tables or Redis keys. Double-clicking any item will instantly generate and populate a query script into your workspace.',
                  'Compose your query inside the Monaco workspace. Click "Run Query" (or press Cmd+Enter / Ctrl+Enter) to execute the statement. Browse paginated rows in the spreadsheet-like grid, analyze execution timings, and click "Export CSV" to save the results to your computer.'
                ],
                tips: 'Because the database client operates inside your encrypted SSH tunnel, you can query private databases, Amazon RDS instances, or isolated Docker database containers that are completely inaccessible to the rest of the web.'
              },
              {
                id: 'pipeline',
                title: 'Git-based Deployment Pipeline',
                icon: Workflow,
                badge: 'Builds & Deploys',
                color: '#3794ff',
                description: 'Trigger reliable, zero-downtime application updates directly from your repositories. Serop automates remote Git branch checkouts, dependency resolution (npm, pip, composer), database migrations, and service restarts with live terminal logging.',
                howItWorks: 'The deployment pipeline simplifies operations by executing automated build recipes over a secure, non-interactive SSH terminal stream. First, it verifies that the target directory is a valid repository by checking the Git tree. It then fetches active remote repository references, checks out your selected branch, and runs a hard reset ("git reset --hard origin/<branch>") to eliminate any untracked or locally modified file conflicts that could block the build. Next, it searches for a specialized ".server-operator" folder in the project root. If found, it automatically executes lifecycle scripts (such as "pre-deploy.sh" and "post-deploy.sh") to run package managers, transpile frontend bundles, and run database migrations. Finally, it signals your chosen process manager (PM2 or systemd) to perform a graceful reload of your services, ensuring continuous uptime.',
                steps: [
                  'Select the "Deploy" tab on the left-hand Activity Bar (CloudUpload icon).',
                  'Select your target project repository from the project path dropdown list. If your directory is not registered yet, click "Add Current Path as Project" or run "git init" via the remote terminal.',
                  'Choose the git branch you want to pull, build, and publish.',
                  'Choose your preferred process manager: select "PM2" (for Node.js processes) and specify the app name, or "systemd" (for Python, Go, Rust, or system services) and specify the system service name.',
                  'Click the "Deploy Now" button. The app will immediately lock input controls to prevent concurrent builds, open a dedicated terminal stream, and run the pipeline.',
                  'Monitor stdout and stderr streams in real-time as packages install, assets compile, and services restart. The output will flag green on success or red on failure.'
                ],
                tips: 'You can write advanced deployment scripts by creating a ".server-operator/post-deploy.sh" file in your repo. Remember to run "chmod +x .server-operator/*.sh" so the script has execution rights on your remote server!'
              },
              {
                id: 'history',
                title: 'Deployment History & SQLite Rollbacks',
                icon: History,
                badge: 'Audit & Rollback',
                color: '#fbbf24',
                description: 'Maintain a robust, local SQLite audit ledger of all production build attempts. Inspect complete historical terminal logs, track deployment timings, and execute instant rollbacks to any previously successful commit with one click.',
                howItWorks: 'To ensure maximum reliability and transparency, Server Operator runs a local SQLite database ("alerts.db") inside your computer\'s Application Support directory. Every time a build is triggered, the system commits an audit entry containing the server configuration, branch, commit hash, timestamp, and triggered action. Throughout the build process, the entire console output is captured and saved as a text blob in SQLite upon completion, ensuring a permanent log history. If an update introduces a breaking change, clicking "Rollback" extracts the precise previous commit hash from this local database, connects via SSH to run "git checkout <commit_hash>", and re-runs the service manager reload sequence to immediately restore stability.',
                steps: [
                  'Open the "Deploy" panel in the left-hand Activity Bar, and switch to the "History & Logs" sub-tab.',
                  'Review the chronological list of all previous deployment sessions. You can filter by project or browse build statuses (green for success, red for errors).',
                  'Click the "View Output Log" button on any build card to open the complete terminal output history saved from that run.',
                  'To revert a regression, locate a healthy successful deployment in the log timeline, click the "Rollback" button, verify the commit details, and click "Revert Now".'
                ],
                tips: 'Because the history ledger is stored locally in a SQLite database, your build history is fully preserved even if you completely rebuild the remote server or switch SSH connection profiles.'
              },
              {
                id: 'updates',
                title: 'GitHub Auto-Update System',
                icon: Sparkles,
                badge: 'Lifecycle',
                color: '#f0abfc',
                description: 'Keep your workspace up to date with zero effort. The auto-update system quietly performs semantic version checks on startup and displays non-intrusive floating toasts with markdown changelogs.',
                howItWorks: 'Upon application boot, Server Operator initiates a single, lightweight, asynchronous HTTP request to the official GitHub Releases API. It compares the remote latest tag version (e.g. "v1.2.0") against your local version tag using semver parsing. If a new release is available, the app injects a floating toast notification in the bottom right corner of the workspace. Clicking the "View Release Notes" button loads the complete markdown release notes and displays them inside the Settings Changelog tab. Clicking "Dismiss" saves a skip preference for that specific version tag in your browser\'s local storage, preventing further prompts for that release.',
                steps: [
                  'Launch Server Operator. If an update is detected, a toast alert will slide in from the bottom-right corner.',
                  'Click "View Release Notes" to read the new features, performance tweaks, and bug fixes directly in the Settings area.',
                  'Click "Dismiss" to skip the notification. The alert will remain hidden until a brand new release is published to GitHub.',
                  'To trigger a manual check at any time, open the menu bar and click Help → Check for Updates.'
                ],
                tips: 'The update check is completely non-intrusive. If you are offline or working in an air-gapped environment, the check fails silently without throwing error dialogues or using system memory.'
              }
            ];

            const active = guides.find((g) => g.id === selectedGuideId) || guides[0];
            const ActiveIcon = active.icon;

            return (
              <div className="flex-1 flex flex-col min-h-0 space-y-6 max-w-4xl mx-auto w-full select-text selection:bg-accent/30 selection:text-white">
                <div className="flex items-start justify-between gap-4 border-b border-border/20 pb-5 select-none">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        style={{ color: active.color, backgroundColor: `${active.color}15`, borderColor: `${active.color}30` }}
                        className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider"
                      >
                        {active.badge}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-text-primary flex items-center gap-2.5 mt-2.5">
                      <ActiveIcon size={22} style={{ color: active.color }} />
                      {active.title}
                    </h2>
                    <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                      {active.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* How It Works */}
                  <div className="p-5 rounded-xl bg-bg-secondary/40 border border-border/20 backdrop-blur-sm shadow-sm">
                    <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-text-primary mb-2.5 flex items-center gap-2 select-none">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active.color }} />
                      Under the Hood
                    </h3>
                    <p className="text-xs text-text-secondary leading-relaxed font-sans">{active.howItWorks}</p>
                  </div>

                  {/* Usage Steps */}
                  <div className="p-5 rounded-xl bg-bg-secondary/40 border border-border/20 backdrop-blur-sm shadow-sm space-y-4">
                    <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-text-primary flex items-center gap-2 select-none">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active.color }} />
                      Step-by-Step Instructions
                    </h3>
                    <ol className="space-y-3">
                      {active.steps.map((step, i) => (
                        <li key={i} className="flex gap-3 text-xs leading-relaxed text-text-secondary align-top">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-bg-primary border border-border/40 text-[9px] font-bold text-text-primary shrink-0 mt-0.5 select-none">
                            {i + 1}
                          </span>
                          <span className="pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Pro Tips */}
                  {active.tips && (
                    <div className="p-5 rounded-xl bg-accent/5 border border-accent/20 border-dashed">
                      <span className="text-[9px] font-extrabold text-accent uppercase tracking-widest block mb-1.5 select-none">
                        ✦ Pro Tip
                      </span>
                      <p className="text-xs text-text-secondary leading-relaxed italic">{active.tips}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {(activeView === 'servers' || activeView === 'notes') && currentServer && (
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
