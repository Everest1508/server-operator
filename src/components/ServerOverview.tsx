import { FolderOpen, Box, Rocket, Server as ServerIcon, Loader2, Cpu, HardDrive, Clock, RefreshCw } from 'lucide-react';
import type { ServerConnection, ViewId, ProxySettings } from '../types';

export interface ServerSysInfo {
  uptime: string | null;
  memory: string | null;
  disk: string | null;
  error: string | null;
}

interface ServerOverviewProps {
  currentServer: ServerConnection;
  proxy: ProxySettings;
  onViewChange?: (view: ViewId) => void;
  serverSysInfo?: ServerSysInfo | null;
  serverStatusLoading?: boolean;
  onRefreshServerStatus?: () => void;
}

export function ServerOverview({ currentServer, onViewChange, serverSysInfo = null, serverStatusLoading = false, onRefreshServerStatus }: ServerOverviewProps) {
  const sysInfo = serverSysInfo ?? { uptime: null, memory: null, disk: null, error: null };
  const loading = serverStatusLoading;

  const projectPath = currentServer.projectPath || currentServer.cwd || '—';

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-h-0 overflow-auto">
      <div className="max-w-2xl mx-auto w-full p-6 space-y-6">
        {/* Server identity */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]">
              <ServerIcon size={24} className="text-[var(--accent)]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">{currentServer.name}</h2>
              <p className="text-sm text-[var(--text-secondary)] truncate">{currentServer.username}@{currentServer.host}</p>
              {projectPath !== '—' && (
                <p className="text-xs text-[var(--text-muted)] mt-1 truncate" title={projectPath}>
                  Path: {projectPath}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">Quick actions</h3>
          <div className="flex flex-wrap gap-2">
            {onViewChange && (
              <>
                <button
                  type="button"
                  onClick={() => onViewChange('files')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <FolderOpen size={18} />
                  Files
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('docker')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <Box size={18} />
                  Docker
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('deploy')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <Rocket size={18} />
                  Deploy
                </button>
              </>
            )}
          </div>
        </div>

        {/* System info */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Server status</h3>
            {onRefreshServerStatus && (
              <button
                type="button"
                onClick={onRefreshServerStatus}
                disabled={loading}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
                title="Refresh status"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            )}
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] divide-y divide-[var(--border)]">
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-[var(--text-secondary)]">
                <Loader2 size={18} className="animate-spin shrink-0" />
                <span>Loading system info…</span>
              </div>
            ) : sysInfo.error ? (
              <div className="p-4 text-[var(--error)] text-sm">{sysInfo.error}</div>
            ) : (
              <>
                {sysInfo.uptime && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Clock size={18} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-muted)]">Uptime</p>
                      <p className="text-sm text-[var(--text-primary)] font-mono break-words">{sysInfo.uptime}</p>
                    </div>
                  </div>
                )}
                {sysInfo.memory && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Cpu size={18} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-muted)]">Memory (MB)</p>
                      <pre className="text-sm text-[var(--text-primary)] font-mono whitespace-pre-wrap break-words">{sysInfo.memory}</pre>
                    </div>
                  </div>
                )}
                {sysInfo.disk && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <HardDrive size={18} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-muted)]">Disk (current path)</p>
                      <p className="text-sm text-[var(--text-primary)] font-mono break-words">{sysInfo.disk}</p>
                    </div>
                  </div>
                )}
                {!sysInfo.uptime && !sysInfo.memory && !sysInfo.disk && !sysInfo.error && (
                  <div className="p-4 text-[var(--text-secondary)] text-sm">No system info available.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
