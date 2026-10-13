import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { cssVar } from '../hooks/useAppTheme';
import { handleXtermClipboardKey } from './xtermClipboardKeys';
import { toHex, luminance } from './monacoSetup';

// Nerd Font names come after the regular fonts: the browser only falls back to them for glyphs the regular font
// lacks, so `eza --icons`, `lsd` and powerline prompts show their icons when a Nerd Font is installed.
export const TERMINAL_FONT =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "JetBrainsMono Nerd Font", "MesloLGS NF", "Hack Nerd Font", "FiraCode Nerd Font", "Symbols Nerd Font Mono", monospace';

const DARK_ANSI = {
  black: '#3b4048', red: '#ff6b6b', green: '#7ee787', yellow: '#f2cc60',
  blue: '#6cb6ff', magenta: '#d2a8ff', cyan: '#56d4dd', white: '#c9d1d9',
  brightBlack: '#6e7681', brightRed: '#ff8f8f', brightGreen: '#a5f3a0', brightYellow: '#ffdf80',
  brightBlue: '#9ccfff', brightMagenta: '#e2c5ff', brightCyan: '#86e9f0', brightWhite: '#ffffff',
};

const LIGHT_ANSI = {
  black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#9a6700',
  blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
  brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#7d4e00',
  brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
};

/** Terminal colours from the app theme: background, text and cursor from the theme, plus a full ANSI palette. */
export function xtermThemeFromApp(): ITheme {
  const bg = cssVar('--color-bg-primary', '#1e1e1e');
  const text = cssVar('--color-text-primary', '#cccccc');
  const accent = toHex(cssVar('--color-accent', '#0078d4'), '#0078d4').slice(0, 7);
  const light = luminance(toHex(text, '#cccccc').slice(0, 7)) < 0.5;
  return {
    background: bg,
    foreground: text,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: accent + '55',
    ...(light ? LIGHT_ANSI : DARK_ANSI),
  };
}

export interface TerminalHandle {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  dispose: () => void;
}

/**
 * Create an xterm with fit, search and clickable links, opened in `container` and kept fitted to it.
 * `onResize` gets the new size so the remote shell can be told; `onFindShortcut` fires on Cmd/Ctrl+F.
 */
export function createTerminal(
  container: HTMLElement,
  opts: {
    theme: ITheme;
    onData: (data: string) => void;
    onResize?: (cols: number, rows: number) => void;
    onFindShortcut?: () => void;
  },
): TerminalHandle {
  const term = new Terminal({
    theme: opts.theme,
    fontSize: 13,
    fontFamily: TERMINAL_FONT,
    allowProposedApi: true, // the search add-on's match decorations need it
    scrollback: 5000,
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault();
      void window.serverOperator?.openUrl?.(uri);
    }),
  );
  // xterm takes one custom key handler: Cmd/Ctrl+F for search, then the copy/paste keys.
  term.attachCustomKeyEventHandler((e) => {
    if (opts.onFindShortcut && e.type === 'keydown' && (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      opts.onFindShortcut();
      return false;
    }
    return handleXtermClipboardKey(term, e);
  });
  term.open(container);
  term.onData(opts.onData);
  if (opts.onResize) term.onResize(({ cols, rows }) => opts.onResize?.(cols, rows));
  fit.fit();

  let raf: number | null = null;
  const ro = new ResizeObserver(() => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      // a hidden tab has no size; fitting it would shrink the shell to nothing
      if (container.offsetWidth > 0 && container.offsetHeight > 0) fit.fit();
    });
  });
  ro.observe(container);

  return {
    term,
    fit,
    search,
    dispose: () => {
      ro.disconnect();
      term.dispose();
    },
  };
}
