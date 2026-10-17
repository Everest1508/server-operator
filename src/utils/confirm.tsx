import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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
  const [typed, setTyped] = useState('');
  const matches = !typeToConfirm || typed === typeToConfirm;
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(false); }}>
      <DialogContent
        role="alertdialog"
        overlayClassName="z-[1000000]"
        className={`z-[1000000] max-w-md ${typeToConfirm ? 'border-error/60' : ''}`}
        onOpenAutoFocus={(e) => {
          // For risky actions the safe answer gets focus, so a stray Enter doesn't confirm.
          e.preventDefault();
          const root = e.currentTarget as HTMLElement;
          const target = typeToConfirm
            ? root.querySelector<HTMLElement>('input')
            : root.querySelector<HTMLElement>(danger && !opts.hideCancel ? '[data-cancel]' : '[data-ok]');
          target?.focus();
        }}
      >
        <div className="flex items-start gap-3">
          <Icon size={20} className={`shrink-0 mt-0.5 ${typeToConfirm ? 'text-error' : danger ? 'text-warning' : 'text-accent'}`} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
              {opts.title ?? 'Are you sure?'}
              {typeToConfirm && (
                <span className="px-1.5 py-0.5 rounded-md bg-error/15 text-error text-[10px] font-semibold">Production</span>
              )}
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-xs leading-relaxed whitespace-pre-line break-words">{message}</DialogDescription>
            {typeToConfirm && (
              <label className="block mt-4 text-[11px] text-text-secondary">
                This is a production server. Type <span className="font-mono font-semibold text-text-primary">{typeToConfirm}</span> to continue.
                <Input
                  size="sm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches) onClose(true);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1.5 font-mono"
                />
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          {!opts.hideCancel && (
            <Button data-cancel variant="outline" onClick={() => onClose(false)}>
              {opts.cancelLabel ?? 'Cancel'}
            </Button>
          )}
          <Button data-ok variant={danger ? 'destructive' : 'primary'} disabled={!matches} onClick={() => matches && onClose(true)}>
            {opts.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
