import { FolderOpen, Box, Rocket, Server as ServerIcon, HardDrive as FolderDrive, Loader2, Cpu, HardDrive, Clock, RefreshCw, Copy, Check, ChevronRight } from 'lucide-react';
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

function usageTone(percentage: number): { text: string; fill: string } {
  if (percentage < 70) return { text: 'text-success', fill: 'bg-success' };
  if (percentage < 90) return { text: 'text-warning', fill: 'bg-warning' };
  return { text: 'text-error', fill: 'bg-error' };
}

function Meter({ icon: Icon, label, value, detail, percentage }: { icon: typeof Cpu; label: string; value: string; detail: string; percentage: number }) {
  const tone = usageTone(percentage);
  return (
    <div className="rounded-xl border border-border/30 bg-bg-secondary/40 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <Icon size={14} className="shrink-0" />
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tabular-nums ${tone.text}`}>{value}</span>
        <span className="text-xs text-text-muted truncate">{detail}</span>
      </div>
      <div
        className="h-1.5 w-full bg-bg-tertiary rounded-full overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full transition-[width] duration-300 ${tone.fill}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

const MODULES: { view: ViewId; icon: typeof Box; title: string; text: string }[] = [
  { view: 'files', icon: FolderOpen, title: 'Files', text: 'Browse, upload and edit files on the server.' },
  { view: 'docker', icon: Box, title: 'Docker', text: 'Start, stop and restart containers; read their logs.' },
  { view: 'deploy', icon: Rocket, title: 'Deploy', text: 'Pull branches, run build steps and roll back.' },
];

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

  const isLocal = currentServer.connectionType === 'local' || currentServer.id === 'dummy';
  const projectPath = currentServer.projectPath || currentServer.cwd || '';
  const address = isLocal ? projectPath || 'This computer' : `${currentServer.username}@${currentServer.host}`;
  const kind = isLocal ? 'Local project' : (({ ec2: 'SSH key', password: 'SSH password', cloudflare: 'Cloudflare tunnel' }) as Record<string, string>)[currentServer.connectionType ?? 'ec2'] ?? 'SSH';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const uptime = parseUptime(sysInfo.uptime);
  const mem = parseMemory(sysInfo.memory);
  const disk = parseDisk(sysInfo.disk);
  const hasStats = !!(mem || disk || uptime);

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0 overflow-auto">
      <div className="max-w-3xl mx-auto w-full p-6 space-y-8">
        <header className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent/12 text-accent flex items-center justify-center shrink-0">
            {isLocal ? <FolderDrive size={20} /> : <ServerIcon size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-text-primary truncate">{currentServer.name}</h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary shrink-0">{kind}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              <code className="text-xs text-text-secondary font-mono truncate select-text" title={address}>{address}</code>
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
                title={isLocal ? 'Copy folder path' : 'Copy SSH address'}
                aria-label={isLocal ? 'Copy folder path' : 'Copy SSH address'}
              >
                {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              </button>
            </div>
            {!isLocal && projectPath && (
              <p className="text-xs text-text-muted mt-0.5 truncate" title={projectPath}>
                Working folder <span className="font-mono text-text-secondary select-text">{projectPath}</span>
              </p>
            )}
          </div>
        </header>

        {onViewChange && (
          <section aria-label="Open a tool">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {MODULES.map(({ view, icon: Icon, title, text }) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => onViewChange(view)}
                  className="group flex flex-col items-start gap-3 p-4 rounded-xl bg-bg-secondary/40 border border-border/30 hover:border-accent/50 hover:bg-bg-tertiary/40 transition-colors cursor-pointer text-left"
                >
                  <span className="flex items-center justify-between w-full">
                    <span className="w-8 h-8 rounded-lg bg-bg-tertiary group-hover:bg-accent/12 text-text-secondary group-hover:text-accent flex items-center justify-center transition-colors">
                      <Icon size={16} />
                    </span>
                    <ChevronRight size={14} className="text-text-muted group-hover:text-accent transition-colors" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-text-primary">{title}</span>
                    <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{text}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section aria-label="Server health">
          <div className="flex items-center justify-between mb-3 h-7">
            <h2 className="text-sm font-semibold text-text-primary">Health</h2>
            {onRefreshServerStatus && !isLocal && (
              <button
                type="button"
                onClick={onRefreshServerStatus}
                disabled={loading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-tertiary/60 hover:text-text-primary disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? <Loader2 size={13} className="animate-spin text-accent" /> : <RefreshCw size={13} />}
                Refresh
              </button>
            )}
          </div>

          {isLocal ? (
            <p className="rounded-xl border border-dashed border-border/40 p-5 text-xs text-text-secondary">
              Memory and disk stats are shown for remote servers. This project runs on your own machine, so use Activity Monitor or Task Manager for those.
            </p>
          ) : loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-bg-secondary/40 p-5 text-xs text-text-secondary">
              <Loader2 size={16} className="animate-spin text-accent shrink-0" />
              Reading server stats…
            </div>
          ) : sysInfo.error ? (
            <p className="rounded-xl border border-error/30 bg-error/5 p-5 text-xs text-error font-mono">{sysInfo.error}</p>
          ) : hasStats ? (
            <div className="space-y-3">
              {uptime && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Clock size={14} className="shrink-0" />
                  Up for <span className="font-semibold text-text-primary tabular-nums">{uptime}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mem && <Meter icon={Cpu} label="Memory" value={`${mem.percentage}%`} detail={`${mem.used} of ${mem.total} MB`} percentage={mem.percentage} />}
                {disk && <Meter icon={HardDrive} label="Disk" value={`${disk.percentage}%`} detail={`${disk.used} of ${disk.size}`} percentage={disk.percentage} />}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/40 p-5 text-xs text-text-secondary">
              No stats yet. Select Refresh to read them from the server.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
