import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Play, RefreshCw, Square, Terminal } from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import { parseSeropShortcuts } from './DeploySidebar';

interface ProjectCommandsProps {
  currentServer: ServerConnection;
  proxy: ProxySettings;
}

interface Command {
  id: string;
  name: string;
  command: string;
  /** Why the command is not allowed on a project connection, if it is not. */
  blocked?: string;
}

interface CommandFile {
  file: string;
  commands: Command[];
}

type RunStatus = 'running' | 'finished' | 'failed' | 'cancelled';

const SEROP_DIR = '.server-operator';

/** Runs the project's `.server-operator/*.serop` shortcuts in its folder and streams the output. */
export function ProjectCommands({ currentServer, proxy }: ProjectCommandsProps) {
  const [files, setFiles] = useState<CommandFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState<{ jobId: string; name: string; status: RunStatus; output: string } | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const jobIdRef = useRef<string | null>(null);
  const proxyArg = proxy.enabled ? proxy : undefined;

  const load = useCallback(async () => {
    const api = window.serverOperator;
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const listRes = await api.listDir({ connection: currentServer, dirPath: SEROP_DIR, proxy: proxyArg });
      const names = (listRes.ok ? (listRes.items ?? []) : [])
        .filter((i) => !i.isDir && i.name.toLowerCase().endsWith('.serop'))
        .map((i) => i.name)
        .sort((a, b) => a.localeCompare(b));
      const loaded: CommandFile[] = [];
      for (const file of names) {
        const res = await api.readFile({ connection: currentServer, filePath: `${SEROP_DIR}/${file}`, proxy: proxyArg });
        if (!res.ok) continue;
        const { shortcuts } = parseSeropShortcuts(res.content || '');
        if (shortcuts.length) loaded.push({ file, commands: shortcuts.map((s) => ({ ...s, id: `${file}:${s.id}` })) });
      }
      const all = loaded.flatMap((f) => f.commands);
      const check = await api.checkProjectCommands?.({ commands: all.map((c) => c.command), projectPath: currentServer.projectPath });
      all.forEach((c, i) => { c.blocked = check?.problems[i] ?? undefined; });
      setFiles(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commands');
    } finally {
      setLoading(false);
    }
  }, [currentServer, proxy.enabled, proxy.host, proxy.port]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onLog = (e: Event) => {
      const d = (e as CustomEvent<{ jobId?: string; data?: string }>).detail;
      if (!d || d.jobId !== jobIdRef.current) return;
      setRun((r) => (r ? { ...r, output: r.output + (d.data ?? '') } : r));
    };
    const onEnd = (status: RunStatus) => (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; jobId?: string; job?: { id?: string } }>).detail;
      const id = d?.jobId ?? d?.id ?? d?.job?.id;
      if (id && id === jobIdRef.current) setRun((r) => (r ? { ...r, status } : r));
    };
    const onFinished = onEnd('finished');
    const onError = onEnd('failed');
    const onCancelled = onEnd('cancelled');
    window.addEventListener('deploy:job-log', onLog);
    window.addEventListener('deploy:job-finished', onFinished);
    window.addEventListener('deploy:job-error', onError);
    window.addEventListener('deploy:job-cancelled', onCancelled);
    return () => {
      window.removeEventListener('deploy:job-log', onLog);
      window.removeEventListener('deploy:job-finished', onFinished);
      window.removeEventListener('deploy:job-error', onError);
      window.removeEventListener('deploy:job-cancelled', onCancelled);
    };
  }, []);

  // Backstop for events that fire before the job id is known: while running, sync status and the full log.
  useEffect(() => {
    if (run?.status !== 'running') return;
    const jobId = run.jobId;
    const iv = setInterval(async () => {
      const api = window.serverOperator;
      const list = await api?.deployList?.().catch(() => null);
      const job = list?.ok ? (list.jobs ?? []).find((j: { id: string }) => j.id === jobId) : null;
      if (!job || job.status === 'running') return;
      const log = await api?.deployReadLog?.({ jobId, maxBytes: 200000, offset: 0 }).catch(() => null);
      const status: RunStatus = job.status === 'error' ? 'failed' : job.status === 'cancelled' ? 'cancelled' : 'finished';
      setRun((r) => (r && r.jobId === jobId ? { ...r, status, output: log?.ok && log.content != null ? log.content : r.output } : r));
    }, 1500);
    return () => clearInterval(iv);
  }, [run?.status, run?.jobId]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [run?.output]);

  const runCommand = async (cmd: Command) => {
    const api = window.serverOperator;
    if (!api?.deployStartBg || run?.status === 'running') return;
    setError('');
    const res = await api.deployStartBg({
      serverId: currentServer.id,
      cwd: currentServer.projectPath,
      cmd: cmd.command,
      name: cmd.name,
      connection: currentServer,
      proxy: proxyArg,
    });
    if (!res.ok || !res.jobId) {
      setError(res.error || 'Could not start the command.');
      return;
    }
    jobIdRef.current = res.jobId;
    setRun({ jobId: res.jobId, name: cmd.name, status: 'running', output: '' });
  };

  const stop = () => {
    if (run?.status === 'running') void window.serverOperator?.deployCancel?.({ jobId: run.jobId });
  };

  const running = run?.status === 'running';

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2"><Terminal size={15} /> Commands</h2>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Shortcuts from <span className="font-mono">{SEROP_DIR}</span> in {currentServer.projectLock?.projectName ?? 'this project'}. Only a safe set can run here (inspection, git pull, docker compose with files in the project); the rest are locked.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-2.5 py-1.5 rounded-lg border border-border/30 text-[11px] inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="grid gap-3 content-start overflow-y-auto max-h-[45%] shrink-0">
        {!loading && files.length === 0 && (
          <p className="text-xs text-text-secondary">No <span className="font-mono">.serop</span> commands found in this project's <span className="font-mono">{SEROP_DIR}</span> folder.</p>
        )}
        {files.map((f) => (
          <section key={f.file} className="rounded-xl border border-border/20 bg-bg-secondary/25 p-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">{f.file}</h3>
            <ul className="space-y-1">
              {f.commands.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-bg-primary/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary truncate">{c.name}</p>
                    <p className="font-mono text-[10px] text-text-secondary truncate" title={c.command}>{c.command}</p>
                    {c.blocked && <p className="text-[10px] text-warning truncate" title={c.blocked}>Locked: {c.blocked}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={running || !!c.blocked}
                    title={c.blocked ? `Not allowed: ${c.blocked}` : undefined}
                    onClick={() => void runCommand(c)}
                    className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 shrink-0"
                  >
                    {c.blocked ? <Lock size={11} /> : <Play size={11} />} {c.blocked ? 'Locked' : 'Run'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border/20 bg-bg-primary/40">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
          <span className="text-[11px] font-semibold text-text-secondary">
            {run ? `${run.name} — ${run.status}` : 'Output'}
          </span>
          {running && (
            <button type="button" onClick={stop} className="px-2 py-1 rounded-lg text-[10px] font-semibold text-error inline-flex items-center gap-1 hover:bg-error/10">
              <Square size={10} /> Stop
            </button>
          )}
        </div>
        <pre ref={outputRef} className="flex-1 min-h-0 overflow-auto p-3 font-mono text-[11px] text-text-primary whitespace-pre-wrap break-words">
          {run ? run.output || (running ? 'Starting…' : '') : 'Run a command to see its output here.'}
        </pre>
      </div>
    </div>
  );
}
