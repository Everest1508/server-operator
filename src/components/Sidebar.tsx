import { useState, useRef, useEffect } from 'react';
import {
  Trash2,
  Server as ServerIcon,
  ChevronRight,
  Folder,
  FileCode,
  Loader2,
  RefreshCw,
  FilePlus,
  FolderPlus,
  ChevronsUp,
  GitBranch,
  FolderGit2,
  FileText,
  Box,
  Upload,
  Pencil,
  Scissors,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ServerConnection, ViewId, FileTreeClipboard } from '../types';
import { parseLsLine } from '../utils/parseLs';
import { Tooltip } from './Tooltip';
import { NotesSidebar } from './NotesSidebar';

interface FileTreeMenuState {
  kind: 'entry' | 'background';
  x: number;
  y: number;
  /** Entry path when kind === 'entry' */
  path?: string;
  isDir?: boolean;
  /** Target folder for paste when kind === 'background' */
  targetDir?: string;
}

interface SidebarProps {
  activeView: ViewId;
  servers: ServerConnection[];
  currentServer: ServerConnection | null;
  connectingTo: string | null;
  connectionError: string | null;
  onSelectServer: (s: ServerConnection | null) => void;
  onRemoveServer: (id: string) => void;
  onDismissError: () => void;
  treeListings?: Record<string, string>;
  openFolders?: Set<string>;
  loadingPaths?: Set<string>;
  filesError?: string | null;
  currentPath?: string;
  basePath?: string;
  onToggleFolder?: (path: string) => void;
  onOpenFile?: (path: string) => void;
  onLoadDir?: (path: string, forceRefresh?: boolean) => void;
  onCreateFile?: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onCreateFolder?: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteEntry?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onCollapseAll?: () => void;
  onMakeGitRepo?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onAddAsProject?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onAddToLogs?: (filePath: string) => void;
  /** Pick a local file and upload into the current browse directory (Electron). */
  onUploadLocalFile?: () => void | Promise<void>;
  uploadBusy?: boolean;
  fileTreeClipboard?: FileTreeClipboard | null;
  onFileTreeCopyPaths?: (paths: string[]) => void;
  onFileTreeCutPaths?: (paths: string[]) => void;
  onFileTreePasteInto?: (targetDir: string) => Promise<{ ok: boolean; error?: string }>;
  onFileTreeRenamePath?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onFileTreeDuplicatePath?: (path: string, isDir: boolean) => Promise<{ ok: boolean; error?: string }>;
  onFileTreeActionMessage?: (message: string | null) => void;
  selectedGuideId?: string;
  onSelectGuideId?: (id: string) => void;
}

function buildPath(prefix: string, name: string): string {
  const p = (prefix || '.').trim() || '.';
  return p === '.' ? name : `${p}/${name}`;
}

