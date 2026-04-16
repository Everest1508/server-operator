import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Shield, Server, Calendar, ChevronDown, RotateCw, FileEdit, X, Save, Play, Square, CircleCheck, CircleX, Plus } from 'lucide-react';
import Editor from '@monaco-editor/react';
import type { ServerConnection, ProxySettings } from '../types';

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
    const res = await runCmd('which certbot 2>/dev/null && certbot --version 2>&1');
    setCertbotCheckLoading(false);
    setCertbotInstalled(res.ok && res.stdout != null && res.stdout.trim().length > 0);
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
    loadCron();
  }, [loadCron]);
  useEffect(() => {
    loadNginx();
  }, [loadNginx]);
  useEffect(() => {
    checkCertbot();
  }, [checkCertbot]);
  useEffect(() => {
    if (certbotInstalled) loadCertList();
  }, [certbotInstalled, loadCertList]);

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
    const ro = new ResizeObserver(() => {
      setNginxEditorHeight(el.clientHeight);
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

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {onRunInTerminal && (
        <p className="text-xs text-[var(--text-muted)] mb-2">
          Cron add, Nginx (start/stop/restart/enable/disable), Certbot install/generate/renew run in the <strong>Deploy terminal</strong> so you can see full output and scroll back — that terminal stays open.
        </p>
      )}
      {/* Cron jobs */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
        <button
          type="button"
          onClick={() => setCronOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] border-b border-[var(--border)]"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Calendar size={16} className="text-[var(--text-secondary)]" />
            Cron jobs
          </span>
          <ChevronDown size={16} className={`text-[var(--text-secondary)] transition-transform ${cronOpen ? '' : '-rotate-90'}`} />
        </button>
        {cronOpen && (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={loadCron}
                disabled={cronLoading}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {cronLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>
            {/* Add new cron job */}
            <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Add cron job</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={cronSchedule}
                  onChange={(e) => setCronSchedule(e.target.value)}
                  placeholder="0 2 * * * (min hour day month dow)"
                  className="flex-1 min-w-0 px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <input
                  type="text"
                  value={cronCommand}
                  onChange={(e) => setCronCommand(e.target.value)}
                  placeholder="Command (e.g. /path/to/script.sh)"
                  className="flex-1 min-w-0 px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={handleAddCronJob}
                  disabled={cronAddLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
                >
                  {cronAddLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add
                </button>
              </div>
              {cronAddError && <p className="text-xs text-[var(--error)]">{cronAddError}</p>}
              <p className="text-[10px] text-[var(--text-muted)]">
                Schedule: minute (0–59) hour (0–23) day (1–31) month (1–12) weekday (0–7). Example: <code className="text-[var(--text-primary)]">0 2 * * *</code> = daily at 2:00.
              </p>
            </div>
            {cronError && <p className="text-xs text-[var(--error)]">{cronError}</p>}
            <pre className="text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-primary)] p-3 rounded border border-[var(--border)] overflow-x-auto whitespace-pre-wrap">
              {cronOutput ?? (cronLoading ? 'Loading…' : '—')}
            </pre>
          </div>
        )}
      </div>

      {/* Nginx */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
        <button
          type="button"
          onClick={() => setNginxOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] border-b border-[var(--border)]"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Server size={16} className="text-[var(--text-secondary)]" />
            Nginx
          </span>
          <ChevronDown size={16} className={`text-[var(--text-secondary)] transition-transform ${nginxOpen ? '' : '-rotate-90'}`} />
        </button>
        {nginxOpen && (
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={loadNginx}
                disabled={nginxLoading}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {nginxLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
              <button
                type="button"
                onClick={handleNginxStart}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {nginxActionLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Start
              </button>
              <button
                type="button"
                onClick={handleNginxStop}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {nginxActionLoading ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                Stop
              </button>
              <button
                type="button"
                onClick={handleNginxRestart}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {nginxActionLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                Restart
              </button>
              <button
                type="button"
                onClick={handleNginxEnable}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {nginxActionLoading ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}
                Enable
              </button>
              <button
                type="button"
                onClick={handleNginxDisable}
                disabled={nginxActionLoading}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {nginxActionLoading ? <Loader2 size={14} className="animate-spin" /> : <CircleX size={14} />}
                Disable
              </button>
              <button
                type="button"
                onClick={handleOpenNginxEditor}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90"
              >
                <FileEdit size={14} />
                Edit nginx config
              </button>
            </div>
            {nginxError && <p className="text-xs text-[var(--error)]">{nginxError}</p>}
            <p className="text-xs text-[var(--text-secondary)]">
              Status: <span className="text-[var(--text-primary)] font-mono">{nginxStatus ?? '—'}</span>
            </p>
            {nginxTest != null && nginxTest.length > 0 && (
              <pre className="text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-primary)] p-2 rounded border border-[var(--border)] overflow-x-auto whitespace-pre-wrap">
                {nginxTest}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Certbot: install / generate */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
        <button
          type="button"
          onClick={() => setCertOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] border-b border-[var(--border)]"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Shield size={16} className="text-[var(--text-secondary)]" />
            Certbot – generate certificate
          </span>
          <ChevronDown size={16} className={`text-[var(--text-secondary)] transition-transform ${certOpen ? '' : '-rotate-90'}`} />
        </button>
        {certOpen && (
          <div className="p-3 space-y-3">
            {certbotCheckLoading && <p className="text-xs text-[var(--text-muted)]">Checking certbot…</p>}
            {certbotInstalled === false && !certbotCheckLoading && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-secondary)]">Certbot not found. Install with snap:</p>
                <button
                  type="button"
                  onClick={handleInstallCertbot}
                  disabled={installCertbotLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {installCertbotLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  Install certbot (snap + symlink)
                </button>
              </div>
            )}
            {certbotInstalled === true && (
              <>
                <p className="text-xs text-[var(--text-secondary)]">
                  Domains (space or comma separated): <code className="text-[var(--text-primary)]">example.com www.example.com</code>
                </p>
                <input
                  type="text"
                  value={certDomains}
                  onChange={(e) => setCertDomains(e.target.value)}
                  placeholder="domain.com domain2.com"
                  className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <input
                  type="email"
                  value={certEmail}
                  onChange={(e) => setCertEmail(e.target.value)}
                  placeholder="Email for Let's Encrypt (required first time)"
                  className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <p className="text-[10px] text-[var(--text-muted)]">
                  Runs: <code className="text-[var(--text-primary)]">sudo certbot certonly --standalone --non-interactive --agree-tos --email YOUR_EMAIL -d domain1 -d domain2</code>. Stop nginx first if port 80 is in use.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateCert}
                  disabled={certLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {certLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  Generate certificate
                </button>
                {certError && <p className="text-xs text-[var(--error)]">{certError}</p>}
                {certOutput && <pre className="text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-primary)] p-2 rounded overflow-auto whitespace-pre-wrap">{certOutput}</pre>}
              </>
            )}
          </div>
        )}
      </div>

      {/* Existing certificates + renew */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
        <button
          type="button"
          onClick={() => setCertsListOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] border-b border-[var(--border)]"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Shield size={16} className="text-[var(--text-secondary)]" />
            Existing certificates
          </span>
          <ChevronDown size={16} className={`text-[var(--text-secondary)] transition-transform ${certsListOpen ? '' : '-rotate-90'}`} />
        </button>
        {certsListOpen && (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadCertList}
                disabled={certListLoading || certbotInstalled !== true}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/50"
              >
                {certListLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh list
              </button>
              <button
                type="button"
                onClick={handleRenew}
                disabled={renewLoading || certbotInstalled !== true}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {renewLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Renew all (one click)
              </button>
            </div>
            {renewOutput && <pre className="text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-primary)] p-2 rounded overflow-auto whitespace-pre-wrap">{renewOutput}</pre>}
            {certList.length === 0 && !certListLoading && certbotInstalled === true && <p className="text-xs text-[var(--text-muted)]">No certificates found. Generate one above.</p>}
            <ul className="space-y-2">
              {certList.map((c) => (
                <li key={c.name} className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{c.name}</p>
                      <p className="text-[var(--text-secondary)]">Domains: {c.domains.join(', ') || '—'}</p>
                      <p className={c.valid ? 'text-[var(--success)]' : 'text-[var(--error)]'}>
                        Expiry: {c.expiryStr} {c.valid && c.daysLeft != null ? `(${c.daysLeft} days left)` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRenewOne(c.name)}
                      disabled={renewLoading || renewingCertName !== null}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
                    >
                      {renewingCertName === c.name ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !nginxConfigSaving && setNginxEditorOpen(false)}
        >
          <div
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-xl flex flex-col w-full max-w-4xl h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--border)] shrink-0">
              <span className="text-sm font-medium text-[var(--text-secondary)]">Config file:</span>
              {nginxConfigListLoading ? (
                <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />
              ) : (
                <>
                  <select
                    value={nginxConfigIsNew ? '__new__' : nginxConfigSelectedPath}
                    onChange={(e) => handleSelectNginxConfig(e.target.value)}
                    className="px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-mono text-[var(--text-primary)] min-w-[200px]"
                  >
                    <option value="__new__">+ Create new config</option>
                    {nginxConfigPaths.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {nginxConfigIsNew && (
                    <input
                      type="text"
                      value={nginxConfigNewPath}
                      onChange={(e) => setNginxConfigNewPath(e.target.value)}
                      placeholder="/etc/nginx/sites-available/my-site.conf"
                      className="flex-1 min-w-[220px] px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                  )}
                </>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleSaveNginxConfig}
                  disabled={nginxConfigLoading || nginxConfigSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {nginxConfigSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {nginxConfigIsNew ? 'Create & save' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => !nginxConfigSaving && setNginxEditorOpen(false)}
                  className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            {nginxConfigError && (
              <div className="px-3 py-2 bg-[var(--error)]/10 border-b border-[var(--error)]/40 text-[var(--error)] text-xs shrink-0">
                {nginxConfigError}
              </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {nginxConfigLoading && !nginxConfigIsNew ? (
                <div className="flex items-center justify-center flex-1 text-[var(--text-muted)]">
                  <Loader2 size={24} className="animate-spin mr-2" /> Loading…
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
