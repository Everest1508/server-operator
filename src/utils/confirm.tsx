import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, HelpCircle } from 'lucide-react';

/** The server an action runs against. Only its name and production flag matter here. */
export interface ConfirmServer {
  name: string;
  production?: boolean;
}

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, and Cancel is focused first. Default true: most confirms here guard something destructive. */
  danger?: boolean;
  /** One-button notice instead of a question. */
  hideCancel?: boolean;
  /**
   * The server this action targets. Defaults to the active server (set by App), so every risky confirm on a
   * production server asks you to type its name. Pass null for actions that do not touch a server.
   */
  server?: ConfirmServer | null;
}

let activeServer: ConfirmServer | null = null;

/** Called by App whenever the active server (or its production flag) changes. */
export function setConfirmServer(server: ConfirmServer | null) {
  activeServer = server;
}

function ConfirmDialog({
  message,
  opts,
  typeToConfirm,
  onClose,
}: {
  message: string;
  opts: ConfirmOptions;
  typeToConfirm?: string;
  onClose: (ok: boolean) => void;
}) {
  const danger = opts.danger ?? true;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const matches = !typeToConfirm || typed === typeToConfirm;

  useEffect(() => {
    // For risky actions the safe answer gets focus, so a stray Enter doesn't confirm.
    if (typeToConfirm) inputRef.current?.focus();
    else (danger && cancelRef.current ? cancelRef : okRef).current?.focus();
  }, [danger, typeToConfirm]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose(false);
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      e.preventDefault();
      const order = [inputRef.current, cancelRef.current, matches ? okRef.current : null].filter(Boolean) as HTMLElement[];
      const i = order.indexOf(document.activeElement as HTMLElement);
      order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
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
        className={`w-full max-w-md rounded-xl border popover-surface p-5 shadow-2xl ${typeToConfirm ? 'border-error/60' : 'border-border/50'}`}
      >
        <div className="flex items-start gap-3">
          <Icon size={20} className={`shrink-0 mt-0.5 ${typeToConfirm ? 'text-error' : danger ? 'text-warning' : 'text-accent'}`} />
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-sm font-semibold text-text-primary flex items-center gap-2 flex-wrap">
              {opts.title ?? 'Are you sure?'}
              {typeToConfirm && (
                <span className="px-1.5 py-0.5 rounded-md bg-error/15 text-error text-[10px] font-semibold">Production</span>
              )}
            </h2>
            <p id="confirm-message" className="mt-1.5 text-xs leading-relaxed text-text-secondary whitespace-pre-line break-words">{message}</p>
            {typeToConfirm && (
              <label className="block mt-4 text-[11px] text-text-secondary">
                This is a production server. Type <span className="font-mono font-semibold text-text-primary">{typeToConfirm}</span> to continue.
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches) onClose(true);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1.5 w-full rounded-lg border border-border/40 bg-bg-primary/60 px-2.5 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-error/60 focus:ring-1 focus:ring-error/30"
                />
              </label>
            )}
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
            disabled={!matches}
            onClick={() => matches && onClose(true)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
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
  const target = opts.server === undefined ? activeServer : opts.server;
  const risky = (opts.danger ?? true) && !opts.hideCancel;
  const typeToConfirm = risky && target?.production ? target.name : undefined;
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (ok: boolean) => {
      root.unmount();
      host.remove();
      resolve(ok);
    };
    root.render(<ConfirmDialog message={message} opts={opts} typeToConfirm={typeToConfirm} onClose={close} />);
  });
}

/** In-app replacement for window.alert. */
export function alertDialog(message: string, title = 'Heads up'): Promise<void> {
  return confirmDialog(message, { title, confirmLabel: 'OK', danger: false, hideCancel: true, server: null }).then(() => undefined);
}
