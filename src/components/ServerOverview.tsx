import { FolderOpen, Box, Rocket, Server as ServerIcon, Loader2, Cpu, HardDrive, Clock, RefreshCw, Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
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

// ─── Parsers ───────────────────────────────────────────────────────────────

function parseUptime(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/up\s+(.*?)(?:,\s+\d+\s+user|,\s+\d+\s+load)/i) || raw.match(/up\s+(.*)/i);
  if (!match) return raw.trim();
  let uptimePart = match[1].trim();
  if (uptimePart.endsWith(',')) {
    uptimePart = uptimePart.slice(0, -1);
  }
  uptimePart = uptimePart.replace(/,\s*/g, ' ');
  const hhmm = uptimePart.match(/(\d+):(\d+)/);
  if (hhmm) {
    uptimePart = uptimePart.replace(/(\d+):(\d+)/, '$1h $2m');
  }
  uptimePart = uptimePart.replace(/\bmins?\b/g, 'm');
  uptimePart = uptimePart.replace(/\bhours?\b/g, 'h');
  return uptimePart;
}

interface ParsedMemory {
  total: number;
  used: number;
  percentage: number;
}

function parseMemory(raw: string | null): ParsedMemory | null {
  if (!raw) return null;
  const lines = raw.split('\n');
  const memLine = lines.find((l) => l.includes('Mem:'));
  if (!memLine) return null;
  const numbers = memLine.match(/\d+/g);
  if (!numbers || numbers.length < 2) return null;
  const total = parseInt(numbers[0], 10);
  const used = parseInt(numbers[1], 10);
  const percentage = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
  return { total, used, percentage };
}

interface ParsedDisk {
  size: string;
  used: string;
  avail: string;
  percentage: number;
}

function parseDisk(raw: string | null): ParsedDisk | null {
  if (!raw) return null;
  const clean = raw.trim();
  if (!clean) return null;
  const parts = clean.split(/\s+/);
  const pctIndex = parts.findIndex((p) => p.includes('%'));
  if (pctIndex === -1 || pctIndex < 3) return null;
  const percentage = parseInt(parts[pctIndex].replace('%', ''), 10) || 0;
  const size = parts[pctIndex - 3];
  const used = parts[pctIndex - 2];
  const avail = parts[pctIndex - 1];
  return { size, used, avail, percentage };
}

function getProgressColor(percentage: number): { text: string; bg: string; fill: string } {
  if (percentage < 70) {
    return {
      text: 'text-emerald-400',
      bg: 'rgba(16,185,129,0.1)',
      fill: 'bg-emerald-500',
    };
  } else if (percentage < 90) {
    return {
      text: 'text-amber-400',
      bg: 'rgba(245,158,11,0.1)',
      fill: 'bg-amber-500',
    };
  } else {
    return {
      text: 'text-red-500',
      bg: 'rgba(239,68,68,0.1)',
      fill: 'bg-red-500',
    };
  }
}

