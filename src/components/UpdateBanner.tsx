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
      className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border border-success/20 bg-bg-secondary/95 backdrop-blur-md"
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
    <div className="flex flex-col w-full rounded-2xl shadow-2xl border border-border/40 bg-bg-secondary/95 backdrop-blur-md overflow-hidden font-sans p-1 animate-slide-down">
      {/* Main row */}
      <div className="flex items-start gap-2.5 p-3">
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-accent/10 text-accent border border-accent/20 shadow-sm">
          <Sparkles size={14} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-normal text-text-primary">
            Update Available:{' '}
            <span className="font-bold text-accent">{info.version}</span>
          </p>
          <p className="text-[10px] mt-0.5 leading-normal text-text-secondary">
            A new release has been published to GitHub.
          </p>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-lg hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-all"
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border/30 bg-bg-secondary/40 rounded-xl mt-1">
        {info.releaseNotes && (
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className="flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
          >
            Changelog
            {notesOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-100 bg-accent hover:bg-accent-hover text-white shadow-md shadow-accent/15"
        >
          <Download size={11} />
          Download
        </button>
      </div>

      {/* Expandable release notes */}
      {notesOpen && info.releaseNotes && (
        <div
          className="px-3 pb-3 border-t border-border/20 bg-black/10"
        >
          <pre className="text-[9px] leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto rounded-lg p-2 mt-2 border border-border/30 bg-bg-primary/60 text-text-primary font-mono scrollbar-vs">
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
      console.log('[Update Banner] Received update-available event with info:', info);
      if (!info?.version) return;
      // Don't re-show a version the user already dismissed
      const dismissedVer = getDismissedVersion();
      console.log(`[Update Banner] Dismissed version currently in storage: "${dismissedVer}"`);
      if (dismissedVer === info.version) {
        console.log('[Update Banner] Version is dismissed. Suppressing banner.');
        return;
      }
      setDismissed(false);
      setUpdateInfo(info);
    };

    const onCheckResult = (e: Event) => {
      const result = (e as CustomEvent<{ ok: boolean; upToDate?: boolean }>).detail;
      console.log('[Update Banner] Received update-check-result event:', result);
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
        className="fixed top-12 right-4 z-[9999] w-[280px] max-w-[calc(100vw-2rem)] pointer-events-auto"
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
