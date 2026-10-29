import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

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
const STEPS = ['fetch', 'apply', 'reopen'];
const mono = { fontFamily: 'var(--font-mono)' } as const;

interface Progress { percent: number; transferred: number; total: number }
const mb = (n: number) => Math.round(n / 1048576);

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
              animation: waiting ? `serop-tick 1.4s ${i * 25}ms infinite` : undefined,
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
  const waiting = running && percent === 0;
  const step = percent >= 100 ? 1 : 0;
  const failedAt = error ? Math.min(TICKS - 1, Math.floor((percent / 100) * TICKS)) : null;
  const note = error
    ? error
    : status
      ? status
      : running
      ? percent >= 100 ? 'Installing. Serop reopens by itself.'
        : waiting ? 'Connecting to GitHub' : progress!.total ? `${mb(progress!.transferred)} of ${mb(progress!.total)} MB` : 'Downloading'
      : info.canInstall ? 'About a minute. Your tabs stay open.' : 'Opens the release page in your browser.';

  const btn = 'flex-1 py-3 text-xs font-medium border-r border-border last:border-r-0 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors';
  const go = `${btn} !text-accent hover:!bg-accent hover:!text-white`;

  return (
    <div
      role="dialog"
      aria-label={`Update to ${info.version}`}
      className="relative w-[360px] max-w-[calc(100vw-2rem)] border border-border popover-surface text-text-primary shadow-2xl animate-slide-down"
      style={{ borderRadius: 4 }}
    >
      <span className="absolute -left-px top-4 bottom-4 w-[2px] bg-accent" />
      <div className="flex items-baseline justify-between pl-5 pr-4 pt-4">
        <p className="text-[13px]">
          Serop <span className="text-text-muted">→</span>{' '}
          <span className="font-semibold text-accent">{info.version}</span>
        </p>
        <span className="text-[10px] text-text-muted" style={mono}>{error ? 'failed' : running ? STEPS[step] : 'ready'}</span>
      </div>

      <div className="flex items-baseline gap-1.5 pl-5 pr-4 pt-3 pb-4">
        <span className="text-[44px] leading-none tracking-tighter tabular-nums min-w-[2.1ch]" style={{ ...mono, fontWeight: 300 }}>
          {progress ? String(percent).padStart(2, '0') : '--'}
        </span>
        <span className="text-[13px] text-text-muted" style={mono}>%</span>
        <span className="ml-auto text-right text-xs leading-snug text-text-secondary max-w-[190px]" aria-live="polite">{note}</span>
      </div>

      <Ruler percent={percent} waiting={waiting} failedAt={failedAt} />

      <div className="grid grid-cols-3 pl-5 pr-4 pt-2 pb-3">
        {STEPS.map((l, i) => (
          <span
            key={l}
            className="flex items-center gap-1.5 text-[9.5px]"
            style={{ ...mono, color: running && i <= step ? (i === step ? 'var(--color-text-primary)' : 'var(--color-accent)') : 'var(--color-text-muted)' }}
          >
            <i className="w-[5px] h-[5px] bg-current" style={running && i === step ? { outline: '1px solid var(--color-accent)', outlineOffset: 2 } : undefined} />
            {l}
          </span>
        ))}
      </div>

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
