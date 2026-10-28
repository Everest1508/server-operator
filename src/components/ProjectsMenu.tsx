import { useEffect, useRef, useState } from 'react';
import { FolderGit2 } from 'lucide-react';
import type { ServerConnection } from '../types';
import { Tooltip } from './Tooltip';
import { useAuth } from '../contexts/AuthContext';
import { ApiProject, ApiSharedServer, fetchSharedServerCredentials, listMyProjects, listSharedServers, projectToConnection } from '../api/client';

interface ProjectsMenuProps {
  activeProjectId?: string;
  onOpenProject: (connection: ServerConnection) => void;
}

export function ProjectsMenu({ activeProjectId, onOpenProject }: ProjectsMenuProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [shared, setShared] = useState<ApiSharedServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      listMyProjects(),
      listSharedServers().catch(() => ({ servers: [] as ApiSharedServer[] })),
    ])
      .then(([res, sharedRes]) => {
        if (cancelled) return;
        setProjects(res.projects);
        setShared(sharedRes.servers);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load projects'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openShared = async (server: ApiSharedServer) => {
    try {
      const { credentials: c } = await fetchSharedServerCredentials(server.id);
      setOpen(false);
      onOpenProject({
        id: `shared:${server.id}`,
        name: `${c.name} (shared)`,
        host: c.host,
        username: c.username,
        connectionType: (c.connectionType as ServerConnection['connectionType']) || 'password',
        privateKeyPath: c.privateKeyPath || undefined,
        projectPath: c.projectPath || undefined,
        password: c.password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to shared server');
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Tooltip content="Projects" position="right">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Projects"
          aria-expanded={open}
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors duration-150 ${
            open || activeProjectId
              ? 'bg-accent/15 text-accent'
              : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary'
          }`}
        >
          <FolderGit2 size={20} strokeWidth={1.8} />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute left-12 top-0 z-50 w-64 rounded-xl border border-border/30 bg-bg-secondary shadow-xl p-2">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">Projects</p>
          {!user || user.isGuest ? (
            <p className="px-2 py-2 text-[11px] text-text-secondary">Sign in to your CRM account (Team view) to see your projects.</p>
          ) : loading ? (
            <p className="px-2 py-2 text-[11px] text-text-secondary">Loading…</p>
          ) : error ? (
            <p className="px-2 py-2 text-[11px] text-error">{error}</p>
          ) : projects.length === 0 && shared.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-text-secondary">No projects yet. Ask a team admin to give you access to one.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onOpenProject(projectToConnection(p)); }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-bg-tertiary/50 ${
                      activeProjectId === p.id ? 'text-accent font-semibold' : 'text-text-primary'
                    }`}
                  >
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate font-mono text-[10px] text-text-secondary" title={p.path}>{p.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && user && !user.isGuest && shared.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">Shared</p>
              <ul className="max-h-60 overflow-y-auto">
                {shared.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => openShared(s)}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-text-primary hover:bg-bg-tertiary/50"
                    >
                      <span className="block truncate">{s.name}</span>
                      {s.projectPath && (
                        <span className="block truncate font-mono text-[10px] text-text-secondary" title={s.projectPath}>{s.projectPath}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
