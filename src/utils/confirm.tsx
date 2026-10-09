import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, and Cancel is focused first. Default true: most confirms here guard something destructive. */
  danger?: boolean;
  /** One-button notice instead of a question. */
  hideCancel?: boolean;
}

function ConfirmDialog({ message, opts, onClose }: { message: string; opts: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const danger = opts.danger ?? true;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // For risky actions the safe answer gets focus, so a stray Enter doesn't confirm.
    (danger && cancelRef.current ? cancelRef : okRef).current?.focus();
  }, [danger]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose(false);
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      e.preventDefault();
      (document.activeElement === cancelRef.current || !cancelRef.current ? okRef : cancelRef).current?.focus();
    }
  };

  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <div
      className="fixed inset-0 z-[1000000] flex items-start justify-center bg-black/50 p-4 pt-[18vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}
      onKeyDown={onKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-xl border border-border/50 popover-surface p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <Icon size={20} className={`shrink-0 mt-0.5 ${danger ? 'text-warning' : 'text-accent'}`} />
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-sm font-semibold text-text-primary">{opts.title ?? 'Are you sure?'}</h2>
            <p id="confirm-message" className="mt-1.5 text-xs leading-relaxed text-text-secondary whitespace-pre-line break-words">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {!opts.hideCancel && (
            <button
              ref={cancelRef}
              type="button"
              onClick={() => onClose(false)}
              className="px-3.5 py-1.5 rounded-lg border border-border/40 text-xs font-semibold text-text-primary hover:bg-bg-tertiary/60 transition-colors cursor-pointer"
            >
              {opts.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            onClick={() => onClose(true)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer ${
              danger ? 'bg-error hover:opacity-90' : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {opts.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** In-app replacement for window.confirm. Resolves true on confirm, false on cancel, Escape or a click outside. */
export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (ok: boolean) => {
      root.unmount();
      host.remove();
      resolve(ok);
    };
    root.render(<ConfirmDialog message={message} opts={opts} onClose={close} />);
  });
}

/** In-app replacement for window.alert. */
export function alertDialog(message: string, title = 'Heads up'): Promise<void> {
  return confirmDialog(message, { title, confirmLabel: 'OK', danger: false, hideCancel: true }).then(() => undefined);
}
