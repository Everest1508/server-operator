import { useState, useEffect, useCallback } from 'react';
import { X, Download, ChevronDown, ChevronUp, Sparkles, CheckCircle2 } from 'lucide-react';

/* ─── Types ────────────────────────────────────────────────────────────── */
interface UpdateInfo {
  version: string;
  releaseUrl: string;
  releaseNotes: string;
}

/* ─── localStorage keys ─────────────────────────────────────────────────── */
const DISMISSED_KEY = 'server-operator:update-dismissed';

function getDismissedVersion(): string | null {
  try { return localStorage.getItem(DISMISSED_KEY); } catch { return null; }
}
function setDismissedVersion(version: string) {
  try { localStorage.setItem(DISMISSED_KEY, version); } catch { /* ignore */ }
}

/* ─── Up-to-date toast ──────────────────────────────────────────────────── */
function UpToDateToast({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border"
      style={{
        background: 'linear-gradient(135deg, rgba(16,24,32,0.97) 0%, rgba(20,30,40,0.97) 100%)',
        borderColor: 'rgba(52,211,153,0.25)',
        backdropFilter: 'blur(12px)',
        animation: 'slideDown 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <CheckCircle2 size={18} className="shrink-0" style={{ color: '#34d399' }} />
      <span className="text-sm font-medium" style={{ color: '#e2e8f0' }}>
        You&apos;re up to date! Running the latest version.
      </span>
      <button
        onClick={onClose}
        className="ml-2 shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
        style={{ color: '#94a3b8' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ─── Main banner ───────────────────────────────────────────────────────── */
function UpdateBannerInner({
  info,
  onDismiss,
}: {
  info: UpdateInfo;
  onDismiss: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  const handleDownload = () => {
    window.serverOperator?.openReleasePage?.(info.releaseUrl);
  };

  const handleDismiss = () => {
    setDismissedVersion(info.version);
    onDismiss();
  };

  return (
    <div
      className="flex flex-col w-full rounded-xl shadow-2xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(16,24,40,0.97) 0%, rgba(20,28,48,0.97) 100%)',
        borderColor: 'rgba(99,102,241,0.35)',
        backdropFilter: 'blur(14px)',
        animation: 'slideDown 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {/* Accent glow strip */}
      <div
        className="h-[2px] w-full shrink-0"
        style={{ background: 'linear-gradient(90deg, #6366f1 0%, #818cf8 50%, #a5b4fc 100%)' }}
      />

      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
        >
          <Sparkles size={16} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
            New version{' '}
            <span style={{ color: '#a5b4fc' }}>{info.version}</span>{' '}
            is available
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
            Update Server Operator to get the latest features and fixes.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {info.releaseNotes && (
            <button
              onClick={() => setNotesOpen((o) => !o)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}
              title="What's new"
            >
              What&apos;s new
              {notesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
              color: '#fff',
              boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
            }}
          >
            <Download size={13} />
            Download
          </button>

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: '#64748b' }}
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Expandable release notes */}
      {notesOpen && info.releaseNotes && (
        <div
          className="px-4 pb-3 border-t"
          style={{ borderColor: 'rgba(99,102,241,0.15)' }}
        >
          <p className="text-xs font-semibold mt-2 mb-1.5" style={{ color: '#94a3b8' }}>
            Release Notes
          </p>
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto rounded-lg p-3"
            style={{
              color: '#cbd5e1',
              background: 'rgba(0,0,0,0.25)',
              fontFamily: 'inherit',
            }}
          >
            {info.releaseNotes}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─── Exported component (renders nothing until an event arrives) ─────── */
export function UpdateBanner() {
  const [updateInfo, setUpdateInfo]       = useState<UpdateInfo | null>(null);
  const [showUpToDate, setShowUpToDate]   = useState(false);
  const [dismissed, setDismissed]         = useState(false);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setUpdateInfo(null);
  }, []);

  useEffect(() => {
    const onUpdateAvailable = (e: Event) => {
      const info = (e as CustomEvent<UpdateInfo>).detail;
      if (!info?.version) return;
      // Don't re-show a version the user already dismissed
      if (getDismissedVersion() === info.version) return;
      setDismissed(false);
      setUpdateInfo(info);
    };

    const onCheckResult = (e: Event) => {
      const result = (e as CustomEvent<{ ok: boolean; upToDate?: boolean }>).detail;
      if (result?.upToDate) {
        setShowUpToDate(true);
      }
    };

    window.addEventListener('update-available', onUpdateAvailable);
    window.addEventListener('update-check-result', onCheckResult);
    return () => {
      window.removeEventListener('update-available', onUpdateAvailable);
      window.removeEventListener('update-check-result', onCheckResult);
    };
  }, []);

  if (!updateInfo && !showUpToDate) return null;

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>

      <div
        className="fixed top-12 right-4 z-[9999] w-[420px] max-w-[calc(100vw-2rem)] pointer-events-auto"
        style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))' }}
      >
        {showUpToDate && !updateInfo && (
          <UpToDateToast onClose={() => setShowUpToDate(false)} />
        )}
        {updateInfo && !dismissed && (
          <UpdateBannerInner info={updateInfo} onDismiss={handleDismiss} />
        )}
      </div>
    </>
  );
}
