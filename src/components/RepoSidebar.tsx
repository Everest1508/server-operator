import { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  Folder,
  FileCode,
  Loader2,
  FilePlus,
  FolderPlus,
  ChevronsUp,
  Trash2,
  X,
  Pencil,
  Scissors,
  Copy,
  ClipboardPaste,
  CopyPlus,
} from 'lucide-react';
import type { ServerConnection, FileTreeClipboard } from '../types';
import { parseLsLine } from '../utils/parseLs';
import { Tooltip } from './Tooltip';

interface RepoFileTreeMenuState {
  kind: 'entry' | 'background';
  x: number;
  y: number;
  path?: string;
  isDir?: boolean;
  targetDir?: string;
}

function buildPath(prefix: string, name: string): string {
  const p = (prefix || '.').trim() || '.';
  return p === '.' ? name : `${p}/${name}`;
}

interface RepoSidebarProps {
  repos: string[];
  selectedRepoPath: string | null;
  currentServer?: ServerConnection | null;
  onSelectRepo: (path: string | null) => void;
  repoTreeListings: Record<string, string>;
  repoOpenFolders: Record<string, Set<string>>;
  repoLoadingPaths: Set<string>;
  repoCurrentPath?: string;
  /** Full server-relative path used as paste target for empty project tree area */
  repoBrowseDirForPaste?: string;
  onToggleRepoFolder: (repoPath: string, pathKey: string) => void;
  loadRepoDir: (repoPath: string, relativePath: string, forceRefresh?: boolean) => void;
  onOpenFile?: (filePath: string) => void;
  onCreateFile?: (repoPath: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  onCreateFolder?: (repoPath: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteEntry?: (fullPath: string) => Promise<{ ok: boolean; error?: string }>;
  onCollapseRepo?: (repoPath: string) => void;
  onRemoveRepo?: (path: string) => void;
  basePath?: string;
  fileTreeClipboard?: FileTreeClipboard | null;
  onFileTreeCopyPaths?: (paths: string[]) => void;
  onFileTreeCutPaths?: (paths: string[]) => void;
  onFileTreePasteInto?: (targetDir: string) => Promise<{ ok: boolean; error?: string }>;
  onFileTreeRenamePath?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  onFileTreeDuplicatePath?: (path: string, isDir: boolean) => Promise<{ ok: boolean; error?: string }>;
  onFileTreeActionMessage?: (message: string | null) => void;
}

export function RepoSidebar({
  repos,
  selectedRepoPath,
  currentServer = null,
  onSelectRepo,
  repoTreeListings,
  repoOpenFolders,
  repoLoadingPaths,
  repoCurrentPath: _repoCurrentPath = '.',
  repoBrowseDirForPaste = '.',
  onToggleRepoFolder,
  loadRepoDir: _loadRepoDir,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onDeleteEntry,
  onCollapseRepo,
  onRemoveRepo,
  basePath: _basePath = '.',
  fileTreeClipboard = null,
  onFileTreeCopyPaths,
  onFileTreeCutPaths,
  onFileTreePasteInto,
  onFileTreeRenamePath,
  onFileTreeDuplicatePath,
  onFileTreeActionMessage,
}: RepoSidebarProps) {
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fileTreeMenu, setFileTreeMenu] = useState<RepoFileTreeMenuState | null>(null);
  const [contextMenuAction, setContextMenuAction] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const canPasteFiles =
    Boolean(
      fileTreeClipboard &&
      currentServer &&
      fileTreeClipboard.paths.length > 0 &&
      fileTreeClipboard.serverId === currentServer.id
    ) && Boolean(onFileTreePasteInto);

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
    if (!name || !selectedRepoPath) {
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
        const res = await onCreateFile(selectedRepoPath, name);
        if (!res.ok) setCreateError(res.error || 'Failed to create file');
      } else if (type === 'folder' && onCreateFolder) {
        const res = await onCreateFolder(selectedRepoPath, name);
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

  const repoListingKey = (repoPath: string, relativePath: string) => `${repoPath}:${relativePath}`;
  const canCreate = selectedRepoPath && (onCreateFile || onCreateFolder);

  function RepoTreeFolder({ repoPath, pathKey, depth }: { repoPath: string; pathKey: string; depth: number }) {
    const listKey = repoListingKey(repoPath, pathKey);
    const listing = repoTreeListings[listKey];
    const loading = repoLoadingPaths.has(listKey);
    const openSet = repoOpenFolders[repoPath] ?? new Set(['.']);
    const isOpen = openSet.has(pathKey);
    if (pathKey === '.' && loading && !listing) {
      return (
        <div className="flex items-center gap-2 py-1 rounded" style={{ paddingLeft: 8 }}>
          <Loader2 size={14} className="animate-spin shrink-0 text-[var(--text-secondary)]" />
          <span className="text-[var(--text-secondary)] text-sm">Loading…</span>
        </div>
      );
    }
    const lines = (listing || '').trim().split('\n').filter(Boolean);
    const sortedEntries = lines
      .map((line) => parseLsLine(line))
      .filter((p): p is NonNullable<typeof p> => p != null);
    sortedEntries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return (
      <>
        {pathKey !== '.' && (
          <div
            data-repo-tree-row
            className="group flex items-center gap-0 rounded min-w-0 w-full"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const fullFolderPath = repoPath === '.' ? pathKey : `${repoPath}/${pathKey}`;
              setFileTreeMenu({ kind: 'entry', x: e.clientX, y: e.clientY, path: fullFolderPath, isDir: true });
            }}
          >
            <button
              type="button"
              onClick={() => onToggleRepoFolder(repoPath, pathKey)}
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
                  const fullPath = repoPath === '.' ? pathKey : `${repoPath}/${pathKey}`;
                  const name = pathKey.split('/').pop() || pathKey;
                  if (window.confirm(`Delete folder "${name}"?\n\nThis cannot be undone.`)) {
                    onDeleteEntry(fullPath);
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
        {isOpen &&
          (loading && !listing ? (
            <div className="flex items-center gap-2 py-1 rounded" style={{ paddingLeft: (pathKey === '.' ? 0 : depth + 1) * 12 + 8 }}>
              <Loader2 size={14} className="animate-spin shrink-0 text-[var(--text-secondary)]" />
              <span className="text-[var(--text-secondary)] text-sm">Loading…</span>
            </div>
          ) : (
            sortedEntries.map((parsed) => {
              const name = parsed.name;
              const isDir = parsed.isDir;
              const fullPath = buildPath(pathKey, name);
              const fullFilePath = repoPath === '.' ? fullPath : `${repoPath}/${fullPath}`;
              if (isDir) {
                return (
                  <RepoTreeFolder
                    key={`${repoPath}-${fullPath}`}
                    repoPath={repoPath}
                    pathKey={fullPath}
                    depth={pathKey === '.' ? depth + 1 : depth + 1}
                  />
                );
              }
              return (
                <div
                  key={`${repoPath}-${fullPath}`}
                  data-repo-tree-row
                  className="group flex items-center gap-0 rounded min-w-0 w-full"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFileTreeMenu({ kind: 'entry', x: e.clientX, y: e.clientY, path: fullFilePath, isDir: false });
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenFile?.(fullFilePath)}
                    className="flex-1 min-w-0 text-left rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] truncate flex items-center gap-2"
                    style={{
                      paddingLeft: (pathKey === '.' ? depth + 1 : depth + 1) * 12 + 8,
                      paddingRight: 8,
                      paddingTop: 4,
                      paddingBottom: 4,
                    }}
                    title={fullFilePath}
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
                          onDeleteEntry(fullFilePath);
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
            })
          ))}
      </>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="w-full h-full bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col min-w-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Projects</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 text-[var(--text-muted)] text-xs text-center">
          Right-click a folder in the file tree and choose &quot;Add as project&quot; to add repos here.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col min-w-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Projects</span>
      </div>
      <div className="shrink-0 flex border-b border-[var(--border)] overflow-x-auto">
        {repos.map((path) => {
          const label = path.split('/').pop() || path;
          const isSelected = selectedRepoPath === path;
          return (
            <div
              key={path}
              className={`shrink-0 flex items-center border-b-2 max-w-[160px] group ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--bg-tertiary)]'
                  : 'border-transparent hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectRepo(isSelected ? null : path)}
                className={`flex-1 min-w-0 px-2 py-2 text-xs font-medium transition-colors truncate text-left ${
                  isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={path}
              >
                {label}
              </button>
              {onRemoveRepo && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveRepo(path); }}
                  className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--error)] opacity-70 group-hover:opacity-100"
                  title="Remove project"
                  aria-label="Remove project"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {canCreate && (
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)]">
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
          {onCollapseRepo && selectedRepoPath && (
            <Tooltip content="Collapse all" position="top">
              <button
                type="button"
                onClick={() => onCollapseRepo(selectedRepoPath)}
                className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)]"
              >
                <ChevronsUp size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-2 px-2 font-mono text-sm min-h-0">
        {selectedRepoPath ? (
          <div
            className="min-h-[120px]"
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest('[data-repo-tree-row]')) return;
              if ((e.target as HTMLElement).closest('button')) return;
              if ((e.target as HTMLElement).closest('input')) return;
              if (!canPasteFiles) return;
              e.preventDefault();
              setFileTreeMenu({
                kind: 'background',
                x: e.clientX,
                y: e.clientY,
                targetDir: repoBrowseDirForPaste || selectedRepoPath,
              });
            }}
          >
            {creatingType && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--bg-tertiary)] mb-1">
                {creatingType === 'folder' ? (
                  <Folder size={14} className="shrink-0 text-[var(--accent)]" />
                ) : (
                  <FileCode size={14} className="shrink-0 text-[var(--text-secondary)]" />
                )}
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
            <RepoTreeFolder repoPath={selectedRepoPath} pathKey="." depth={0} />
          </div>
        ) : (
          <div className="py-4 px-2 text-[var(--text-muted)] text-xs text-center">Select a project tab above.</div>
        )}
      </div>
      {fileTreeMenu && selectedRepoPath && (
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