export function ServerOverview({
  currentServer,
  onViewChange,
  serverSysInfo = null,
  serverStatusLoading = false,
  onRefreshServerStatus,
}: ServerOverviewProps) {
  const sysInfo = serverSysInfo ?? { uptime: null, memory: null, disk: null, error: null };
  const loading = serverStatusLoading;
  const [copied, setCopied] = useState(false);

  const projectPath = currentServer.projectPath || currentServer.cwd || '—';
  const fullAddress = `${currentServer.username}@${currentServer.host}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullAddress]);

  const uptimeDisplay = parseUptime(sysInfo.uptime);
  const parsedMem = parseMemory(sysInfo.memory);
  const parsedDisk = parseDisk(sysInfo.disk);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-h-0 overflow-auto">
      <div className="max-w-2xl mx-auto w-full p-6 space-y-6">
        
        {/* Server identity */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--accent)] shrink-0 border border-[var(--border)]">
              <ServerIcon size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-wide">{currentServer.name}</h2>
              <div className="flex items-center gap-1.5 mt-1.5">
                <code className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded border border-[var(--border)] select-all truncate">
                  {fullAddress}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer shrink-0"
                  title="Copy SSH Address"
                >
                  {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
              {projectPath !== '—' && (
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mt-3">
                  <span className="text-[var(--text-muted)]">CWD:</span>
                  <span className="truncate max-w-[400px] font-mono text-[var(--text-primary)]" title={projectPath}>
                    {projectPath}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions (Icon-Forward Cards) */}
        <div>
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-3">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {onViewChange && (
              <>
                <button
                  type="button"
                  onClick={() => onViewChange('files')}
                  className="flex flex-col items-start p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer group text-left"
                >
                  <div className="p-2 rounded bg-[var(--bg-tertiary)] group-hover:bg-[var(--accent)]/10 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors mb-3">
                    <FolderOpen size={20} />
                  </div>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Files</span>
                  <span className="text-[10px] text-[var(--text-secondary)] mt-1">Browse remote directories</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('docker')}
                  className="flex flex-col items-start p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer group text-left"
                >
                  <div className="p-2 rounded bg-[var(--bg-tertiary)] group-hover:bg-[var(--accent)]/10 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors mb-3">
                    <Box size={20} />
                  </div>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Docker</span>
                  <span className="text-[10px] text-[var(--text-secondary)] mt-1">Manage active containers</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('deploy')}
                  className="flex flex-col items-start p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer group text-left"
                >
                  <div className="p-2 rounded bg-[var(--bg-tertiary)] group-hover:bg-[var(--accent)]/10 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors mb-3">
                    <Rocket size={20} />
                  </div>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Deploy</span>
                  <span className="text-[10px] text-[var(--text-secondary)] mt-1">Trigger code pipelines</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* System info */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              Server Status
            </h3>
            {onRefreshServerStatus && (
              <button
                type="button"
                onClick={onRefreshServerStatus}
                disabled={loading}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors cursor-pointer"
                title="Refresh status"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>Refresh</span>
              </button>
            )}
          </div>
          
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] divide-y divide-[var(--border)] overflow-hidden shadow-sm">
            {loading ? (
              <div className="flex items-center gap-3 p-5 text-[var(--text-secondary)]">
                <Loader2 size={18} className="animate-spin shrink-0 text-[var(--accent)]" />
                <span className="text-sm font-medium">Loading system info…</span>
              </div>
            ) : sysInfo.error ? (
              <div className="p-5 text-[var(--error)] text-sm font-medium">{sysInfo.error}</div>
            ) : (
              <>
                {/* Uptime */}
                {sysInfo.uptime && (
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <Clock size={16} className="text-[var(--text-secondary)] shrink-0" />
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">Uptime</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] border border-[var(--border)] px-2.5 py-1 rounded text-xs font-mono font-bold text-[var(--text-primary)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      {uptimeDisplay}
                    </div>
                  </div>
                )}

                {/* Memory Status */}
                {parsedMem && (
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Cpu size={16} className="text-[var(--text-secondary)] shrink-0" />
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Memory (RAM)</span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {parsedMem.used} MB / {parsedMem.total} MB ({parsedMem.percentage}%)
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border)]">
                      <div
                        className={`h-full transition-all duration-300 ${getProgressColor(parsedMem.percentage).fill}`}
                        style={{ width: `${parsedMem.percentage}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Disk Status */}
                {parsedDisk && (
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <HardDrive size={16} className="text-[var(--text-secondary)] shrink-0" />
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Disk Space</span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {parsedDisk.used} / {parsedDisk.size} ({parsedDisk.percentage}%)
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border)]">
                      <div
                        className={`h-full transition-all duration-300 ${getProgressColor(parsedDisk.percentage).fill}`}
                        style={{ width: `${parsedDisk.percentage}%` }}
                      />
                    </div>
                  </div>
                )}

                {!sysInfo.uptime && !sysInfo.memory && !sysInfo.disk && !sysInfo.error && (
                  <div className="p-5 text-[var(--text-secondary)] text-sm text-center">No system info available.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
