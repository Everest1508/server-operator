import { useState, useRef, useEffect } from 'react';
import { ChevronRight, Folder, FileCode, Loader2, FilePlus, FolderPlus, ChevronsUp, Trash2, X } from 'lucide-react';
import { parseLsLine } from '../utils/parseLs';

function buildPath(prefix: string, name: string): string {
  const p = (prefix || '.').trim() || '.';
  return p === '.' ? name : `${p}/${name}`;
}

interface RepoSidebarProps {
  repos: string[];
  selectedRepoPath: string | null;
  onSelectRepo: (path: string | null) => void;
  repoTreeListings: Record<string, string>;
  repoOpenFolders: Record<string, Set<string>>;
  repoLoadingPaths: Set<string>;
  repoCurrentPath?: string;
  onToggleRepoFolder: (repoPath: string, pathKey: string) => void;
  loadRepoDir: (repoPath: string, relativePath: string, forceRefresh?: boolean) => void;
  onOpenFile?: (filePath: string) => void;
  onCreateFile?: (repoPath: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  onCreateFolder?: (repoPath: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteEntry?: (fullPath: string) => Promise<{ ok: boolean; error?: string }>;
  onCollapseRepo?: (repoPath: string) => void;
  onRemoveRepo?: (path: string) => void;
  basePath?: string;
}

export function RepoSidebar({
  repos,
  selectedRepoPath,
  onSelectRepo,
  repoTreeListings,
  repoOpenFolders,
  repoLoadingPaths,
  repoCurrentPath = '.',
  onToggleRepoFolder,
  loadRepoDir,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onDeleteEntry,
  onCollapseRepo,
  onRemoveRepo,
  basePath = '.',
}: RepoSidebarProps) {
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

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
          <div className="group flex items-center gap-0 rounded min-w-0 w-full">
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
                <div key={`${repoPath}-${fullPath}`} className="group flex items-center gap-0 rounded min-w-0 w-full">
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
          {onCollapseRepo && selectedRepoPath && (
            <button
              type="button"
              onClick={() => onCollapseRepo(selectedRepoPath)}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)]"
              title="Collapse all"
            >
              <ChevronsUp size={16} />
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-2 px-2 font-mono text-sm min-h-0">
        {selectedRepoPath ? (
          <div className="min-h-[120px]">
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
    </div>
  );
}
