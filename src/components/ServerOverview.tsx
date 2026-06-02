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
      text: 'text-success',
      bg: 'bg-success/10',
      fill: 'bg-success shadow-[0_0_6px_rgba(78,201,176,0.4)]',
    };
  } else if (percentage < 90) {
    return {
      text: 'text-warning',
      bg: 'bg-warning/10',
      fill: 'bg-warning shadow-[0_0_6px_rgba(220,220,170,0.4)]',
    };
  } else {
    return {
      text: 'text-error',
      bg: 'bg-error/10',
      fill: 'bg-error shadow-[0_0_6px_rgba(241,76,76,0.4)]',
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
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0 overflow-auto select-none">
      <div className="max-w-3xl mx-auto w-full p-6 space-y-6">
        
        {/* Server identity */}
        <div className="rounded-xl border border-border/20 bg-bg-secondary/35 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-bg-tertiary text-accent shrink-0 border border-border/30">
              <ServerIcon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-text-primary tracking-wide">{currentServer.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 select-text">
                <code className="text-xs bg-bg-tertiary/70 text-text-secondary px-2.5 py-0.5 rounded-xl border border-border/30 select-all truncate font-mono">
                  {fullAddress}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
                  title="Copy SSH Address"
                >
                  {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </div>
              {projectPath !== '—' && (
                <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-wider text-text-secondary mt-3">
                  <span className="text-text-muted">CWD:</span>
                  <span className="truncate max-w-[400px] font-mono text-xs text-text-primary select-text" title={projectPath}>
                    {projectPath}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions (Icon-Forward Cards) */}
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">
            Available Modules
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {onViewChange && (
              <>
                <button
                  type="button"
                  onClick={() => onViewChange('files')}
                  className="flex flex-col items-start p-5 rounded-2xl bg-bg-secondary/40 border border-border/25 hover:border-accent/40 hover:bg-bg-tertiary/30 shadow-sm backdrop-blur-sm transition-all duration-200 cursor-pointer group text-left"
                >
                  <div className="p-2.5 rounded-xl bg-bg-tertiary group-hover:bg-accent/10 text-text-muted group-hover:text-accent transition-colors duration-200 mb-4 border border-border/10">
                    <FolderOpen size={18} />
                  </div>
                  <span className="text-sm font-bold text-text-primary">File Explorer</span>
                  <span className="text-[10px] text-text-secondary mt-1 font-medium">Browse, upload and edit remote server configurations</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('docker')}
                  className="flex flex-col items-start p-5 rounded-2xl bg-bg-secondary/40 border border-border/25 hover:border-accent/40 hover:bg-bg-tertiary/30 shadow-sm backdrop-blur-sm transition-all duration-200 cursor-pointer group text-left"
                >
                  <div className="p-2.5 rounded-xl bg-bg-tertiary group-hover:bg-accent/10 text-text-muted group-hover:text-accent transition-colors duration-200 mb-4 border border-border/10">
                    <Box size={18} />
                  </div>
                  <span className="text-sm font-bold text-text-primary">Docker Containers</span>
                  <span className="text-[10px] text-text-secondary mt-1 font-medium">Manage daemon services, run compose reloads, stream live stdout</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('deploy')}
                  className="flex flex-col items-start p-5 rounded-2xl bg-bg-secondary/40 border border-border/25 hover:border-accent/40 hover:bg-bg-tertiary/30 shadow-sm backdrop-blur-sm transition-all duration-200 cursor-pointer group text-left"
                >
                  <div className="p-2.5 rounded-xl bg-bg-tertiary group-hover:bg-accent/10 text-text-muted group-hover:text-accent transition-colors duration-200 mb-4 border border-border/10">
                    <Rocket size={18} />
                  </div>
                  <span className="text-sm font-bold text-text-primary">Git Deployment</span>
                  <span className="text-[10px] text-text-secondary mt-1 font-medium">Trigger branches pulls, compile hooks, pm2 reloading, check rollbacks</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* System info */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Resource Telemetry
            </h3>
            {onRefreshServerStatus && (
              <button
                type="button"
                onClick={onRefreshServerStatus}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs text-text-secondary hover:bg-bg-tertiary/50 hover:text-accent disabled:opacity-50 transition-colors cursor-pointer font-semibold border border-transparent hover:border-border/30"
                title="Refresh status"
              >
                {loading ? <Loader2 size={13} className="animate-spin text-accent" /> : <RefreshCw size={12} />}
                <span>Refresh Logs</span>
              </button>
            )}
          </div>
          
          <div className="rounded-xl border border-border/20 bg-bg-secondary/35 divide-y divide-border/10 overflow-hidden shadow-sm backdrop-blur-sm">
            {loading ? (
              <div className="flex items-center gap-3 p-6 text-text-secondary">
                <Loader2 size={18} className="animate-spin shrink-0 text-accent" />
                <span className="text-xs font-mono text-text-muted">Gathering virtual host telemetry…</span>
              </div>
            ) : sysInfo.error ? (
              <div className="p-6 text-error text-xs font-mono">{sysInfo.error}</div>
            ) : (
              <>
                {/* Uptime */}
                {sysInfo.uptime && (
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <Clock size={15} className="text-text-secondary shrink-0" />
                      <span className="text-xs font-semibold text-text-secondary">Uptime</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-bg-tertiary border border-border/30 px-2.5 py-0.5 rounded-xl text-xs font-mono font-bold text-text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
                      {uptimeDisplay}
                    </div>
                  </div>
                )}

                {/* Memory Status */}
                {parsedMem && (
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Cpu size={15} className="text-text-secondary shrink-0" />
                        <span className="text-xs font-semibold text-text-secondary">Memory Usage (RAM)</span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-text-primary select-text">
                        {parsedMem.used} MB / {parsedMem.total} MB ({parsedMem.percentage}%)
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-1.5 w-full bg-bg-tertiary rounded-full overflow-hidden border border-border/10">
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
                        <HardDrive size={15} className="text-text-secondary shrink-0" />
                        <span className="text-xs font-semibold text-text-secondary">Storage Disk Space</span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-text-primary select-text">
                        {parsedDisk.used} / {parsedDisk.size} ({parsedDisk.percentage}%)
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-1.5 w-full bg-bg-tertiary rounded-full overflow-hidden border border-border/10">
                      <div
                        className={`h-full transition-all duration-300 ${getProgressColor(parsedDisk.percentage).fill}`}
                        style={{ width: `${parsedDisk.percentage}%` }}
                      />
                    </div>
                  </div>
                )}

                {!sysInfo.uptime && !sysInfo.memory && !sysInfo.disk && !sysInfo.error && (
                  <div className="p-6 text-text-secondary text-xs text-center italic">No active server telemetry discovered yet. Run diagnostics.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
