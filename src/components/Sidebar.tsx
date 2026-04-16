import { useState, useRef, useEffect } from 'react';
import { Trash2, Server as ServerIcon, ChevronRight, Folder, FileCode, Loader2, RefreshCw, FilePlus, FolderPlus, ChevronsUp, GitBranch, FolderGit2, FileText, Box } from 'lucide-react';
import type { ServerConnection, ViewId } from '../types';
import { parseLsLine } from '../utils/parseLs';

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
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
}: SidebarProps) {
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuAction, setContextMenuAction] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

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
            className="group flex items-center gap-0 rounded min-w-0 w-full"
            onContextMenu={(e) => {
              e.preventDefault();
              if (onMakeGitRepo || onAddAsProject) {
                setContextMenu({ x: e.clientX, y: e.clientY, path: pathKey, isDir: true });
              }
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
          const isComposeFile = (n: string) => {
            const lower = n.toLowerCase();
            return lower === 'docker-compose.yml' || lower === 'docker-compose.yaml';
          };
          return (
            <div
              key={`${pathKey}-${name}`}
              className="group flex items-center gap-0 rounded min-w-0 w-full"
              onContextMenu={(e) => {
                e.preventDefault();
                if (onAddToLogs && isComposeFile(name)) {
                  setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, isDir: false });
                }
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {activeView === 'servers' && 'Servers'}
          {activeView === 'files' && 'Files'}
          {activeView === 'docker' && 'Docker'}
          {activeView === 'deploy' && 'Deploy'}
        </span>
      </div>
      {showFileBrowser && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] flex-wrap">
          <button
            type="button"
            onClick={() => onLoadDir('.', true)}
            disabled={rootLoading}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
            title="Reload file tree from server"
          >
            <RefreshCw size={14} />
          </button>
          <span className="text-[10px] text-[var(--text-muted)] truncate flex-1 min-w-0" title={pathDisplay}>{pathDisplay}</span>
        </div>
      )}
      {canCreate && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)]">
          {onCreateFile && (
            <button
              type="button"
              onClick={() => setCreatingType('file')}
              disabled={creating}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
              title="New File"
            >
              <FilePlus size={16} />
            </button>
          )}
          {onCreateFolder && (
            <button
              type="button"
              onClick={() => setCreatingType('folder')}
              disabled={creating}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
              title="New Folder"
            >
              <FolderPlus size={16} />
            </button>
          )}
          {onCollapseAll && (
            <button
              type="button"
              onClick={onCollapseAll}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)]"
              title="Collapse all"
            >
              <ChevronsUp size={16} />
            </button>
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
        {(activeView === 'servers' || activeView === 'docker' || activeView === 'deploy') && (
          <ul className="space-y-0.5 px-2">
            {servers.length === 0 && (
              <li className="px-3 py-4 text-sm text-[var(--text-secondary)] text-center">
                No servers. Click + to add.
              </li>
            )}
            {servers.map((s) => (
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
                  <ServerIcon size={16} className="shrink-0 text-[var(--success)]" />
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
            ))}
          </ul>
        )}
        {showFileBrowser && (
          <div
            className="px-2 font-mono text-sm min-h-[120px]"
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
      </div>
      {contextMenu && contextMenu.isDir && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {onMakeGitRepo && (
            <button
              type="button"
              disabled={!!contextMenuAction}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
              onClick={async () => {
                setContextMenuAction('git');
                try {
                  await onMakeGitRepo(contextMenu.path);
                } finally {
                  setContextMenuAction(null);
                  setContextMenu(null);
                }
              }}
            >
              <GitBranch size={14} className="shrink-0" />
              {contextMenuAction === 'git' ? 'Initializing…' : 'Make git repo'}
            </button>
          )}
          {onAddAsProject && (
            <button
              type="button"
              disabled={!!contextMenuAction}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
              onClick={async () => {
                setContextMenuAction('project');
                try {
                  await onAddAsProject(contextMenu.path);
                } finally {
                  setContextMenuAction(null);
                  setContextMenu(null);
                }
              }}
            >
              <FolderGit2 size={14} className="shrink-0" />
              {contextMenuAction === 'project' ? 'Adding…' : 'Add as project'}
            </button>
          )}
        </div>
      )}
      {contextMenu && !contextMenu.isDir && onAddToLogs && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
            onClick={() => {
              onAddToLogs(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <FileText size={14} className="shrink-0" />
            Add to Logs
          </button>
        </div>
      )}
    </div>
  );
}