export function Sidebar({
  activeView,
  servers,
  currentServer,
  connectingTo,
  connectionError,
  onSelectServer,
  onRemoveServer,
  onDismissError,
  treeListings = {},
  openFolders = new Set(),
  loadingPaths = new Set(),
  filesError = null,
  currentPath = '.',
  basePath = '.',
  onToggleFolder,
  onOpenFile,
  onLoadDir,
  onCreateFile,
  onCreateFolder,
  onDeleteEntry,
  onCollapseAll,
  onMakeGitRepo,
  onAddAsProject,
  onAddToLogs,
  onUploadLocalFile,
  uploadBusy = false,
  fileTreeClipboard = null,
  onFileTreeCopyPaths,
  onFileTreeCutPaths,
  onFileTreePasteInto,
  onFileTreeRenamePath,
  onFileTreeDuplicatePath,
  onFileTreeActionMessage,
  selectedGuideId,
  onSelectGuideId,
}: SidebarProps) {
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fileTreeMenu, setFileTreeMenu] = useState<FileTreeMenuState | null>(null);
  const [contextMenuAction, setContextMenuAction] = useState<string | null>(null);
  const [showDotfiles, setShowDotfiles] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  const [serverStatuses, setServerStatuses] = useState<Record<string, 'green' | 'yellow' | 'red'>>({});

  useEffect(() => {
    let isMounted = true;
    if (window.serverOperator && window.serverOperator.getMonitoredServersStatus) {
      window.serverOperator.getMonitoredServersStatus().then((list) => {
        if (!isMounted) return;
        const mapping: Record<string, 'green' | 'yellow' | 'red'> = {};
        for (const item of list) {
          mapping[item.serverId] = item.status;
        }
        setServerStatuses(mapping);
      }).catch((err) => {
        console.error('Failed to get initial server status:', err);
      });
    }

    const handleUpdate = (e: Event) => {
      const list = (e as CustomEvent).detail;
      if (Array.isArray(list)) {
        const mapping: Record<string, 'green' | 'yellow' | 'red'> = {};
        for (const item of list) {
          mapping[item.serverId] = item.status;
        }
        setServerStatuses(mapping);
      }
    };

    window.addEventListener('monitored-servers-status-updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('monitored-servers-status-updated', handleUpdate);
    };
  }, []);


  useEffect(() => {
    if (!fileTreeMenu) return;
    const close = () => setFileTreeMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [fileTreeMenu]);

  useEffect(() => {
    if (creatingType) {
      setCreatingName('');
      setCreateError(null);
      createInputRef.current?.focus();
    }
  }, [creatingType]);

  const handleCreateSubmit = async () => {
    const name = creatingName.trim();
    if (!name) {
      setCreatingType(null);
      return;
    }
    if (name.includes('/')) {
      setCreateError('Name cannot contain /');
      return;
    }
    const type = creatingType;
    setCreateError(null);
    setCreatingType(null);
    setCreating(true);
    try {
      if (type === 'file' && onCreateFile) {
        const res = await onCreateFile(name);
        if (!res.ok) setCreateError(res.error || 'Failed to create file');
      } else if (type === 'folder' && onCreateFolder) {
        const res = await onCreateFolder(name);
        if (!res.ok) setCreateError(res.error || 'Failed to create folder');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateSubmit();
    } else if (e.key === 'Escape') {
      setCreatingType(null);
      setCreateError(null);
    }
  };

  const pathDisplay = currentPath === '.' || currentPath === '' ? basePath || '/' : `${basePath}/${currentPath}`.replace(/^\.\//, '');
  const showFileBrowser = activeView === 'files' && currentServer && onToggleFolder && onOpenFile && onLoadDir;
  const canCreate = showFileBrowser && (onCreateFile || onCreateFolder);
  const rootLoading = loadingPaths.has('.');
  const canPasteFiles =
    Boolean(
      fileTreeClipboard &&
      currentServer &&
      fileTreeClipboard.paths.length > 0 &&
      fileTreeClipboard.serverId === currentServer.id
    ) && Boolean(onFileTreePasteInto);

  function TreeFolder({ pathKey, depth }: { pathKey: string; depth: number }) {
    const listing = treeListings[pathKey];
    const loading = loadingPaths.has(pathKey);
    const isOpen = openFolders.has(pathKey);
    const lines = (listing || '').trim().split('\n').filter(Boolean);
    const sortedEntries = lines
      .map((line) => parseLsLine(line))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .filter((p) => showDotfiles || !p.name.startsWith('.'));
    sortedEntries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    if (pathKey === '.' && loading && !listing) {
      return (
        <div className="flex items-center gap-2 py-1 rounded" style={{ paddingLeft: 8 }}>
          <Loader2 size={14} className="animate-spin shrink-0 text-text-secondary" />
          <span className="text-text-secondary text-sm">Loading…</span>
        </div>
      );
    }

    // For root we only render children (no row for '.'). For subfolders always show the folder row; children only when isOpen.
    return (
      <>
        {pathKey === '.' ? null : (
          <div
            data-tree-row
            className="group flex items-center gap-0 rounded min-w-0 w-full"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setFileTreeMenu({ kind: 'entry', x: e.clientX, y: e.clientY, path: pathKey, isDir: true });
            }}
          >
            <button
              type="button"
              onClick={() => onToggleFolder?.(pathKey)}
              className="flex-1 min-w-0 text-left rounded hover:bg-bg-tertiary text-text-primary truncate flex items-center gap-2"
              style={{ paddingLeft: depth * 12 + 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
              title={pathKey}
            >
              <ChevronRight size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              <Folder size={14} className="shrink-0 text-accent" />
              <span className="truncate">{pathKey.split('/').pop() || pathKey}</span>
            </button>
            {onDeleteEntry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const name = pathKey.split('/').pop() || pathKey;
                  if (window.confirm(`Delete folder "${name}"?\n\nThis cannot be undone.`)) {
                    onDeleteEntry(pathKey);
                  }
                }}
                className="p-1.5 rounded text-text-secondary opacity-0 group-hover:opacity-100 hover:bg-error/20 hover:text-error transition-all shrink-0"
                title={`Delete folder "${pathKey}"`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
        {isOpen && (loading && !listing ? (
          <div className="flex items-center gap-2 py-1 rounded" style={{ paddingLeft: (depth + 1) * 12 + 8 }}>
            <Loader2 size={14} className="animate-spin shrink-0 text-text-secondary" />
            <span className="text-text-secondary text-sm">Loading…</span>
          </div>
        ) : sortedEntries.map((parsed) => {
          const name = parsed.name;
          const isDir = parsed.isDir;
          const fullPath = buildPath(pathKey, name);
          if (isDir) {
            return <TreeFolder key={`${pathKey}-${name}`} pathKey={fullPath} depth={pathKey === '.' ? depth + 1 : depth + 1} />;
          }
          return (
            <div
              key={`${pathKey}-${name}`}
              data-tree-row
              className="group flex items-center gap-0 rounded min-w-0 w-full"
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFileTreeMenu({ kind: 'entry', x: e.clientX, y: e.clientY, path: fullPath, isDir: false });
              }}
            >
              <button
                type="button"
                onClick={() => onOpenFile?.(fullPath)}
                className="flex-1 min-w-0 text-left rounded hover:bg-bg-tertiary text-text-primary truncate flex items-center gap-2"
                style={{ paddingLeft: (pathKey === '.' ? depth + 1 : depth + 1) * 12 + 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                title={fullPath}
              >
                <span className="w-[14px] shrink-0" />
                <FileCode size={14} className="shrink-0 text-text-secondary" />
                <span className="truncate">{name}</span>
              </button>
              {onDeleteEntry && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete file "${name}"?\n\nThis cannot be undone.`)) {
                      onDeleteEntry(fullPath);
                    }
                  }}
                  className="p-1.5 rounded text-text-secondary opacity-0 group-hover:opacity-100 hover:bg-error/20 hover:text-error transition-all shrink-0"
                  title={`Delete file "${name}"`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        }) )}
      </>
    );
  }

  return (
    <div className="w-full h-full bg-bg-secondary/30 border-r border-border/20 flex flex-col min-w-0">
      {activeView === 'guide' ? (
        <div className="flex-1 flex flex-col min-h-0 select-none">
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Feature Guide</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 space-y-1.5 pb-4">
            {[
              { id: 'database', title: 'Database Manager', desc: 'Secure SSH tunneled SQL runner' },
              { id: 'pipeline', title: 'Deployment Pipeline', desc: 'One-click Git pulls & builds' },
              { id: 'history', title: 'History & Rollbacks', desc: 'SQLite audit logging & rollbacks' },
              { id: 'updates', title: 'Auto-Update System', desc: 'GitHub release checking & alerts' },
            ].map((item) => {
              const isSelected = selectedGuideId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectGuideId?.(item.id)}
                  className={`w-full flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all border duration-200 ${
                    isSelected
                      ? 'bg-bg-tertiary border-border/50 text-accent shadow-sm'
                      : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
                  }`}
                >
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                    {item.title}
                  </span>
                  <span className="text-[10px] text-text-secondary truncate w-full leading-normal">
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : activeView === 'notes' ? (
        <NotesSidebar currentServer={currentServer} onOpenFile={onOpenFile} />
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {activeView === 'servers' && 'Servers'}
              {activeView === 'files' && 'Files'}
              {activeView === 'docker' && 'Docker'}
              {activeView === 'deploy' && 'Deploy'}
              {activeView === 'database' && 'Database'}
            </span>
          </div>
          {showFileBrowser && (
            <div className="flex items-center gap-2 px-3 py-1 flex-wrap mb-1">
              <Tooltip content="Reload file tree" position="bottom">
                <button
                  type="button"
                  onClick={() => onLoadDir('.', true)}
                  disabled={rootLoading}
                  className="flex items-center justify-center p-1 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={12} />
                </button>
              </Tooltip>
              <span className="text-[10px] text-text-muted font-mono truncate flex-1 min-w-0" title={pathDisplay}>{pathDisplay}</span>
            </div>
          )}
          {canCreate && (
            <div className="flex items-center gap-0.5 px-3 py-1 mb-2">
              {onCreateFile && (
                <Tooltip content="New File" position="top">
                  <button
                    type="button"
                    onClick={() => setCreatingType('file')}
                    disabled={creating}
                    className="p-1.5 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent disabled:opacity-50 transition-colors"
                  >
                    <FilePlus size={14} />
                  </button>
                </Tooltip>
              )}
              {onCreateFolder && (
                <Tooltip content="New Folder" position="top">
                  <button
                    type="button"
                    onClick={() => setCreatingType('folder')}
                    disabled={creating}
                    className="p-1.5 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent disabled:opacity-50 transition-colors"
                  >
                    <FolderPlus size={14} />
                  </button>
                </Tooltip>
              )}
              {onCollapseAll && (
                <Tooltip content="Collapse all" position="top">
                  <button
                    type="button"
                    onClick={onCollapseAll}
                    className="p-1.5 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent transition-colors"
                  >
                    <ChevronsUp size={14} />
                  </button>
                </Tooltip>
              )}
              {onUploadLocalFile && (
                <Tooltip content="Upload local file" position="top">
                  <button
                    type="button"
                    onClick={() => void onUploadLocalFile()}
                    disabled={creating || uploadBusy}
                    className="p-1.5 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent disabled:opacity-50 transition-colors"
                  >
                    {uploadBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  </button>
                </Tooltip>
              )}
              <Tooltip content={showDotfiles ? "Hide Hidden Files" : "Show Hidden Files"} position="top">
                <button
                  type="button"
                  onClick={() => setShowDotfiles(prev => !prev)}
                  className={`p-1.5 rounded-md transition-colors ${showDotfiles ? 'text-accent bg-bg-tertiary/60' : 'text-text-secondary hover:bg-bg-tertiary hover:text-accent'}`}
                >
                  {showDotfiles ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </Tooltip>
            </div>
          )}
          {connectionError && (
            <div className="mx-3 mt-1 mb-3 px-3 py-2 rounded-lg bg-error/8 border border-error/20 text-error text-[11px] leading-relaxed">
              <p className="font-semibold">Connection Alert</p>
              <p className="truncate mt-0.5" title={connectionError}>{connectionError}</p>
              <button type="button" onClick={onDismissError} className="mt-1.5 font-bold underline text-error hover:text-error/80 cursor-pointer">Dismiss</button>
            </div>
          )}
          <div id="database-sidebar-panel" className="flex-1 flex flex-col overflow-y-auto py-1 min-h-0">
            {(activeView === 'servers' || activeView === 'docker' || activeView === 'deploy') && (
              <ul className="space-y-1 px-3 pb-4">
                {servers.length === 0 && (
                  <li className="px-3 py-4 text-xs text-text-muted text-center italic">
                    No servers. Click + to add.
                  </li>
                )}
                {servers.map((s) => {
                  const status = serverStatuses[s.id] || 'gray';
                  let badgeColor = 'bg-text-muted';
                  if (status === 'green') badgeColor = 'bg-success shadow-[0_0_6px_rgba(78,201,176,0.6)]';
                  else if (status === 'yellow') badgeColor = 'bg-warning shadow-[0_0_6px_rgba(220,220,170,0.6)]';
                  else if (status === 'red') badgeColor = 'bg-error shadow-[0_0_6px_rgba(241,76,76,0.6)]';

                  const isSelected = currentServer?.id === s.id;

                  return (
                    <li key={s.id} className="group flex items-center gap-1.5 rounded-xl">
                      <button
                         type="button"
                         onClick={() => onSelectServer(isSelected ? null : s)}
                         disabled={connectingTo !== null}
                         className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs w-full transition-all duration-200 disabled:opacity-60 ${
                           isSelected
                             ? 'bg-bg-tertiary/75 text-accent font-semibold shadow-inner'
                             : 'text-text-primary hover:bg-bg-tertiary/30 hover:text-text-primary'
                         }`}
                      >
                        <div className="relative shrink-0 flex items-center justify-center w-5 h-5 bg-bg-primary/40 rounded-lg border border-border/30">
                          <ServerIcon size={12} className={isSelected ? 'text-accent' : 'text-text-secondary'} />
                          <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-bg-secondary ${badgeColor}`} />
                        </div>
                        <span className="truncate">{connectingTo === s.id ? 'Connecting…' : s.name}</span>
                        <ChevronRight
                          size={12}
                          className={`ml-auto shrink-0 transition-transform text-text-muted/60 ${
                            isSelected ? 'rotate-90 text-accent/80' : ''
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveServer(s.id)}
                        className="p-2 rounded-xl text-text-muted hover:bg-error/15 hover:text-error opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0"
                        title="Remove server"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {showFileBrowser && (
              <div
                className="px-3 font-mono text-xs min-h-[120px] pb-4"
                onContextMenu={(e) => {
                  if ((e.target as HTMLElement).closest('[data-tree-row]')) return;
                  if ((e.target as HTMLElement).closest('button')) return;
                  if ((e.target as HTMLElement).closest('input')) return;
                  if (!canPasteFiles) return;
                  e.preventDefault();
                  setFileTreeMenu({
                    kind: 'background',
                    x: e.clientX,
                    y: e.clientY,
                    targetDir: currentPath || '.',
                  });
                }}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  if ((e.target as HTMLElement).closest('input')) return;
                  if (onCreateFile && !creatingType) setCreatingType('file');
                }}
              >
                {creatingType && (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-bg-tertiary border border-border/40 mb-1.5">
                    {creatingType === 'folder' ? <Folder size={12} className="shrink-0 text-accent" /> : <FileCode size={12} className="shrink-0 text-text-secondary" />}
                    <input
                      ref={createInputRef}
                      type="text"
                      value={creatingName}
                      onChange={(e) => setCreatingName(e.target.value)}
                      onKeyDown={handleCreateKeyDown}
                      placeholder={creatingType === 'folder' ? 'Folder name' : 'File name'}
                      className="flex-1 min-w-0 bg-bg-primary/50 border border-border/40 rounded px-2 py-0.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                      aria-label={creatingType === 'folder' ? 'Folder name' : 'File name'}
                    />
                  </div>
                )}
            {createError && (
              <p className="text-error text-xs px-2 py-1 mb-1">{createError}</p>
            )}
            {filesError ? (
              <p className="text-error p-2 text-xs">{filesError}</p>
            ) : (
              <>
                {!(treeListings['.']?.trim()) && !rootLoading && !creatingType && (
                  <div className="py-4 px-2 text-text-muted text-xs text-center">
                    Empty folder. Use New File / New Folder above, or refresh.
                  </div>
                )}
                <TreeFolder pathKey="." depth={0} />
              </>
            )}
          </div>
        )}
        {activeView === 'files' && !currentServer && (
          <div className="px-3 py-4 text-sm text-text-secondary">
            Select a server to browse files.
          </div>
        )}
        {activeView === 'docker' && (
          <div className="px-3 pt-2 space-y-3">
            <div className="rounded-lg border border-border bg-bg-primary p-3 text-sm">
              <div className="flex items-center gap-2 mb-2 text-text-primary font-medium">
                <Box size={16} className="shrink-0 text-accent" />
                What you can do
              </div>
              <ul className="space-y-1 text-xs text-text-secondary">
                <li>• View all containers</li>
                <li>• Manage compose services</li>
                <li>• Open shell in containers</li>
                <li>• Connect to Redis / MySQL / Postgres</li>
                <li>• Stream logs, restart all</li>
              </ul>
              {!currentServer ? (
                <p className="mt-3 text-text-muted text-xs">Select a server above to get started.</p>
              ) : (
                <p className="mt-3 text-accent text-xs">Viewing: {currentServer.name}</p>
              )}
            </div>
          </div>
        )}
        {activeView === 'deploy' && (
          <div className="px-3 pt-2 space-y-3">
            <div className="rounded-lg border border-border bg-bg-primary p-3 text-sm">
              {!currentServer ? (
                <div className="flex flex-col gap-3">
                  <p className="text-text-secondary">Select a server above to run deploy commands.</p>
                  <div className="border-t border-border pt-2.5 mt-1 flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Relevant Guides</span>
                    <button
                      type="button"
                      onClick={() => onSelectGuideId?.('pipeline')}
                      className="text-xs text-accent hover:underline text-left cursor-pointer"
                    >
                      Deployment Pipeline Guide ↗
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectGuideId?.('history')}
                      className="text-xs text-accent hover:underline text-left cursor-pointer"
                    >
                      History & Rollbacks Guide ↗
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-accent text-xs">Viewing: {currentServer.name}</p>
              )}
            </div>
          </div>
        )}
        {activeView === 'database' && !currentServer && (
          <div className="px-3 pt-2">
            <div className="rounded-lg border border-border bg-bg-primary p-3 text-sm">
              <div className="flex flex-col gap-3">
                <p className="text-text-secondary">Select a server above to manage databases.</p>
                <div className="border-t border-border pt-2.5 mt-1 flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Relevant Guide</span>
                  <button
                    type="button"
                    onClick={() => onSelectGuideId?.('database')}
                    className="text-xs text-accent hover:underline text-left cursor-pointer"
                  >
                    Database Manager Guide ↗
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
      {fileTreeMenu && showFileBrowser && (
        <div
          className="fixed z-50 min-w-[190px] rounded-xl border border-border/40 bg-bg-tertiary/95 py-1.5 px-1 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-100 font-sans"
          style={{ left: fileTreeMenu.x, top: fileTreeMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {fileTreeMenu.kind === 'background' && canPasteFiles && fileTreeMenu.targetDir != null && (
            <button
              type="button"
              disabled={!!contextMenuAction}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
              onClick={async () => {
                setContextMenuAction('paste');
                onFileTreeActionMessage?.(null);
                try {
                  const res = await onFileTreePasteInto!(fileTreeMenu.targetDir!);
                  if (!res.ok && res.error && res.error !== 'Cancelled') {
                    onFileTreeActionMessage?.(res.error);
                  }
                } finally {
                  setContextMenuAction(null);
                  setFileTreeMenu(null);
                }
              }}
            >
              <ClipboardPaste size={13} className="shrink-0 animate-pulse" />
              {contextMenuAction === 'paste' ? 'Pasting…' : 'Paste here'}
            </button>
          )}
          {fileTreeMenu.kind === 'entry' && fileTreeMenu.path != null && (
            <>
              {!fileTreeMenu.isDir && onOpenFile && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer"
                  onClick={() => {
                    onOpenFile(fileTreeMenu.path!);
                    setFileTreeMenu(null);
                  }}
                >
                  <FileCode size={13} className="shrink-0" />
                  Open
                </button>
              )}
              {onFileTreeRenamePath && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                  onClick={async () => {
                    setContextMenuAction('rename');
                    onFileTreeActionMessage?.(null);
                    try {
                      const res = await onFileTreeRenamePath(fileTreeMenu.path!);
                      if (!res.ok && res.error) onFileTreeActionMessage?.(res.error);
                    } finally {
                      setContextMenuAction(null);
                      setFileTreeMenu(null);
                    }
                  }}
                >
                  <Pencil size={13} className="shrink-0" />
                  {contextMenuAction === 'rename' ? 'Renaming…' : 'Rename'}
                </button>
              )}
              {onFileTreeCutPaths && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer"
                  onClick={() => {
                    onFileTreeCutPaths([fileTreeMenu.path!]);
                    setFileTreeMenu(null);
                  }}
                >
                  <Scissors size={13} className="shrink-0" />
                  Cut
                </button>
              )}
              {onFileTreeCopyPaths && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer"
                  onClick={() => {
                    onFileTreeCopyPaths([fileTreeMenu.path!]);
                    setFileTreeMenu(null);
                  }}
                >
                  <Copy size={13} className="shrink-0" />
                  Copy
                </button>
              )}
              {canPasteFiles && onFileTreePasteInto && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                  onClick={async () => {
                    const p = fileTreeMenu.path!;
                    const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.';
                    const targetDir = fileTreeMenu.isDir ? p : parent;
                    setContextMenuAction('paste');
                    onFileTreeActionMessage?.(null);
                    try {
                      const res = await onFileTreePasteInto(targetDir);
                      if (!res.ok && res.error && res.error !== 'Cancelled') {
                        onFileTreeActionMessage?.(res.error);
                      }
                    } finally {
                      setContextMenuAction(null);
                      setFileTreeMenu(null);
                    }
                  }}
                >
                  <ClipboardPaste size={13} className="shrink-0" />
                  {contextMenuAction === 'paste' ? 'Pasting…' : 'Paste into'}
                </button>
              )}
              {onFileTreeDuplicatePath && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                  onClick={async () => {
                    setContextMenuAction('dup');
                    onFileTreeActionMessage?.(null);
                    try {
                      const res = await onFileTreeDuplicatePath(fileTreeMenu.path!, Boolean(fileTreeMenu.isDir));
                      if (!res.ok && res.error) onFileTreeActionMessage?.(res.error);
                    } finally {
                      setContextMenuAction(null);
                      setFileTreeMenu(null);
                    }
                  }}
                >
                  <CopyPlus size={13} className="shrink-0" />
                  {contextMenuAction === 'dup' ? 'Duplicating…' : 'Duplicate'}
                </button>
              )}
              {onDeleteEntry && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-error hover:bg-error/10 hover:text-error rounded-lg disabled:opacity-50 transition-colors cursor-pointer font-semibold"
                  onClick={async () => {
                    const p = fileTreeMenu.path!;
                    const label = p.split('/').pop() || p;
                    if (!window.confirm(`Delete "${label}"?\n\nThis cannot be undone.`)) {
                      setFileTreeMenu(null);
                      return;
                    }
                    setContextMenuAction('del');
                    onFileTreeActionMessage?.(null);
                    try {
                      const res = await onDeleteEntry(p);
                      if (!res.ok && res.error) onFileTreeActionMessage?.(res.error);
                    } finally {
                      setContextMenuAction(null);
                      setFileTreeMenu(null);
                    }
                  }}
                >
                  <Trash2 size={13} className="shrink-0" />
                  {contextMenuAction === 'del' ? 'Deleting…' : 'Delete'}
                </button>
              )}
              {(() => {
                const path = fileTreeMenu.path!;
                const name = path.split('/').pop() || path;
                const isCompose =
                  !fileTreeMenu.isDir &&
                  (name.toLowerCase() === 'docker-compose.yml' || name.toLowerCase() === 'docker-compose.yaml');
                const hasExtras =
                  (isCompose && onAddToLogs) ||
                  (fileTreeMenu.isDir && (onMakeGitRepo || onAddAsProject));
                if (!hasExtras) return null;
                return <div className="h-[1px] bg-border/40 my-1 mx-1" />;
              })()}
              {!fileTreeMenu.isDir && onAddToLogs && (() => {
                const path = fileTreeMenu.path!;
                const name = path.split('/').pop() || path;
                const lower = name.toLowerCase();
                if (lower !== 'docker-compose.yml' && lower !== 'docker-compose.yaml') return null;
                return (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer"
                    onClick={() => {
                      onAddToLogs(path);
                      setFileTreeMenu(null);
                    }}
                  >
                    <FileText size={13} className="shrink-0" />
                    Add to Logs
                  </button>
                );
              })()}
              {fileTreeMenu.isDir && onMakeGitRepo && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                  onClick={async () => {
                    setContextMenuAction('git');
                    try {
                      await onMakeGitRepo(fileTreeMenu.path!);
                    } finally {
                      setContextMenuAction(null);
                      setFileTreeMenu(null);
                    }
                  }}
                >
                  <GitBranch size={13} className="shrink-0" />
                  {contextMenuAction === 'git' ? 'Initializing…' : 'Make git repo'}
                </button>
              )}
              {fileTreeMenu.isDir && onAddAsProject && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                  onClick={async () => {
                    setContextMenuAction('project');
                    try {
                      await onAddAsProject(fileTreeMenu.path!);
                    } finally {
                      setContextMenuAction(null);
                      setFileTreeMenu(null);
                    }
                  }}
                >
                  <FolderGit2 size={13} className="shrink-0" />
                  {contextMenuAction === 'project' ? 'Adding…' : 'Add as project'}
                </button>
              )}
            </>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
