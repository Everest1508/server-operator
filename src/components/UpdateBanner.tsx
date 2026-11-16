import { useState, useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle2, Download, PackageCheck, RotateCw, Check, TriangleAlert } from 'lucide-react';

/* ─── Types ────────────────────────────────────────────────────────────── */
interface UpdateInfo {
  version: string;
  releaseUrl: string;
  releaseNotes: string;
  canInstall?: boolean;
}

/* ─── Up-to-date toast ──────────────────────────────────────────────────── */
function UpToDateToast({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border border-success/20 popover-surface "
      style={{
        animation: 'slideDown 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <CheckCircle2 size={16} className="shrink-0 text-success" />
      <span className="text-xs font-semibold text-text-primary">
        You&apos;re up to date! Running latest release.
      </span>
      <button
        onClick={onClose}
        className="ml-2 shrink-0 p-1 rounded-lg hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-all"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/* ─── Main panel: a small rollout. Tick ruler fills as the download runs ── */
const TICKS = 36;
const STEPS = [
  { id: 'fetch', label: 'fetch', Icon: Download },
  { id: 'apply', label: 'apply', Icon: PackageCheck },
  { id: 'reopen', label: 'reopen', Icon: RotateCw },
] as const;
const mono = { fontFamily: 'var(--font-mono)' } as const;

interface Progress { percent: number; transferred: number; total: number }
const mb = (n: number) => Math.round(n / 1048576);
const fmtTime = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`);

/** Eases the shown percent toward the real one so the number counts up instead of jumping. */
function useTween(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 350);
      cur.current = from + (target - from) * (1 - Math.pow(1 - k, 3));
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return Math.round(v);
}

/** Speed over the last ~8s, time left and time spent. Needs a second of data before it guesses. */
function useStats(progress: Progress | null) {
  const samples = useRef<{ t: number; b: number }[]>([]);
  const start = useRef<number | null>(null);
  const [st, setSt] = useState<{ bps: number | null; left: number | null; elapsed: number }>({ bps: null, left: null, elapsed: 0 });
  useEffect(() => {
    if (!progress) {
      samples.current = [];
      start.current = null;
      setSt({ bps: null, left: null, elapsed: 0 });
      return;
    }
    const now = Date.now();
    if (start.current === null) start.current = now;
    if (progress.total > 0) {
      samples.current.push({ t: now, b: progress.transferred });
      samples.current = samples.current.filter((x) => now - x.t < 8000);
    }
    const first = samples.current[0];
    const last = samples.current[samples.current.length - 1];
    let bps: number | null = null;
    let left: number | null = null;
    if (first && last && last.t - first.t >= 1000 && last.b > first.b) {
      bps = (last.b - first.b) / ((last.t - first.t) / 1000);
      left = Math.max(0, Math.ceil((progress.total - progress.transferred) / bps));
    }
    setSt({ bps, left, elapsed: Math.round((now - start.current) / 1000) });
  }, [progress]);
  return st;
}

function Ruler({ percent, waiting, failedAt }: { percent: number; waiting: boolean; failedAt: number | null }) {
  const filled = Math.floor((percent / 100) * TICKS);
  return (
    <div className="flex items-end gap-[2px] h-6 px-5" aria-hidden>
      {Array.from({ length: TICKS }, (_, i) => {
        const on = i < filled;
        const head = i === filled && percent > 0 && percent < 100 && failedAt === null;
        const cut = failedAt !== null && i === failedAt;
        return (
          <i
            key={i}
            className="flex-1 transition-[background-color,height] duration-100"
            style={{
              height: head || cut ? 24 : i % 5 === 0 ? 16 : 10,
              background: cut ? 'var(--color-error)' : head ? 'var(--color-text-primary)' : on ? (failedAt !== null ? 'var(--color-error)' : 'var(--color-accent)') : 'var(--color-border)',
              boxShadow: head ? '0 0 8px var(--color-accent)' : undefined,
              animation: waiting ? `serop-tick 1.4s ${i * 25}ms infinite` : head ? 'serop-head 0.8s ease-in-out infinite alternate' : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

interface InnerProps {
  info: UpdateInfo;
  onDismiss: () => void;
  progress: Progress | null;
  setProgress: (p: Progress | null) => void;
  error: string;
  setError: (e: string) => void;
  status: string;
}

function UpdateBannerInner({ info, onDismiss, progress, setProgress, error, setError, status }: InnerProps) {
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const handleDownload = async () => {
    if (!info.canInstall) {
      window.serverOperator?.openReleasePage?.(info.releaseUrl);
      return;
    }
    setError('');
    setProgress({ percent: 0, transferred: 0, total: 0 });
    const r = await window.serverOperator?.installUpdate?.();
    if (r && !r.ok) setError(r.error || 'Update failed');
  };

  const running = progress !== null && !error;
  const percent = progress?.percent ?? 0;
  const shown = useTween(percent);
  const stats = useStats(progress);
  const waiting = running && percent === 0;
  const step = percent >= 100 ? 1 : 0;
  const failedAt = error ? Math.min(TICKS - 1, Math.floor((percent / 100) * TICKS)) : null;

  // What it is doing right now, in plain words
  const doing = error
    ? error
    : status
      ? status
      : running
        ? percent >= 100 ? 'Checking the download and installing it. Serop reopens by itself.'
          : waiting ? 'Contacting GitHub releases'
          : progress!.total ? `Downloading ${mb(progress!.transferred)} of ${mb(progress!.total)} MB` : 'Downloading the update'
        : info.canInstall ? 'Downloads, installs and reopens. Your tabs stay open.' : 'Opens the release page in your browser.';
  const ActiveIcon = error ? TriangleAlert : STEPS[step].Icon;
  const speed = stats.bps ? `${(stats.bps / 1048576).toFixed(1)} MB/s` : null;

  const btn = 'flex-1 py-3 text-xs font-medium border-r border-border last:border-r-0 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors';
  const go = `${btn} !text-accent hover:!bg-accent hover:!text-white`;

  return (
    <div
      role="dialog"
      aria-label={`Update to ${info.version}`}
      className="relative w-[380px] max-w-[calc(100vw-2rem)] border border-border popover-surface text-text-primary shadow-2xl animate-slide-down"
      style={{ borderRadius: 4 }}
    >
      <span className="absolute -left-px top-4 bottom-4 w-[2px] bg-accent" style={running ? { animation: 'serop-tick 1.6s infinite' } : undefined} />
      <div className="flex items-baseline justify-between pl-5 pr-4 pt-4">
        <p className="text-[13px]">
          Serop <span className="text-text-muted">→</span>{' '}
          <span className="font-semibold text-accent">{info.version}</span>
        </p>
        <span className="text-[10px] text-text-muted" style={mono}>{error ? 'failed' : running ? STEPS[step].label : 'ready'}</span>
      </div>

      <div className="flex items-baseline gap-1.5 pl-5 pr-4 pt-3">
        <span className="text-[44px] leading-none tracking-tighter tabular-nums min-w-[2.1ch]" style={{ ...mono, fontWeight: 300 }}>
          {progress ? String(shown).padStart(2, '0') : '--'}
        </span>
        <span className="text-[13px] text-text-muted" style={mono}>%</span>
        <span className="ml-auto text-right text-[11px] leading-snug text-text-secondary" style={mono} aria-live="polite">
          {running && stats.left !== null ? (
            <>
              <span className="block text-[15px] text-text-primary">{fmtTime(stats.left)} left</span>
              <span className="block text-text-muted">{speed}</span>
            </>
          ) : running ? (
            <span className="block text-text-muted">estimating time…</span>
          ) : !error && info.canInstall ? (
            <span className="block text-text-muted">about 1 min total</span>
          ) : null}
        </span>
      </div>

      <div className="flex items-start gap-2 pl-5 pr-4 pt-3 pb-4 min-h-[44px]" aria-live="polite">
        <ActiveIcon
          size={14}
          className={`shrink-0 mt-px ${error ? 'text-error' : 'text-accent'}`}
          style={running ? { animation: step === 0 ? 'serop-bob 1s ease-in-out infinite' : 'serop-spin 1.2s linear infinite' } : undefined}
        />
        <span className={`text-xs leading-snug ${error ? 'text-error' : 'text-text-secondary'}`}>{doing}</span>
      </div>

      <Ruler percent={percent} waiting={waiting} failedAt={failedAt} />

      <div className="flex items-center pl-5 pr-4 pt-3 pb-3">
        {STEPS.map(({ id, label, Icon }, i) => {
          const done = running && i < step;
          const active = running && i === step;
          return (
            <div key={id} className="flex items-center flex-1 last:flex-none">
              <span
                className="flex items-center gap-1.5 text-[9.5px]"
                style={{ ...mono, color: done ? 'var(--color-accent)' : active ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
              >
                <span
                  className="grid place-items-center w-[18px] h-[18px] border"
                  style={{ borderColor: done || active ? 'var(--color-accent)' : 'var(--color-border)', background: done ? 'var(--color-accent)' : undefined, color: done ? 'var(--color-bg-primary)' : undefined, borderRadius: 2 }}
                >
                  {done ? <Check size={11} strokeWidth={3} /> : <Icon size={11} />}
                </span>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="flex-1 h-px mx-2.5 relative overflow-hidden bg-border">
                  {(done || (active && i === step)) && (
                    <i className="absolute inset-0 bg-accent" style={{ transformOrigin: 'left', animation: done ? undefined : 'serop-tick 1.2s infinite' }} />
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {running && stats.elapsed > 0 && (
        <p className="pl-5 pr-4 pb-3 text-[10px] text-text-muted" style={mono}>
          {stats.left !== null ? `total ≈ ${fmtTime(stats.elapsed + stats.left)} · ` : ''}elapsed {fmtTime(stats.elapsed)}
        </p>
      )}

      <div className="flex border-t border-border">
        {!running && info.releaseNotes && (
          <button onClick={() => setNotesOpen((o) => !o)} className={btn}>Changelog</button>
        )}
        <button onClick={onDismiss} className={btn}>{running ? 'Hide' : 'Later'}</button>
        {!running && (
          <button onClick={handleDownload} className={go}>
            {error ? 'Retry' : info.canInstall ? 'Update now' : 'Download'}
          </button>
        )}
      </div>

      {notesOpen && info.releaseNotes && (
        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto p-3 border-t border-border text-text-secondary scrollbar-vs" style={mono}>
          {info.releaseNotes}
        </pre>
      )}
    </div>
  );
}

/* ─── Exported component (renders nothing until an event arrives) ─────── */
export function UpdateBanner() {
  const [updateInfo, setUpdateInfo]       = useState<UpdateInfo | null>(null);
  const [showUpToDate, setShowUpToDate]   = useState(false);
  const [dismissed, setDismissed]         = useState(false);
  const [progress, setProgress]           = useState<Progress | null>(null);
  const [error, setError]                 = useState('');
  const [status, setStatus]               = useState('');

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    const onUpdateAvailable = (e: Event) => {
      const info = (e as CustomEvent<UpdateInfo>).detail;
      console.log('[Update Banner] Received update-available event with info:', info);
      if (!info?.version) return;
      // Same version re-announced by a periodic check: keep it dismissed (pill stays)
      setUpdateInfo((prev) => {
        if (prev?.version !== info.version) setDismissed(false);
        return info;
      });
    };

    const onCheckResult = (e: Event) => {
      const result = (e as CustomEvent<{ ok: boolean; upToDate?: boolean }>).detail;
      console.log('[Update Banner] Received update-check-result event:', result);
      if (result?.upToDate) {
        setShowUpToDate(true);
      }
    };

    const onProgress = (e: Event) => {
      const d = (e as CustomEvent<Progress | number>).detail;
      setProgress(typeof d === 'number' ? { percent: d, transferred: 0, total: 0 } : d);
      setStatus('');
    };
    const onStatus = (e: Event) => setStatus((e as CustomEvent<string>).detail || '');

    window.addEventListener('update-progress', onProgress);
    window.addEventListener('update-status', onStatus);
    window.addEventListener('update-available', onUpdateAvailable);
    window.addEventListener('update-check-result', onCheckResult);
    return () => {
      window.removeEventListener('update-progress', onProgress);
      window.removeEventListener('update-status', onStatus);
      window.removeEventListener('update-available', onUpdateAvailable);
      window.removeEventListener('update-check-result', onCheckResult);
    };
  }, []);

  if (!updateInfo && !showUpToDate) return null;

  const modal = !!updateInfo && !dismissed;
  const running = progress !== null && !error;

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes serop-tick { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes serop-head { from { transform: scaleY(0.75); } to { transform: scaleY(1); } }
        @keyframes serop-bob { 0%,100% { transform: translateY(-2px); } 50% { transform: translateY(2px); } }
        @keyframes serop-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { [aria-label^='Update to'] * { animation: none !important; } }
      `}</style>

      {modal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45" onMouseDown={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}>
          <UpdateBannerInner
            info={updateInfo}
            onDismiss={handleDismiss}
            progress={progress}
            setProgress={setProgress}
            error={error}
            setError={setError}
            status={status}
          />
        </div>
      )}

      <div className="fixed top-12 right-4 z-[9999] pointer-events-auto flex flex-col items-end gap-2">
        {showUpToDate && !updateInfo && <UpToDateToast onClose={() => setShowUpToDate(false)} />}
        {updateInfo && dismissed && (
          <button
            onClick={() => setDismissed(false)}
            className="flex items-center gap-2.5 px-3 py-1.5 text-[11px] border-b border-accent/50 popover-surface text-text-primary"
            style={{ fontFamily: 'var(--font-mono)', borderRadius: 2 }}
            title="Show update"
          >
            {running ? `updating ${progress!.percent}%` : `${updateInfo.version} available`}
            {running && (
              <span className="relative w-10 h-[2px] bg-border">
                <i className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${progress!.percent}%` }} />
              </span>
            )}
          </button>
        )}
      </div>
    </>
  );
}
