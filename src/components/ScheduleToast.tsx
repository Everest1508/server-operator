import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock, Loader2, OctagonX, Square, X, XCircle } from 'lucide-react';
import { dismissLiveSchedule, setLiveSchedule, useLiveSchedule } from '../utils/scheduleLive';
import { Button } from './ui/Button';

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Live toast for a scheduled job: countdown to its start, then its output as it runs, then the result. */
export function ScheduleToast() {
  const live = useLiveSchedule();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const outRef = useRef<HTMLPreElement>(null);
  const phase = live?.phase;

  useEffect(() => {
    if (phase !== 'countdown') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [live?.output]);

  // finished toasts close themselves after a while; running/countdown ones stay
  useEffect(() => {
    if (!live || live.phase === 'countdown' || live.phase === 'running') return;
    const id = live.rowId;
    const t = setTimeout(() => dismissLiveSchedule(id), 12000);
    return () => clearTimeout(t);
  }, [live?.rowId, live?.phase]);

  if (!live) return null;
  const left = live.runAt - now;
  const icon =
    live.phase === 'countdown' ? <Clock size={14} className="text-accent shrink-0 mt-0.5" />
    : live.phase === 'running' ? <Loader2 size={14} className="text-accent shrink-0 mt-0.5 animate-spin" />
    : live.phase === 'done' ? <CheckCircle2 size={14} className="text-success shrink-0 mt-0.5" />
    : live.phase === 'stopped' ? <OctagonX size={14} className="text-warning shrink-0 mt-0.5" />
    : <XCircle size={14} className="text-error shrink-0 mt-0.5" />;
  const title =
    live.phase === 'countdown' ? (left > 0 ? `Scheduled command starts in ${mmss(left)}` : 'Scheduled command starting…')
    : live.phase === 'running' ? 'Scheduled command running'
    : live.phase === 'done' ? 'Scheduled command finished'
    : live.phase === 'stopped' ? 'Scheduled command stopped'
    : `Scheduled command failed (exit ${live.code})`;

  const act = async () => {
    if (!live.act) return;
    setBusy(true);
    try { await live.act(); } finally { setBusy(false); }
    if (live.phase === 'running') setLiveSchedule({ ...live, phase: 'stopped' });
  };

  return createPortal(
    <div role="status" className="fixed top-12 right-4 z-[99999] w-[380px] max-w-[calc(100vw-2rem)] rounded-xl popover-surface border border-border/40 shadow-2xl p-3.5 font-sans">
      <div className="flex items-start gap-2.5">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text-primary">{title}</p>
          <p className="text-[11px] text-text-secondary mt-0.5 truncate" title={live.name}>{live.name}</p>
        </div>
        <button type="button" onClick={() => dismissLiveSchedule(live.rowId)} className="text-text-muted hover:text-text-primary cursor-pointer" aria-label="Dismiss">
          <X size={13} />
        </button>
      </div>
      {live.phase !== 'countdown' && (
        <pre ref={outRef} className="mt-2.5 max-h-44 overflow-auto rounded-lg bg-black/40 px-2.5 py-2 text-[11px] leading-snug font-mono text-text-secondary whitespace-pre-wrap break-words">
          {live.output || (live.phase === 'running' ? 'Waiting for output…' : '(no output)')}
        </pre>
      )}
      {live.act && (live.phase === 'countdown' || live.phase === 'running') && (
        <div className="mt-2.5 flex justify-end">
          <Button variant="outline" size="sm"
            disabled={busy}
            onClick={act}
          >
            {live.phase === 'running' ? <Square size={10} /> : <X size={10} />}
            {live.phase === 'running' ? 'Stop' : 'Cancel schedule'}
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}
