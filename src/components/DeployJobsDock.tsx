import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Ban, ChevronUp, ChevronDown, X, Square } from 'lucide-react';
import { confirmDialog } from '../utils/confirm';

// Live deploy cards in the bottom-right corner, on every screen and for every server.
// Fed by the deploy:job-* events that preload.js re-dispatches from the main process.

type JobStatus = 'running' | 'finished' | 'error' | 'cancelled';

interface DockJob {
  id: string;
  name: string;
  cmd?: string;
  status: JobStatus;
  exitCode?: number | null;
  error?: string;
  noCancel?: boolean;
  serverName?: string;
  production?: boolean;
  startedAt: number;
  finishedAt?: number;
  lines: string[];
  partial: string;
}

const MAX_LINES = 300;
const AUTO_HIDE_MS = 12000;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)/g;

// A carriage return redraws the line (progress bars), so keep only what comes after the last one.
function cleanLine(line: string) {
  const l = line.replace(/\r$/, '');
  const i = l.lastIndexOf('\r');
  return i >= 0 ? l.slice(i + 1) : l;
}

function feed(job: DockJob, chunk: string): DockJob {
  const parts = (job.partial + chunk.replace(ANSI, '')).split('\n');
  const partial = parts.pop() ?? '';
  const lines = [...job.lines, ...parts.map(cleanLine)].slice(-MAX_LINES);
  return { ...job, lines, partial };
}

