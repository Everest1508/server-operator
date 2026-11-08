import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, RefreshCw, Copy, Check, Play, AlertTriangle, Info, CircleCheck } from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import { Button } from './ui/Button';
import { confirmDialog } from '../utils/confirm';
import { analyzeScan, buildScanCommand, parseScan, type Finding, type Severity } from '../utils/securityScan';

interface SecurityScanProps {
  currentServer: ServerConnection;
  proxy?: ProxySettings;
}

interface StoredScan {
  at: string;
  findings: Finding[];
}

const storageKey = (serverId: string) => `serop-security-scan:${serverId}`;

const SEVERITY_STYLE: Record<Severity, { label: string; chip: string; border: string; icon: JSX.Element }> = {
  critical: { label: 'Critical', chip: 'bg-error/10 text-error border-error/25', border: 'border-error/30', icon: <ShieldAlert size={14} className="text-error shrink-0" /> },
  warning: { label: 'Warning', chip: 'bg-warning/10 text-warning border-warning/25', border: 'border-warning/30', icon: <AlertTriangle size={14} className="text-warning shrink-0" /> },
  info: { label: 'Info', chip: 'bg-accent/10 text-accent border-accent/25', border: 'border-border/25', icon: <Info size={14} className="text-accent shrink-0" /> },
  ok: { label: 'OK', chip: 'bg-success/10 text-success border-success/25', border: 'border-success/30', icon: <CircleCheck size={14} className="text-success shrink-0" /> },
};

function loadStored(serverId: string): StoredScan | null {
  try {
    const raw = localStorage.getItem(storageKey(serverId));
    return raw ? (JSON.parse(raw) as StoredScan) : null;
  } catch {
    return null;
  }
}

export function SecurityScan({ currentServer, proxy }: SecurityScanProps) {
  const [scan, setScan] = useState<StoredScan | null>(() => loadStored(currentServer.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixMsg, setFixMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setScan(loadStored(currentServer.id));
    setError(null);
    setFixMsg(null);
  }, [currentServer.id]);

  const runScan = useCallback(async () => {
    if (!window.serverOperator) return;
    setLoading(true);
    setError(null);
    setFixMsg(null);
    try {
      const res = await window.serverOperator.runCommand({
        connection: currentServer,
        command: buildScanCommand(),
        proxy: proxy?.enabled ? proxy : undefined,
      });
      const out = res.stdout || '';
      if (!res.ok || !out.includes('SEROP_SCAN 1')) {
        throw new Error(res.error || res.stderr || 'The scan script did not run. Is this a Linux server with a POSIX shell?');
      }
      const next: StoredScan = { at: new Date().toISOString(), findings: analyzeScan(parseScan(out)) };
      setScan(next);
      try { localStorage.setItem(storageKey(currentServer.id), JSON.stringify(next)); } catch { /* storage full or blocked */ }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [currentServer, proxy]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch { /* clipboard blocked */ }
  };

  const applyFix = async (f: Finding) => {
    if (!f.runFix || !window.serverOperator) return;
    if (!await confirmDialog(`${f.runFix.confirm}\n\nThis runs:\n${f.runFix.command}`, { confirmLabel: f.runFix.label })) return;
    setFixing(f.id);
    setFixMsg(null);
    try {
      const res = await window.serverOperator.runCommand({
        connection: currentServer,
        command: `${f.runFix.command} 2>&1`,
        proxy: proxy?.enabled ? proxy : undefined,
      });
      const text = (res.stdout || res.stderr || res.error || '').trim();
      if (res.ok && (res.code ?? 0) === 0) {
        setFixMsg({ id: f.id, ok: true, text: text || 'Done. Run the check again to confirm.' });
      } else {
        const sudoHint = /password is required|a terminal is required/i.test(text) ? ' This needs passwordless sudo. Run it in a terminal instead.' : '';
        setFixMsg({ id: f.id, ok: false, text: (text || `Exit ${res.code}`) + sudoHint });
      }
    } finally {
      setFixing(null);
    }
  };

  const counts = (scan?.findings || []).reduce<Record<Severity, number>>(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { critical: 0, warning: 0, info: 0, ok: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 select-none">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Security check</h3>
          <p className="text-xs text-text-muted mt-1 leading-relaxed max-w-xl">
            Looks for databases open to the internet, missing or weak passwords, signs of a crypto miner, password SSH logins and a disabled firewall. The check only reads; nothing on the server changes unless you run a fix.
          </p>
        </div>
        <Button onClick={runScan} disabled={loading}>
          {loading ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
          {scan ? 'Run again' : 'Run check'}
        </Button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex gap-1.5 items-start font-mono select-text">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !scan && (
        <div className="flex items-center justify-center py-10 gap-2 text-text-muted text-xs select-none">
          <RefreshCw size={14} className="animate-spin text-accent" />
          Checking the server. This takes 5 to 30 seconds, depending on how many containers it runs.
        </div>
      )}

      {!scan && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-muted select-none">
          <ShieldCheck size={22} />
          <p className="text-xs">Run the check to see how exposed this server is.</p>
        </div>
      )}

      {scan && (
        <>
          <div className="flex flex-wrap items-center gap-2 select-none">
            {(['critical', 'warning', 'info'] as const).map((s) => (
              <span key={s} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${SEVERITY_STYLE[s].chip}`}>
                {counts[s]} {SEVERITY_STYLE[s].label.toLowerCase()}
              </span>
            ))}
            <span className="text-[11px] text-text-muted ml-1">Last checked {new Date(scan.at).toLocaleString()}</span>
          </div>

          <div className="flex flex-col gap-3">
            {scan.findings.map((f) => {
              const st = SEVERITY_STYLE[f.severity];
              return (
                <div key={f.id} className={`border rounded-xl p-4 bg-bg-secondary/20 flex flex-col gap-2.5 ${st.border}`}>
                  <div className="flex items-start gap-2">
                    {st.icon}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-text-primary break-words">{f.title}</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${st.chip}`}>{f.category}</span>
                      </div>
                      <p className="text-xs text-text-secondary mt-1.5 leading-relaxed whitespace-pre-wrap break-words select-text">{f.detail}</p>
                    </div>
                  </div>

                  {f.fix && (
                    <div className="relative">
                      <pre className="text-[11px] font-mono bg-bg-tertiary/60 border border-border/20 rounded-lg p-3 pr-10 whitespace-pre-wrap break-words text-text-secondary select-text">{f.fix}</pre>
                      <button
                        type="button"
                        aria-label="Copy fix"
                        title="Copy"
                        onClick={() => copy(f.id, f.fix!)}
                        className="absolute top-2 right-2 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer"
                      >
                        {copied === f.id ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}

                  {f.runFix && (
                    <div className="flex items-center gap-2">
                      <Button variant="softDestructive" size="sm" onClick={() => applyFix(f)} disabled={fixing === f.id}>
                        {fixing === f.id ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                        {f.runFix.label}
                      </Button>
                    </div>
                  )}

                  {fixMsg?.id === f.id && (
                    <div role="status" className={`p-2.5 rounded-lg text-[11px] font-mono whitespace-pre-wrap select-text ${fixMsg.ok ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'}`}>
                      {fixMsg.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
