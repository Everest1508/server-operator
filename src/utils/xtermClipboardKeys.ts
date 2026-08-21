import type { Terminal } from '@xterm/xterm';

/**
 * Ctrl+Shift+C / Ctrl+Shift+V so copy/paste work in shells (Ctrl+C must stay as interrupt),
 * plus Cmd+C / Cmd+V on macOS, where Cmd never collides with a shell control sequence.
 */
export function attachXtermClipboardKeys(term: Terminal): void {
  term.attachCustomKeyEventHandler((domEvent: KeyboardEvent) => {
    if (domEvent.type !== 'keydown') return true;
    const key = domEvent.key?.toLowerCase();
    const isCopyChord = (domEvent.ctrlKey && domEvent.shiftKey && key === 'c') || (domEvent.metaKey && key === 'c');
    if (isCopyChord) {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      const text = term.getSelection();
      if (text) void navigator.clipboard.writeText(text);
      return false;
    }
    const isPasteChord =
      (domEvent.ctrlKey && domEvent.shiftKey && key === 'v') ||
      (domEvent.ctrlKey && !domEvent.shiftKey && key === 'v') ||
      (domEvent.metaKey && key === 'v');
    if (isPasteChord) {
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
