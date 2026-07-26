import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Shield, Server, Calendar, ChevronDown, RotateCw, FileEdit, X, Save, Play, Square, CircleCheck, CircleX, Plus } from 'lucide-react';
import Editor from '@monaco-editor/react';
import type { ServerConnection, ProxySettings } from '../types';
import { Select } from './Select';

const NGINX_MAIN_CONFIG = '/etc/nginx/nginx.conf';
const NGINX_DEFAULT_NEW_PATH = '/etc/nginx/sites-available/new-site.conf';
const NGINX_EMPTY_TEMPLATE = `# New server block
server {
    listen 80;
    server_name example.com;
    root /var/www/html;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
`;

interface ServerToolsViewProps {
  currentServer: ServerConnection;
  proxy?: ProxySettings;
  /** When set, server actions run in this terminal so output stays in one place. */
  onRunInTerminal?: (cmd: string) => void;
}

interface CertInfo {
  name: string;
  domains: string[];
  expiryStr: string;
  valid: boolean;
  daysLeft?: number;
}

function parseCertbotCertificates(stdout: string): CertInfo[] {
  const certs: CertInfo[] = [];
  const nameMatch = stdout.matchAll(/Certificate Name: ([^\n]+)/g);
  const names = [...nameMatch].map((m) => m[1].trim());
  const expiryMatch = stdout.matchAll(/Expiry Date: ([^(]+) \(([^)]+)\)/g);
  const expiries = [...expiryMatch].map((m) => ({ date: m[1].trim(), status: m[2].trim() }));
  const domainMatch = stdout.matchAll(/Domains: ([^\n]+)/g);
  const domainLines = [...domainMatch].map((m) => m[1].trim().split(/\s+/));

  for (let i = 0; i < names.length; i++) {
    const status = expiries[i]?.status ?? '';
    const valid = status.includes('VALID');
    const daysMatch = status.match(/(\d+)\s+days/);
    certs.push({
      name: names[i],
      domains: domainLines[i] ?? [],
      expiryStr: expiries[i]?.date ?? '',
      valid,
      daysLeft: daysMatch ? parseInt(daysMatch[1], 10) : undefined,
    });
  }
  return certs;
}

