import type { Terminal } from '@xterm/xterm';

/** Ctrl+Shift+C / Ctrl+Shift+V so copy/paste work in shells (Ctrl+C must stay as interrupt). */
export function attachXtermClipboardKeys(term: Terminal): void {
  term.attachCustomKeyEventHandler((domEvent: KeyboardEvent) => {
    if (domEvent.type !== 'keydown') return true;
    const key = domEvent.key?.toLowerCase();
    if (domEvent.ctrlKey && domEvent.shiftKey && key === 'c') {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      const text = term.getSelection();
      if (text) void navigator.clipboard.writeText(text);
      return false;
    }
    if ((domEvent.ctrlKey && domEvent.shiftKey && key === 'v') || (domEvent.ctrlKey && !domEvent.shiftKey && key === 'v')) {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      void navigator.clipboard.readText().then((pasted) => {
        if (pasted) term.paste(pasted);
      });
      return false;
    }
    return true;
  });
}
