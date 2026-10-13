import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { FloatingMenu } from './FloatingMenu';
import {
  useNotifications,
  markAllNotificationsRead,
  clearNotifications,
  installDeployNotificationListeners,
  type AppNotification,
} from '../utils/notifications';

installDeployNotificationListeners();

function timeAgo(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const ICONS = {
  success: <CheckCircle2 size={14} className="text-success shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />,
  error: <XCircle size={14} className="text-error shrink-0 mt-0.5" />,
  info: <Info size={14} className="text-text-muted shrink-0 mt-0.5" />,
};

/** Bell in the title bar: a history of deploy results and connection problems, so nothing is missed. */
export function NotificationCenter() {
  const items = useNotifications();
  const [open, setOpen] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const anchorRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) {
      // remember which ones were new, so they stay highlighted while the panel is open
      setNewIds(new Set(items.filter((n) => !n.read).map((n) => n.id)));
      markAllNotificationsRead();
    }
    setOpen((o) => !o);
  };

  const activate = (n: AppNotification) => {
    if (n.job) window.dispatchEvent(new CustomEvent('deploy:job-focus', { detail: { job: n.job } }));
    setOpen(false);
  };

  return (
    <div ref={anchorRef} className="relative h-full flex items-center">
      <button
        type="button"
        onClick={toggle}
        className="relative p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors cursor-pointer"
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-error text-white text-[9px] font-bold leading-[15px] text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <FloatingMenu anchorRef={anchorRef} align="right" className="w-[340px] max-w-[calc(100vw-1rem)] rounded-xl border border-border/40 popover-surface shadow-2xl overflow-hidden">
          <div role="dialog" aria-label="Notifications">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/30">
              <span className="text-xs font-semibold text-text-primary">Notifications</span>
              {items.length > 0 && (
                <button type="button" onClick={() => clearNotifications()} className="text-[11px] text-text-muted hover:text-text-primary cursor-pointer">
                  Clear all
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-xs text-text-muted text-center">
                Nothing yet. Deploy results and connection problems show up here.
              </p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto py-1">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => activate(n)}
                      className={`w-full flex items-start gap-2.5 px-3.5 py-2 text-left hover:bg-bg-tertiary/50 transition-colors ${n.job ? 'cursor-pointer' : 'cursor-default'} ${newIds.has(n.id) ? 'bg-accent/8' : ''}`}
                      title={n.job ? 'Show the deploy output' : undefined}
                    >
                      {ICONS[n.kind]}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-text-primary truncate">{n.title}</span>
                          <span className="text-[10px] text-text-muted shrink-0">{timeAgo(n.at)}</span>
                        </span>
                        {n.message && <span className="block text-[11px] text-text-secondary mt-0.5 line-clamp-2 break-words">{n.message}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FloatingMenu>
      )}
    </div>
  );
}