export function ServerToolsView({ currentServer, proxy, onRunInTerminal }: ServerToolsViewProps) {
  const [cronOutput, setCronOutput] = useState<string | null>(null);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const [cronSchedule, setCronSchedule] = useState('');
  const [cronCommand, setCronCommand] = useState('');
  const [cronAddLoading, setCronAddLoading] = useState(false);
  const [cronAddError, setCronAddError] = useState<string | null>(null);

  const [nginxStatus, setNginxStatus] = useState<string | null>(null);
  const [nginxTest, setNginxTest] = useState<string | null>(null);
  const [nginxLoading, setNginxLoading] = useState(false);
  const [nginxError, setNginxError] = useState<string | null>(null);
  const [nginxActionLoading, setNginxActionLoading] = useState(false);

  const [nginxEditorOpen, setNginxEditorOpen] = useState(false);
  const [nginxConfigPaths, setNginxConfigPaths] = useState<string[]>([]);
  const [nginxConfigListLoading, setNginxConfigListLoading] = useState(false);
  const [nginxConfigSelectedPath, setNginxConfigSelectedPath] = useState('');
  const [nginxConfigIsNew, setNginxConfigIsNew] = useState(false);
  const [nginxConfigNewPath, setNginxConfigNewPath] = useState(NGINX_DEFAULT_NEW_PATH);
  const [nginxConfigContent, setNginxConfigContent] = useState('');
  const [nginxConfigLoading, setNginxConfigLoading] = useState(false);
  const [nginxConfigSaving, setNginxConfigSaving] = useState(false);
  const [nginxConfigError, setNginxConfigError] = useState<string | null>(null);
  const nginxEditorContainerRef = useRef<HTMLDivElement>(null);
  const [nginxEditorHeight, setNginxEditorHeight] = useState(400);

  const [certbotInstalled, setCertbotInstalled] = useState<boolean | null>(null);
  const [certbotCheckLoading, setCertbotCheckLoading] = useState(false);
  const [certDomains, setCertDomains] = useState('');
  const [certEmail, setCertEmail] = useState('');
  const [certLoading, setCertLoading] = useState(false);
  const [certOutput, setCertOutput] = useState<string | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [installCertbotLoading, setInstallCertbotLoading] = useState(false);

  const [certList, setCertList] = useState<CertInfo[]>([]);
  const [certListLoading, setCertListLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [renewOutput, setRenewOutput] = useState<string | null>(null);
  const [renewingCertName, setRenewingCertName] = useState<string | null>(null);

  const [cronOpen, setCronOpen] = useState(true);
  const [nginxOpen, setNginxOpen] = useState(true);
  const [certOpen, setCertOpen] = useState(true);
  const [certsListOpen, setCertsListOpen] = useState(true);

  const runCmd = useCallback(
    async (command: string) => {
      if (!window.serverOperator) return { ok: false as const, error: 'Not available' };
      return window.serverOperator.runCommand({
        connection: currentServer,
        command,
        proxy: proxy?.enabled ? proxy : undefined,
      });
    },
    [currentServer, proxy]
  );
  const isLocal = currentServer.connectionType === 'local';

  const loadCron = useCallback(async () => {
    setCronLoading(true);
    setCronError(null);
    const res = await runCmd('crontab -l 2>/dev/null || echo "# (no crontab for this user)"');
    setCronLoading(false);
    if (res.ok && res.stdout != null) setCronOutput(res.stdout);
    else setCronError(res.error || res.stderr || 'Failed to read crontab');
  }, [runCmd]);

  const handleAddCronJob = useCallback(async () => {
    const schedule = cronSchedule.trim();
    const command = cronCommand.trim();
    if (!schedule || !command) {
      setCronAddError('Enter both schedule (e.g. 0 2 * * *) and command.');
      return;
    }
    const line = `${schedule} ${command}`;
    const escaped = line.replace(/'/g, "'\\''");
    const cmd = `(crontab -l 2>/dev/null; echo '${escaped}') | crontab -`;
    if (onRunInTerminal) {
      setCronAddError(null);
      setCronAddLoading(true);
      onRunInTerminal(cmd);
      setCronSchedule('');
      setCronCommand('');
      setTimeout(() => {
        loadCron();
        setCronAddLoading(false);
      }, 1500);
      return;
    }
    setCronAddLoading(true);
    setCronAddError(null);
    const res = await runCmd(cmd);
    setCronAddLoading(false);
    if (res.ok) {
      setCronSchedule('');
      setCronCommand('');
      loadCron();
    } else {
      setCronAddError(res.error || res.stderr || res.stdout || 'Failed to add cron job');
    }
  }, [cronSchedule, cronCommand, runCmd, onRunInTerminal, loadCron]);

  const loadNginx = useCallback(async () => {
    setNginxLoading(true);
    setNginxError(null);
    const [statusRes, testRes] = await Promise.all([
      runCmd('sudo systemctl is-active nginx 2>/dev/null || echo "inactive"'),
      runCmd('sudo nginx -t 2>&1'),
    ]);
    setNginxLoading(false);
    if (statusRes.ok && statusRes.stdout != null) setNginxStatus(statusRes.stdout.trim());
    if (testRes.ok) setNginxTest((testRes.stdout || testRes.stderr || '').trim());
    else setNginxError(testRes.error || testRes.stderr || 'nginx -t failed');
  }, [runCmd]);

  const checkCertbot = useCallback(async () => {
    setCertbotCheckLoading(true);
    const res = await runCmd(
      'command -v certbot 2>/dev/null || ' +
      'test -x /snap/bin/certbot && echo /snap/bin/certbot || ' +
      'test -x /usr/local/bin/certbot && echo /usr/local/bin/certbot || ' +
      'test -x /usr/bin/certbot && echo /usr/bin/certbot'
    );
    setCertbotCheckLoading(false);
    const found = (res.stdout ?? '').trim().length > 0 || (res.stderr ?? '').includes('certbot');
    setCertbotInstalled(found);
  }, [runCmd]);

  const loadCertList = useCallback(async () => {
    setCertListLoading(true);
    setCertList([]);
    const res = await runCmd('sudo certbot certificates 2>&1');
    setCertListLoading(false);
    if (res.ok && res.stdout) {
      const certs = parseCertbotCertificates(res.stdout);
      setCertList(certs);
    }
  }, [runCmd]);

  useEffect(() => {
    if (isLocal) return;
    loadCron();
  }, [loadCron, isLocal]);
  useEffect(() => {
    if (isLocal) return;
    loadNginx();
  }, [loadNginx, isLocal]);
  useEffect(() => {
    if (isLocal) return;
    checkCertbot();
  }, [checkCertbot, isLocal]);
  useEffect(() => {
    if (isLocal) return;
    if (certbotInstalled) loadCertList();
  }, [certbotInstalled, loadCertList, isLocal]);

  const handleInstallCertbot = async () => {
    const cmd = 'sudo snap install --classic certbot 2>&1 && sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot 2>&1';
    if (onRunInTerminal) {
      setInstallCertbotLoading(true);
      setCertError(null);
      onRunInTerminal(cmd);
      setTimeout(() => {
        checkCertbot();
        loadCertList();
        setInstallCertbotLoading(false);
      }, 8000);
      return;
    }
    setInstallCertbotLoading(true);
    setCertError(null);
    const r1 = await runCmd('sudo snap install --classic certbot 2>&1');
    if (!r1.ok) {
      setCertError(r1.error || r1.stderr || 'snap install failed');
      setInstallCertbotLoading(false);
      return;
    }
    const r2 = await runCmd('sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot 2>&1');
    setInstallCertbotLoading(false);
    if (r2.ok) {
      setCertbotInstalled(true);
      loadCertList();
    } else setCertError(r2.error || r2.stderr || 'ln failed');
  };

  const handleGenerateCert = async () => {
    const domains = certDomains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
    const email = certEmail.trim();
    if (!domains.length) {
      setCertError('Enter at least one domain (e.g. example.com or example.com www.example.com)');
      return;
    }
    if (!email) {
      setCertError('Enter your email for Let\'s Encrypt (required first time).');
      return;
    }
    const domainArgs = domains.map((d) => `-d ${d}`).join(' ');
    const cmd = `sudo certbot certonly --standalone --non-interactive --agree-tos --email ${email} ${domainArgs}`;
    if (onRunInTerminal) {
      setCertLoading(true);
      setCertError(null);
      setCertOutput(null);
      onRunInTerminal(cmd);
      setCertDomains('');
      setTimeout(() => {
        loadCertList();
        setCertLoading(false);
        setCertOutput('Check the Deploy terminal for output.');
      }, 6000);
      return;
    }
    setCertLoading(true);
    setCertError(null);
    setCertOutput(null);
    const res = await runCmd(cmd);
    setCertLoading(false);
    if (res.ok) {
      setCertOutput(res.stdout || res.stderr || 'Certificate issued.');
      setCertDomains('');
      loadCertList();
    } else {
      setCertError(res.error || res.stderr || res.stdout || 'Certbot failed');
      setCertOutput(res.stdout || res.stderr || null);
    }
  };

  const handleRenew = async () => {
    const cmd = 'sudo certbot renew --non-interactive 2>&1';
    if (onRunInTerminal) {
      setRenewLoading(true);
      setRenewOutput(null);
      onRunInTerminal(cmd);
      setTimeout(() => {
        loadCertList();
        setRenewLoading(false);
        setRenewOutput('Check the Deploy terminal for output.');
      }, 6000);
      return;
    }
    setRenewLoading(true);
    setRenewOutput(null);
    const res = await runCmd(cmd);
    setRenewLoading(false);
    setRenewOutput(res.stdout || res.stderr || res.error || 'Done');
    if (res.ok) loadCertList();
  };

  const handleRenewOne = async (certName: string) => {
    const escaped = certName.replace(/'/g, "'\\''");
    const cmd = `sudo certbot renew --cert-name '${escaped}' --non-interactive 2>&1`;
    if (onRunInTerminal) {
      setRenewingCertName(certName);
      onRunInTerminal(cmd);
      setTimeout(() => {
        loadCertList();
        setRenewingCertName(null);
      }, 6000);
      return;
    }
    setRenewingCertName(certName);
    const res = await runCmd(cmd);
    setRenewingCertName(null);
    if (res.ok) loadCertList();
  };

  const runNginxAction = async (cmd: string, label: string) => {
    if (onRunInTerminal) {
      onRunInTerminal(cmd);
      setNginxActionLoading(true);
      setNginxError(null);
      setTimeout(() => {
        loadNginx();
        setNginxActionLoading(false);
      }, 2000);
      return;
    }
    setNginxActionLoading(true);
    setNginxError(null);
    const res = await runCmd(cmd);
    setNginxActionLoading(false);
    if (res.ok) loadNginx();
    else setNginxError(res.error || res.stderr || res.stdout || `${label} failed`);
  };

  const handleNginxStart = () => runNginxAction('sudo systemctl start nginx 2>&1', 'Start');
  const handleNginxStop = () => runNginxAction('sudo systemctl stop nginx 2>&1', 'Stop');
  const handleNginxRestart = () => runNginxAction('sudo systemctl restart nginx 2>&1', 'Restart');
  const handleNginxEnable = () => runNginxAction('sudo systemctl enable nginx 2>&1', 'Enable');
  const handleNginxDisable = () => runNginxAction('sudo systemctl disable nginx 2>&1', 'Disable');

  const loadNginxConfigList = useCallback(async () => {
    const res = await runCmd("find /etc/nginx -type f -name '*.conf' 2>/dev/null | sort");
    if (!res.ok || res.stdout == null) return [];
    const paths = res.stdout.trim().split('\n').filter(Boolean);
    if (!paths.includes(NGINX_MAIN_CONFIG)) paths.unshift(NGINX_MAIN_CONFIG);
    return paths;
  }, [runCmd]);

  const loadNginxConfigContent = useCallback(
    async (filePath: string) => {
      if (!window.serverOperator) return { ok: false as const, error: 'Not available' };
      return window.serverOperator.readFile({
        connection: currentServer,
        filePath,
        proxy: proxy?.enabled ? proxy : undefined,
      });
    },
    [currentServer, proxy]
  );

  const handleOpenNginxEditor = async () => {
    setNginxEditorOpen(true);
    setNginxConfigError(null);
    setNginxConfigContent('');
    setNginxConfigListLoading(true);
    setNginxConfigLoading(true);
    setNginxEditorHeight(400);
    if (!window.serverOperator) {
      setNginxConfigError('Not available');
      setNginxConfigListLoading(false);
      setNginxConfigLoading(false);
      return;
    }
    const paths = await loadNginxConfigList();
    setNginxConfigPaths(paths);
    setNginxConfigListLoading(false);
    const defaultPath = paths.length ? paths[0] : NGINX_MAIN_CONFIG;
    setNginxConfigSelectedPath(defaultPath);
    setNginxConfigIsNew(false);
    setNginxConfigNewPath(NGINX_DEFAULT_NEW_PATH);
    const res = await loadNginxConfigContent(defaultPath);
    setNginxConfigLoading(false);
    if (res.ok && res.content != null) setNginxConfigContent(res.content);
    else setNginxConfigError(res.error || 'Failed to read file');
  };

  const handleSelectNginxConfig = async (value: string) => {
    if (value === '__new__') {
      setNginxConfigIsNew(true);
      setNginxConfigContent(NGINX_EMPTY_TEMPLATE);
      setNginxConfigError(null);
      return;
    }
    setNginxConfigIsNew(false);
    setNginxConfigSelectedPath(value);
    setNginxConfigLoading(true);
    setNginxConfigError(null);
    const res = await loadNginxConfigContent(value);
    setNginxConfigLoading(false);
    if (res.ok && res.content != null) setNginxConfigContent(res.content);
    else setNginxConfigError(res.error || 'Failed to read file');
  };

  useEffect(() => {
    if (!nginxEditorOpen || nginxConfigLoading) return;
    const el = nginxEditorContainerRef.current;
    if (!el) return;
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setNginxEditorHeight(el.clientHeight);
      });
    });
    ro.observe(el);
    setNginxEditorHeight(el.clientHeight);
    return () => ro.disconnect();
  }, [nginxEditorOpen, nginxConfigLoading]);

  const handleSaveNginxConfig = async () => {
    const filePath = nginxConfigIsNew ? nginxConfigNewPath.trim() : nginxConfigSelectedPath;
    if (!filePath) {
      setNginxConfigError('Enter a path for the new config file.');
      return;
    }
    setNginxConfigSaving(true);
    setNginxConfigError(null);
    if (!window.serverOperator) {
      setNginxConfigError('Not available');
      setNginxConfigSaving(false);
      return;
    }
    const res = await window.serverOperator.writeFile({
      connection: currentServer,
      filePath,
      content: nginxConfigContent,
      proxy: proxy?.enabled ? proxy : undefined,
    });
    setNginxConfigSaving(false);
    if (res.ok) {
      if (nginxConfigIsNew && !nginxConfigPaths.includes(filePath)) {
        setNginxConfigPaths((p) => [...p, filePath].sort());
        setNginxConfigIsNew(false);
        setNginxConfigSelectedPath(filePath);
      }
      setNginxEditorOpen(false);
      loadNginx();
    } else setNginxConfigError(res.error || 'Failed to write file');
  };

  if (isLocal) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 select-none">
        <div className="max-w-sm text-center space-y-3">
          <Server size={32} className="mx-auto text-text-muted opacity-50" />
          <p className="text-sm font-semibold text-text-primary">Server Administration</p>
          <p className="text-xs text-text-muted leading-relaxed">
            Server administration tools (nginx, certbot, cron) are only available for remote SSH connections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 select-none">
      {onRunInTerminal && (
        <p className="text-xs text-text-muted mb-3 font-sans italic max-w-2xl leading-relaxed">
          Actions like Cron addition, Nginx commands, and Certbot issuance run asynchronously inside your active SSH deployment pipeline terminal stream.
        </p>
      )}

      {/* Cron jobs */}
      <div className="rounded-xl border border-border/20 bg-bg-secondary/35 shadow-sm backdrop-blur-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setCronOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2.5 px-4 py-3 bg-bg-secondary/25 hover:bg-bg-secondary/50 border-b border-border/20 transition-colors duration-150 cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Calendar size={14} className="text-text-muted" />
            Cron Scheduling
          </span>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${cronOpen ? '' : '-rotate-90'}`} />
        </button>
        {cronOpen && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadCron}
                disabled={cronLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {cronLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <RefreshCw size={12} />}
                Refresh Table
              </button>
            </div>
            {/* Add new cron job */}
            <div className="rounded-xl border border-border/20 bg-bg-primary/40 p-4 space-y-3">
              <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Register new job</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={cronSchedule}
                  onChange={(e) => setCronSchedule(e.target.value)}
                  placeholder="0 2 * * * (minute hour day month weekday)"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-bg-secondary/50 border border-border/30 text-xs font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  value={cronCommand}
                  onChange={(e) => setCronCommand(e.target.value)}
                  placeholder="Command (e.g. /var/www/app/backup.sh)"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-bg-secondary/50 border border-border/30 text-xs font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={handleAddCronJob}
                  disabled={cronAddLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 shrink-0 cursor-pointer transition-colors shadow-sm"
                >
                  {cronAddLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Add Cron
                </button>
              </div>
              {cronAddError && <p className="text-xs text-error font-mono">{cronAddError}</p>}
              <p className="text-[10px] text-text-muted leading-relaxed font-sans select-none">
                Syntax helper: minute (0–59) hour (0–23) day (1–31) month (1–12) weekday (0–7). For instance, <code className="text-text-primary bg-bg-tertiary px-1 rounded font-mono">0 2 * * *</code> re-runs daily at 02:00.
              </p>
            </div>
            {cronError && <p className="text-xs text-error font-mono">{cronError}</p>}
            <pre className="text-xs font-mono text-text-primary bg-bg-primary p-3 rounded-xl border border-border/20 overflow-x-auto whitespace-pre-wrap select-text selection:bg-accent/30 selection:text-white">
              {cronOutput ?? (cronLoading ? 'Querying system daemon…' : '—')}
            </pre>
          </div>
        )}
      </div>

      {/* Nginx */}
      <div className="rounded-xl border border-border/20 bg-bg-secondary/35 shadow-sm backdrop-blur-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setNginxOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2.5 px-4 py-3 bg-bg-secondary/25 hover:bg-bg-secondary/50 border-b border-border/20 transition-colors duration-150 cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Server size={14} className="text-text-muted" />
            Nginx Virtual Hosts
          </span>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${nginxOpen ? '' : '-rotate-90'}`} />
        </button>
        {nginxOpen && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={loadNginx}
                disabled={nginxLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {nginxLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <RefreshCw size={12} />}
                Telemetry
              </button>
              <button
                type="button"
                onClick={handleNginxStart}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {nginxActionLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <Play size={12} />}
                Start
              </button>
              <button
                type="button"
                onClick={handleNginxStop}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {nginxActionLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <Square size={12} />}
                Stop
              </button>
              <button
                type="button"
                onClick={handleNginxRestart}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {nginxActionLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <RotateCw size={12} />}
                Restart
              </button>
              <button
                type="button"
                onClick={handleNginxEnable}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {nginxActionLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <CircleCheck size={12} />}
                Enable
              </button>
              <button
                type="button"
                onClick={handleNginxDisable}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {nginxActionLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <CircleX size={12} />}
                Disable
              </button>
              <button
                type="button"
                onClick={handleOpenNginxEditor}
                className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors shadow-sm cursor-pointer ml-auto"
              >
                <FileEdit size={13} />
                Edit Config Files
              </button>
            </div>
            {nginxError && <p className="text-xs text-error font-mono">{nginxError}</p>}
            <p className="text-xs text-text-secondary select-text">
              Active status: <span className="text-text-primary font-mono bg-bg-primary/50 px-2 py-0.5 rounded border border-border/10 font-bold">{nginxStatus ?? '—'}</span>
            </p>
            {nginxTest != null && nginxTest.length > 0 && (
              <pre className="text-xs font-mono text-text-primary bg-bg-primary p-3 rounded-xl border border-border/20 overflow-x-auto whitespace-pre-wrap select-text selection:bg-accent/30 selection:text-white">
                {nginxTest}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Certbot: install / generate */}
      <div className="rounded-xl border border-border/20 bg-bg-secondary/35 shadow-sm backdrop-blur-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setCertOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2.5 px-4 py-3 bg-bg-secondary/25 hover:bg-bg-secondary/50 border-b border-border/20 transition-colors duration-150 cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Shield size={14} className="text-text-muted" />
            Certbot TLS Certificates
          </span>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${certOpen ? '' : '-rotate-90'}`} />
        </button>
        {certOpen && (
          <div className="p-4 space-y-4">
            {certbotCheckLoading && <p className="text-xs font-mono text-text-muted">Probing remote system binaries…</p>}
            {certbotInstalled === false && !certbotCheckLoading && (
              <div className="space-y-3">
                <p className="text-xs text-text-secondary font-sans leading-relaxed">Let\'s Encrypt Certbot utility is not detected on the remote server. Snap integration is recommended for Linux environments.</p>
                <button
                  type="button"
                  onClick={handleInstallCertbot}
                  disabled={installCertbotLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 shrink-0 cursor-pointer transition-colors shadow-sm"
                >
                  {installCertbotLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                  Provision Certbot via Snap
                </button>
              </div>
            )}
            {certbotInstalled === true && (
              <div className="space-y-3 select-text">
                <div>
                  <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5 select-none">Domains (separated by commas or spaces)</label>
                  <input
                    type="text"
                    value={certDomains}
                    onChange={(e) => setCertDomains(e.target.value)}
                    placeholder="example.com www.example.com"
                    className="w-full px-3.5 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5 select-none">Email Address (Let\'s Encrypt alert notifications)</label>
                  <input
                    type="email"
                    value={certEmail}
                    onChange={(e) => setCertEmail(e.target.value)}
                    placeholder="ops@organization.com"
                    className="w-full px-3.5 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
                <p className="text-[10px] text-text-muted leading-relaxed select-none">
                  Runs standard non-interactive standalone challenge. Please verify port <code className="text-text-primary">80</code> is temporarily freed (shut down Nginx if listening) prior to initiating standalone handshake.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateCert}
                  disabled={certLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 shrink-0 cursor-pointer transition-colors shadow-sm"
                >
                  {certLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                  Generate TLS Certificate
                </button>
                {certError && <p className="text-xs text-error font-mono">{certError}</p>}
                {certOutput && <pre className="text-xs font-mono text-text-primary bg-bg-primary p-3 rounded-xl border border-border/20 overflow-auto whitespace-pre-wrap select-text">{certOutput}</pre>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Existing certificates + renew */}
      <div className="rounded-xl border border-border/20 bg-bg-secondary/35 shadow-sm backdrop-blur-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setCertsListOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2.5 px-4 py-3 bg-bg-secondary/25 hover:bg-bg-secondary/50 border-b border-border/20 transition-colors duration-150 cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Shield size={14} className="text-text-muted" />
            Active Certificates Ledger
          </span>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${certsListOpen ? '' : '-rotate-90'}`} />
        </button>
        {certsListOpen && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadCertList}
                disabled={certListLoading || certbotInstalled !== true}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all duration-150 cursor-pointer"
              >
                {certListLoading ? <Loader2 size={12} className="animate-spin text-accent" /> : <RefreshCw size={12} />}
                Sync Ledger
              </button>
              <button
                type="button"
                onClick={handleRenew}
                disabled={renewLoading || certbotInstalled !== true}
                className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 shrink-0 cursor-pointer transition-colors shadow-sm"
              >
                {renewLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Renew All Domains
              </button>
            </div>
            {renewOutput && <pre className="text-xs font-mono text-text-primary bg-bg-primary p-3 rounded-xl border border-border/20 overflow-auto whitespace-pre-wrap select-text">{renewOutput}</pre>}
            {certList.length === 0 && !certListLoading && certbotInstalled === true && <p className="text-xs text-text-muted italic">No registered certificates discovered. Trigger standalone generation above.</p>}
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 select-text">
              {certList.map((c) => (
                <li key={c.name} className="rounded-xl border border-border/20 bg-bg-primary/50 p-4 text-xs backdrop-blur-xs flex flex-col justify-between">
                  <div className="space-y-1">
                    <p className="font-bold text-text-primary truncate" title={c.name}>{c.name}</p>
                    <p className="text-text-secondary truncate font-mono text-[10px]" title={c.domains.join(', ')}>Domains: {c.domains.join(', ') || '—'}</p>
                    <p className={`font-semibold ${c.valid ? 'text-success' : 'text-error'}`}>
                      Expiry: {c.expiryStr} {c.valid && c.daysLeft != null ? `(${c.daysLeft} days remaining)` : ''}
                    </p>
                  </div>
                  <div className="flex items-center justify-end mt-3 border-t border-border/10 pt-2 select-none">
                    <button
                      type="button"
                      onClick={() => handleRenewOne(c.name)}
                      disabled={renewLoading || renewingCertName !== null}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-white text-[10px] font-semibold hover:bg-accent-hover disabled:opacity-50 shrink-0 cursor-pointer shadow-sm transition-colors"
                    >
                      {renewingCertName === c.name ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      Renew
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Nginx config editor modal */}
      {nginxEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !nginxConfigSaving && setNginxEditorOpen(false)}
        >
          <div
            className="rounded-2xl border border-border/40 bg-bg-secondary/95 shadow-2xl flex flex-col w-full max-w-4xl h-[85vh] overflow-hidden backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/20 bg-bg-secondary/45 shrink-0 select-none">
              <span className="text-xs font-semibold text-text-secondary font-sans">Active Configuration:</span>
              {nginxConfigListLoading ? (
                <Loader2 size={13} className="animate-spin text-accent" />
              ) : (
                <>
                  <Select
                    value={nginxConfigIsNew ? '__new__' : nginxConfigSelectedPath}
                    onChange={handleSelectNginxConfig}
                    className="min-w-[200px]"
                    options={[
                      { value: '__new__', label: '+ Create new config' },
                      ...nginxConfigPaths.map((p) => ({ value: p, label: p })),
                    ]}
                  />
                  {nginxConfigIsNew && (
                    <input
                      type="text"
                      value={nginxConfigNewPath}
                      onChange={(e) => setNginxConfigNewPath(e.target.value)}
                      placeholder="/etc/nginx/sites-available/my-site.conf"
                      className="flex-1 min-w-[220px] px-3.5 py-1.5 rounded-xl bg-bg-primary/50 border border-border/30 text-xs font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    />
                  )}
                </>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleSaveNginxConfig}
                  disabled={nginxConfigLoading || nginxConfigSaving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
                >
                  {nginxConfigSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {nginxConfigIsNew ? 'Create & save' : 'Save Config'}
                </button>
                <button
                  type="button"
                  onClick={() => !nginxConfigSaving && setNginxEditorOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-bg-tertiary/60 text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {nginxConfigError && (
              <div className="px-4 py-2 bg-error/10 border-b border-error/20 text-error text-xs shrink-0 select-text font-mono">
                {nginxConfigError}
              </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-bg-primary">
              {nginxConfigLoading && !nginxConfigIsNew ? (
                <div className="flex flex-col items-center justify-center flex-1 text-text-secondary gap-3 select-none bg-bg-primary">
                  <Loader2 size={24} className="animate-spin text-accent" />
                  <span className="text-xs font-mono text-text-muted">Loading configuration file…</span>
                </div>
              ) : (
                <div ref={nginxEditorContainerRef} className="w-full flex-1 min-h-0 overflow-hidden">
                  <Editor
                    height={`${nginxEditorHeight}px`}
                    language="plaintext"
                    theme="vs-dark"
                    value={nginxConfigContent}
                    onChange={(v) => setNginxConfigContent(v ?? '')}
                    options={{
                      minimap: { enabled: true },
                      fontSize: 13,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      padding: { top: 16 },
                      automaticLayout: true,
                      contextmenu: false,
                    }}
                    loading={null}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
