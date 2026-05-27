import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode, Save, Loader2, X, Download, ChevronDown, Plus, FolderOpen, Shield, Play, Check, Copy, Keyboard, Terminal } from 'lucide-react';
import { motion } from 'motion/react';
import type { ServerConnection, ViewId, ProxySettings } from '../types';
import { DockerView } from './DockerView';
import { DeployView } from './DeployView';
import { ServerOverview } from './ServerOverview';
import { ServerMonitoringView } from './ServerMonitoringView';
import { DatabaseView } from './DatabaseView';

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
  selectedSnippet?: any;
  onSelectSnippet?: (snippet: any) => void;
  bottomPanelOpen?: boolean;
  bottomPanelTab?: 'logs' | 'terminal';
}

function SnippetDetails({
  snippet,
  onRun,
}: {
  snippet: any;
  onRun?: (cmd: string) => void;
}) {
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const getVariables = useCallback((cmd: string) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(cmd)) !== null) {
      const varName = match[1].trim();
      if (!matches.includes(varName)) {
        matches.push(varName);
      }
    }
    return matches;
  }, []);

  const variables = getVariables(snippet.command);

  useEffect(() => {
    const vals: Record<string, string> = {};
    variables.forEach((v) => {
      vals[v] = '';
    });
    setVarValues(vals);
  }, [snippet.id, snippet.command]);

  const getSubstitutedCommand = () => {
    let cmd = snippet.command;
    variables.forEach((v) => {
      const val = varValues[v]?.trim() || `{{${v}}}`;
      const escapedVar = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const varRegex = new RegExp(`\\{\\{\\s*${escapedVar}\\s*\\}\\}`, 'g');
      cmd = cmd.replace(varRegex, val);
    });
    return cmd;
  };

  const finalCommand = getSubstitutedCommand();

  const handleCopy = () => {
    navigator.clipboard.writeText(finalCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    if (onRun) {
      onRun(finalCommand);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex-1 flex flex-col min-h-0 bg-[var(--bg-primary)] p-6 space-y-6"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Terminal size={18} className="text-[var(--accent)]" />
            {snippet.title}
          </h2>
          {snippet.description && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl leading-relaxed">
              {snippet.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-semibold hover:border-[var(--text-muted)]/40 hover:bg-[var(--bg-tertiary)]/50 transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleRun}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-all cursor-pointer shadow-sm"
          >
            <Play size={12} fill="currentColor" />
            <span>Run Snippet</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-y-auto pr-1">
        {variables.length > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Snippet Variables
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {variables.map((v) => (
                <div key={v} className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] font-mono uppercase tracking-wide">
                    {v}
                  </label>
                  <input
                    type="text"
                    value={varValues[v] || ''}
                    onChange={(e) =>
                      setVarValues((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    placeholder={`Enter value for ${v}`}
                    className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] placeholder-[var(--text-muted)]/50 font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
          <div className="px-4 py-2 bg-[var(--bg-tertiary)]/30 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Command Preview
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-black/25">
            <pre className="text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap break-all leading-relaxed select-text selection:bg-[var(--accent)]/30">
              {finalCommand}
            </pre>
          </div>
        </div>
      </div>
    </motion.div>
  );
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
  selectedSnippet,
  onSelectSnippet,
  bottomPanelOpen = false,
  bottomPanelTab = 'logs',
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
            servers={servers}
            onSelectServer={onSelectServer}
            proxy={proxy}
            onOpenPanel={onPanelOpen}
            currentPath={_currentPath}
            basePath={_basePath}
            activeFilePath={activeTabPath}
            projectRepos={projectRepos}
            projectTreeListings={projectTreeListings}
            onOpenTerminalAndRun={onOpenTerminalAndRun}
            bottomPanelOpen={bottomPanelOpen}
            bottomPanelTab={bottomPanelTab}
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
      {activeView === 'monitoring' && (
        <div className="flex-1 flex flex-col min-h-0">
          <ServerMonitoringView
            currentServer={currentServer}
            proxy={proxy}
          />
        </div>
      )}
      {activeView === 'database' && (
        <div className="flex-1 flex flex-col min-h-0">
          <DatabaseView
            currentServer={currentServer}
            proxy={proxy}
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
                ) : fileLoadError ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-full p-6 text-center text-[var(--text-secondary)] gap-4"
                  >
                    <div className="p-3 rounded-full bg-[var(--error)]/10 text-[var(--error)]">
                      <FileCode size={32} />
                    </div>
                    <div className="max-w-md">
                      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Failed to load file</h3>
                      <p className="text-xs text-[var(--text-muted)] mb-4 font-mono whitespace-pre-wrap break-all bg-[var(--bg-tertiary)]/50 p-2.5 rounded border border-[var(--border)]">{fileLoadError}</p>
                      <button
                        type="button"
                        onClick={() => activeTabPath && onOpenFileByPath?.(activeTabPath, { useSudo: activeTabUsesSudo })}
                        className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors"
                      >
                        Failed to load file — click to retry
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
      {activeView === 'snippets' && (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[var(--bg-primary)]">
          {selectedSnippet ? (
            <SnippetDetails
              snippet={selectedSnippet}
              onRun={onOpenTerminalAndRun}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] text-sm gap-3 select-none"
            >
              <Keyboard size={36} className="text-[var(--text-muted)] animate-pulse" />
              <p className="font-medium text-xs tracking-wide">← Select a snippet to preview and run it</p>
              <span className="text-[10px] text-[var(--text-muted)] px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border)] font-mono">
                Press Esc or click search box to clear filter
              </span>
            </motion.div>
          )}
        </div>
      )}
      {(activeView === 'servers' || activeView === 'notes') && (
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
