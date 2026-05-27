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
} from 'lucide-react';
import type { ServerConnection, ViewId, FileTreeClipboard } from '../types';
import { parseLsLine } from '../utils/parseLs';
import { Tooltip } from './Tooltip';
import { NotesSidebar } from './NotesSidebar';
import { SnippetsSidebar } from './SnippetsSidebar';

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
}: SidebarProps) {
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fileTreeMenu, setFileTreeMenu] = useState<FileTreeMenuState | null>(null);
  const [contextMenuAction, setContextMenuAction] = useState<string | null>(null);
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
      .filter((p): p is NonNullable<typeof p> => p != null);
    sortedEntries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    if (pathKey === '.' && loading && !listing) {
      return (
        <div className="flex items-center gap-2 py-1 rounded" style={{ paddingLeft: 8 }}>
          <Loader2 size={14} className="animate-spin shrink-0 text-[var(--text-secondary)]" />
          <span className="text-[var(--text-secondary)] text-sm">Loading…</span>
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
              className="flex-1 min-w-0 text-left rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] truncate flex items-center gap-2"
              style={{ paddingLeft: depth * 12 + 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
              title={pathKey}
            >
              <ChevronRight size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              <Folder size={14} className="shrink-0 text-[var(--accent)]" />
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
                className="p-1.5 rounded text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--error)]/20 hover:text-[var(--error)] transition-all shrink-0"
                title={`Delete folder "${pathKey}"`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
        {isOpen && (loading && !listing ? (
          <div className="flex items-center gap-2 py-1 rounded" style={{ paddingLeft: (depth + 1) * 12 + 8 }}>
            <Loader2 size={14} className="animate-spin shrink-0 text-[var(--text-secondary)]" />
            <span className="text-[var(--text-secondary)] text-sm">Loading…</span>
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
                className="flex-1 min-w-0 text-left rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] truncate flex items-center gap-2"
                style={{ paddingLeft: (pathKey === '.' ? depth + 1 : depth + 1) * 12 + 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                title={fullPath}
              >
                <span className="w-[14px] shrink-0" />
                <FileCode size={14} className="shrink-0 text-[var(--text-secondary)]" />
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
                  className="p-1.5 rounded text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--error)]/20 hover:text-[var(--error)] transition-all shrink-0"
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
    <div className="w-full h-full bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col min-w-0">
      {activeView === 'notes' ? (
        <NotesSidebar currentServer={currentServer} onOpenFile={onOpenFile} />
      ) : activeView === 'snippets' ? (
        <SnippetsSidebar />
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {activeView === 'servers' && 'Servers'}
          {activeView === 'files' && 'Files'}
          {activeView === 'docker' && 'Docker'}
          {activeView === 'deploy' && 'Deploy'}
          {activeView === 'monitoring' && 'Monitoring'}
        </span>
      </div>
      {showFileBrowser && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] flex-wrap">
          <Tooltip content="Reload file tree from server" position="bottom">
            <button
              type="button"
              onClick={() => onLoadDir('.', true)}
              disabled={rootLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              <RefreshCw size={14} />
            </button>
          </Tooltip>
          <span className="text-[10px] text-[var(--text-muted)] truncate flex-1 min-w-0" title={pathDisplay}>{pathDisplay}</span>
        </div>
      )}
      {canCreate && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)]">
          {onCreateFile && (
            <Tooltip content="New File" position="top">
              <button
                type="button"
                onClick={() => setCreatingType('file')}
                disabled={creating}
                className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                <FilePlus size={16} />
              </button>
            </Tooltip>
          )}
          {onCreateFolder && (
            <Tooltip content="New Folder" position="top">
              <button
                type="button"
                onClick={() => setCreatingType('folder')}
                disabled={creating}
                className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                <FolderPlus size={16} />
              </button>
            </Tooltip>
          )}
          {onCollapseAll && (
            <Tooltip content="Collapse all" position="top">
              <button
                type="button"
                onClick={onCollapseAll}
                className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)]"
              >
                <ChevronsUp size={16} />
              </button>
            </Tooltip>
          )}
          {onUploadLocalFile && (
            <Tooltip content="Upload local file to this folder" position="top">
              <button
                type="button"
                onClick={() => void onUploadLocalFile()}
                disabled={creating || uploadBusy}
                className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                {uploadBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              </button>
            </Tooltip>
          )}
        </div>
      )}
      {connectionError && (
        <div className="mx-2 mt-2 px-2 py-2 rounded bg-[var(--error)]/10 border border-[var(--error)]/40 text-[var(--error)] text-xs">
          <p className="truncate" title={connectionError}>{connectionError}</p>
          <button type="button" onClick={onDismissError} className="mt-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Dismiss</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {(activeView === 'servers' || activeView === 'docker' || activeView === 'deploy' || activeView === 'monitoring') && (
          <ul className="space-y-0.5 px-2">
            {servers.length === 0 && (
              <li className="px-3 py-4 text-sm text-[var(--text-secondary)] text-center">
                No servers. Click + to add.
              </li>
            )}
            {servers.map((s) => {
              const status = serverStatuses[s.id] || 'gray';
              let badgeColor = 'bg-[var(--text-muted)]';
              if (status === 'green') badgeColor = 'bg-[var(--success)]';
              else if (status === 'yellow') badgeColor = 'bg-[var(--warning)]';
              else if (status === 'red') badgeColor = 'bg-[var(--error)]';

              return (
                <li key={s.id} className="group flex items-center gap-2 rounded-md">
                  <button
                    type="button"
                    onClick={() => onSelectServer(currentServer?.id === s.id ? null : s)}
                    disabled={connectingTo !== null}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm w-full transition-colors disabled:opacity-60 ${
                      currentServer?.id === s.id
                        ? 'bg-[var(--bg-tertiary)] text-[var(--accent)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <div className="relative shrink-0 flex items-center justify-center w-5 h-5">
                      <ServerIcon size={16} className="text-[var(--text-primary)]" />
                      <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-[var(--bg-primary)] ${badgeColor}`} />
                    </div>
                    <span className="truncate">{connectingTo === s.id ? 'Connecting…' : s.name}</span>
                    <ChevronRight
                      size={14}
                      className={`ml-auto shrink-0 transition-transform ${
                        currentServer?.id === s.id ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveServer(s.id)}
                    className="p-1.5 rounded text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--error)]/20 hover:text-[var(--error)] transition-all shrink-0"
                    title="Remove server"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {showFileBrowser && (
          <div
            className="px-2 font-mono text-sm min-h-[120px]"
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
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--bg-tertiary)] mb-1">
                {creatingType === 'folder' ? <Folder size={14} className="shrink-0 text-[var(--accent)]" /> : <FileCode size={14} className="shrink-0 text-[var(--text-secondary)]" />}
                <input
                  ref={createInputRef}
                  type="text"
                  value={creatingName}
                  onChange={(e) => setCreatingName(e.target.value)}
                  onKeyDown={handleCreateKeyDown}
                  placeholder={creatingType === 'folder' ? 'Folder name' : 'File name'}
                  className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  aria-label={creatingType === 'folder' ? 'Folder name' : 'File name'}
                />
              </div>
            )}
            {createError && (
              <p className="text-[var(--error)] text-xs px-2 py-1 mb-1">{createError}</p>
            )}
            {filesError ? (
              <p className="text-[var(--error)] p-2 text-xs">{filesError}</p>
            ) : (
              <>
                {!(treeListings['.']?.trim()) && !rootLoading && !creatingType && (
                  <div className="py-4 px-2 text-[var(--text-muted)] text-xs text-center">
                    Empty folder. Use New File / New Folder above, or refresh.
                  </div>
                )}
                <TreeFolder pathKey="." depth={0} />
              </>
            )}
          </div>
        )}
        {activeView === 'files' && !currentServer && (
          <div className="px-3 py-4 text-sm text-[var(--text-secondary)]">
            Select a server to browse files.
          </div>
        )}
        {activeView === 'docker' && (
          <div className="px-3 pt-2 space-y-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm">
              <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)] font-medium">
                <Box size={16} className="shrink-0 text-[var(--accent)]" />
                What you can do
              </div>
              <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                <li>• View all containers</li>
                <li>• Manage compose services</li>
                <li>• Open shell in containers</li>
                <li>• Connect to Redis / MySQL / Postgres</li>
                <li>• Stream logs, restart all</li>
              </ul>
              {!currentServer ? (
                <p className="mt-3 text-[var(--text-muted)] text-xs">Select a server above to get started.</p>
              ) : (
                <p className="mt-3 text-[var(--accent)] text-xs">Viewing: {currentServer.name}</p>
              )}
            </div>
          </div>
        )}
        {activeView === 'deploy' && (
          <div className="px-3 pt-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm">
              {!currentServer ? (
                <p className="text-[var(--text-secondary)]">Select a server above to run deploy commands.</p>
              ) : (
                <p className="text-[var(--accent)] text-xs">Viewing: {currentServer.name}</p>
              )}
            </div>
          </div>
        )}
        {activeView === 'monitoring' && (
          <div className="px-3 pt-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm">
              {!currentServer ? (
                <p className="text-[var(--text-secondary)]">Select a server above to view real-time charts.</p>
              ) : (
                <p className="text-[var(--accent)] text-xs">Monitoring: {currentServer.name}</p>
              )}
            </div>
          </div>
        )}
      </div>
      {fileTreeMenu && showFileBrowser && (
        <div
          className="fixed z-50 min-w-[200px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg"
          style={{ left: fileTreeMenu.x, top: fileTreeMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {fileTreeMenu.kind === 'background' && canPasteFiles && fileTreeMenu.targetDir != null && (
            <button
              type="button"
              disabled={!!contextMenuAction}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
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
              <ClipboardPaste size={14} className="shrink-0" />
              {contextMenuAction === 'paste' ? 'Pasting…' : 'Paste here'}
            </button>
          )}
          {fileTreeMenu.kind === 'entry' && fileTreeMenu.path != null && (
            <>
              {!fileTreeMenu.isDir && onOpenFile && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                  onClick={() => {
                    onOpenFile(fileTreeMenu.path!);
                    setFileTreeMenu(null);
                  }}
                >
                  <FileCode size={14} className="shrink-0" />
                  Open
                </button>
              )}
              {onFileTreeRenamePath && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
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
                  <Pencil size={14} className="shrink-0" />
                  {contextMenuAction === 'rename' ? 'Renaming…' : 'Rename'}
                </button>
              )}
              {onFileTreeCutPaths && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                  onClick={() => {
                    onFileTreeCutPaths([fileTreeMenu.path!]);
                    setFileTreeMenu(null);
                  }}
                >
                  <Scissors size={14} className="shrink-0" />
                  Cut
                </button>
              )}
              {onFileTreeCopyPaths && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                  onClick={() => {
                    onFileTreeCopyPaths([fileTreeMenu.path!]);
                    setFileTreeMenu(null);
                  }}
                >
                  <Copy size={14} className="shrink-0" />
                  Copy
                </button>
              )}
              {canPasteFiles && onFileTreePasteInto && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
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
                  <ClipboardPaste size={14} className="shrink-0" />
                  {contextMenuAction === 'paste' ? 'Pasting…' : 'Paste into'}
                </button>
              )}
              {onFileTreeDuplicatePath && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
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
                  <CopyPlus size={14} className="shrink-0" />
                  {contextMenuAction === 'dup' ? 'Duplicating…' : 'Duplicate'}
                </button>
              )}
              {onDeleteEntry && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--error)] hover:bg-[var(--error)]/15 disabled:opacity-50"
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
                  <Trash2 size={14} className="shrink-0" />
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
                return <hr className="my-1 border-[var(--border)]" />;
              })()}
              {!fileTreeMenu.isDir && onAddToLogs && (() => {
                const path = fileTreeMenu.path!;
                const name = path.split('/').pop() || path;
                const lower = name.toLowerCase();
                if (lower !== 'docker-compose.yml' && lower !== 'docker-compose.yaml') return null;
                return (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                    onClick={() => {
                      onAddToLogs(path);
                      setFileTreeMenu(null);
                    }}
                  >
                    <FileText size={14} className="shrink-0" />
                    Add to Logs
                  </button>
                );
              })()}
              {fileTreeMenu.isDir && onMakeGitRepo && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
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
                  <GitBranch size={14} className="shrink-0" />
                  {contextMenuAction === 'git' ? 'Initializing…' : 'Make git repo'}
                </button>
              )}
              {fileTreeMenu.isDir && onAddAsProject && (
                <button
                  type="button"
                  disabled={!!contextMenuAction}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
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
                  <FolderGit2 size={14} className="shrink-0" />
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