function fromRecord(j: any): DockJob {
  return {
    id: j.id,
    name: j.name || 'Deploy',
    cmd: j.cmd,
    status: j.status || 'running',
    exitCode: j.exitCode,
    error: j.error,
    noCancel: j.noCancel,
    serverName: j.serverName,
    production: j.production,
    startedAt: j.startedAt || Date.now(),
    finishedAt: j.finishedAt,
    lines: [],
    partial: '',
  };
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

function statusLabel(job: DockJob) {
  if (job.status === 'running') return 'Running';
  if (job.status === 'cancelled') return 'Cancelled';
  if (job.status === 'error') return job.error ? `Failed: ${job.error}` : 'Failed';
  return job.exitCode === 0 || job.exitCode == null ? 'Finished' : `Exited with code ${job.exitCode}`;
}

function StatusIcon({ job }: { job: DockJob }) {
  if (job.status === 'running') return <Loader2 size={15} className="animate-spin text-accent shrink-0" />;
  if (job.status === 'cancelled') return <Ban size={15} className="text-text-muted shrink-0" />;
  if (job.status === 'error') return <XCircle size={15} className="text-error shrink-0" />;
  if (job.exitCode && job.exitCode !== 0) return <AlertTriangle size={15} className="text-warning shrink-0" />;
  return <CheckCircle2 size={15} className="text-success shrink-0" />;
}

function JobCard({
  job,
  now,
  expanded,
  onToggle,
  onDismiss,
  onCancel,
  onHover,
}: {
  job: DockJob;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onCancel: () => void;
  onHover: (over: boolean) => void;
}) {
  const logRef = useRef<HTMLPreElement>(null);
  const stickRef = useRef(true);
  const all = job.partial ? [...job.lines, cleanLine(job.partial)] : job.lines;
  const shown = expanded ? all : all.filter((l) => l.trim()).slice(-3);
  const running = job.status === 'running';

  // Follow new output unless the user has scrolled up to read.
  useEffect(() => {
    const el = logRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [job.lines, job.partial, expanded]);

  return (
    <div
      className="pointer-events-auto w-[min(400px,calc(100vw-2rem))] rounded-xl border border-border/40 bg-bg-secondary/95 shadow-lg backdrop-blur text-xs text-text-primary"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
        <StatusIcon job={job} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold truncate" title={job.cmd}>{job.name}</span>
            {job.production && <span className="shrink-0 px-1.5 py-px rounded-md bg-error/15 text-error text-[10px] font-semibold">Production</span>}
          </div>
          <div className="text-text-secondary truncate">
            {statusLabel(job)} · {elapsed((job.finishedAt ?? now) - job.startedAt)}
          </div>
          <span className="sr-only" aria-live="polite">{`${job.name}: ${statusLabel(job)}`}</span>
        </div>
        {running && !job.noCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md text-text-secondary hover:text-error hover:bg-bg-tertiary cursor-pointer"
            aria-label={`Cancel ${job.name}`}
            title="Cancel"
          >
            <Square size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer"
          aria-label={expanded ? 'Show less output' : 'Show more output'}
          aria-expanded={expanded}
          title={expanded ? 'Show less' : 'Show more'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {!running && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer"
            aria-label={`Dismiss ${job.name}`}
            title="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <pre
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className={`mx-3 mb-3 rounded-lg border border-border/20 bg-bg-primary/80 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap break-all select-text ${
          expanded ? 'max-h-72 overflow-auto' : 'overflow-hidden'
        }`}
      >
        {shown.length ? shown.join('\n') : running ? 'Waiting for output…' : '(no output)'}
      </pre>
    </div>
  );
}

export function DeployJobsDock() {
  const [jobs, setJobs] = useState<DockJob[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const hoveredRef = useRef<string | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const upsert = (id: string, fn: (j: DockJob | undefined) => DockJob | undefined) =>
    setJobs((prev) => {
      const i = prev.findIndex((j) => j.id === id);
      const next = fn(i >= 0 ? prev[i] : undefined);
      if (!next) return prev;
      if (i < 0) return [...prev, next];
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });

  useEffect(() => {
    const api = window.serverOperator;

    // Pick up jobs that were already running (for example after the window reloads).
    api?.deployList?.().then(async (r) => {
      const running = (r.ok ? r.jobs || [] : []).filter((j: any) => j.status === 'running');
      for (const rec of running) {
        upsert(rec.id, (j) => j ?? fromRecord(rec));
        const log = await api.deployReadLog?.({ jobId: rec.id, offset: 0, maxBytes: 200000 });
        if (log?.ok && log.content) upsert(rec.id, (j) => (j && !j.lines.length ? feed(j, log.content!) : j));
      }
    });

    const onStarted = (e: Event) => {
      const rec = (e as CustomEvent<any>).detail?.job;
      if (rec?.id) upsert(rec.id, (j) => j ?? fromRecord(rec));
    };
    const onLog = (e: Event) => {
      const d = (e as CustomEvent<any>).detail;
      if (d?.jobId && d.data) upsert(d.jobId, (j) => (j ? feed(j, String(d.data)) : j));
    };
    const onDone = (e: Event) => {
      const d = (e as CustomEvent<any>).detail;
      const rec = d?.job;
      if (!rec?.id) return;
      upsert(rec.id, (j) => ({
        ...(j ?? fromRecord(rec)),
        status: rec.status,
        exitCode: rec.exitCode,
        error: d.error || rec.error,
        finishedAt: rec.finishedAt || Date.now(),
      }));
    };
    // Clicking the system notification: bring the job back (it may have auto-hidden) and open its output.
    const onFocus = async (e: Event) => {
      const rec = (e as CustomEvent<any>).detail?.job;
      if (!rec?.id) return;
      upsert(rec.id, (j) => (j ? { ...j, status: rec.status, exitCode: rec.exitCode, error: rec.error, finishedAt: rec.finishedAt } : fromRecord(rec)));
      setExpanded((prev) => new Set(prev).add(rec.id));
      const log = await window.serverOperator?.deployReadLog?.({ jobId: rec.id, offset: 0, maxBytes: 200000 });
      if (log?.ok && log.content) upsert(rec.id, (j) => (j && !j.lines.length ? feed(j, log.content!) : j));
    };
    const events: [string, (e: Event) => void][] = [
      ['deploy:job-focus', onFocus],
      ['deploy:job-started', onStarted],
      ['deploy:job-log', onLog],
      ['deploy:job-finished', onDone],
      ['deploy:job-error', onDone],
      ['deploy:job-cancelled', onDone],
    ];
    events.forEach(([n, f]) => window.addEventListener(n, f));
    return () => events.forEach(([n, f]) => window.removeEventListener(n, f));
  }, []);

  // Tick the elapsed timers, and hide finished jobs after a while unless they are open or hovered.
  useEffect(() => {
    if (!jobs.length) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setJobs((prev) => {
        const keep = prev.filter(
          (j) =>
            j.status === 'running' ||
            expandedRef.current.has(j.id) ||
            hoveredRef.current === j.id ||
            n - (j.finishedAt ?? n) < AUTO_HIDE_MS,
        );
        return keep.length === prev.length ? prev : keep;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [jobs.length]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const cancel = async (job: DockJob) => {
    if (!(await confirmDialog(`Cancel "${job.name}"?\n\nStopping a deploy part-way can leave the server half updated.`, {
          title: 'Cancel deploy',
          confirmLabel: 'Cancel deploy',
          cancelLabel: 'Keep running',
          danger: true,
          // the job's own server, which may not be the one you are looking at now
          server: job.serverName ? { name: job.serverName, production: job.production } : null,
        }))) return;
    await window.serverOperator?.deployCancel?.({ jobId: job.id });
  };

  if (!jobs.length) return null;
  return (
    <>
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          now={now}
          expanded={expanded.has(job.id)}
          onToggle={() => toggle(job.id)}
          onDismiss={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
          onCancel={() => cancel(job)}
          onHover={(over) => (hoveredRef.current = over ? job.id : hoveredRef.current === job.id ? null : hoveredRef.current)}
        />
      ))}
    </>
  );
}

/** Ids of servers that have a deploy job running right now (for sidebar and tab indicators). */
export function useRunningDeployServers(): Set<string> {
  const [running, setRunning] = useState<Map<string, string>>(new Map()); // jobId -> serverId

  useEffect(() => {
    window.serverOperator?.deployList?.().then((r) => {
      if (!r.ok) return;
      const m = new Map<string, string>();
      (r.jobs || []).forEach((j: any) => j.status === 'running' && j.serverId && m.set(j.id, j.serverId));
      setRunning(m);
    });
    const onStart = (e: Event) => {
      const j = (e as CustomEvent<any>).detail?.job;
      if (j?.id && j.serverId) setRunning((prev) => new Map(prev).set(j.id, j.serverId));
    };
    const onEnd = (e: Event) => {
      const j = (e as CustomEvent<any>).detail?.job;
      if (j?.id) setRunning((prev) => {
        if (!prev.has(j.id)) return prev;
        const next = new Map(prev);
        next.delete(j.id);
        return next;
      });
    };
    const events: [string, (e: Event) => void][] = [
      ['deploy:job-started', onStart],
      ['deploy:job-finished', onEnd],
      ['deploy:job-error', onEnd],
      ['deploy:job-cancelled', onEnd],
    ];
    events.forEach(([n, f]) => window.addEventListener(n, f));
    return () => events.forEach(([n, f]) => window.removeEventListener(n, f));
  }, []);

  return new Set(running.values());
}
