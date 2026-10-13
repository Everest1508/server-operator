import { useEffect, useRef, useState, type ReactNode } from 'react';
import type * as Monaco from 'monaco-editor';
import { AlertTriangle, Check, WrapText, Map as MapIcon } from 'lucide-react';
import { FloatingMenu } from './FloatingMenu';
import { LANGUAGE_OPTIONS, CRLF_SENSITIVE, languageLabel } from '../utils/monacoSetup';

type Editor = Monaco.editor.IStandaloneCodeEditor;

interface Props {
  editor: Editor | null;
  monaco: typeof Monaco | null;
  /** Language in use (the override, or the detected one). */
  language: string;
  detectedLanguage: string;
  /** null goes back to the detected language. */
  onLanguageChange: (language: string | null) => void;
  overridden: boolean;
  wordWrap: boolean;
  minimap: boolean;
  onToggleWrap: () => void;
  onToggleMinimap: () => void;
}

const INDENT_CHOICES = [
  { insertSpaces: true, tabSize: 2, label: 'Spaces: 2' },
  { insertSpaces: true, tabSize: 4, label: 'Spaces: 4' },
  { insertSpaces: false, tabSize: 2, label: 'Tabs (width 2)' },
  { insertSpaces: false, tabSize: 4, label: 'Tabs (width 4)' },
  { insertSpaces: false, tabSize: 8, label: 'Tabs (width 8)' },
];

const itemClass =
  'flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-accent/10 hover:text-accent rounded-lg transition-colors cursor-pointer';
const segmentClass =
  'h-full flex items-center gap-1 px-2 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors cursor-pointer whitespace-nowrap';

/** A status bar item that opens a small menu above it. */
function StatusMenu({ label, title, children }: { label: ReactNode; title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
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
  return (
    <div ref={anchorRef} className="h-full">
      <button
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={segmentClass}
      >
        {label}
      </button>
      {open && (
        <FloatingMenu anchorRef={anchorRef} className="py-1.5 px-1 min-w-[180px] max-h-[60vh] overflow-y-auto rounded-xl border border-border/40 popover-surface shadow-2xl">
          <div role="menu">{children(() => setOpen(false))}</div>
        </FloatingMenu>
      )}
    </div>
  );
}

export function EditorStatusBar({
  editor,
  monaco,
  language,
  detectedLanguage,
  onLanguageChange,
  overridden,
  wordWrap,
  minimap,
  onToggleWrap,
  onToggleMinimap,
}: Props) {
  const [pos, setPos] = useState({ line: 1, col: 1, selected: 0, cursors: 1 });
  const [opts, setOpts] = useState({ crlf: false, insertSpaces: true, tabSize: 4 });

  // Follow the cursor and the file's indentation and line endings.
  useEffect(() => {
    if (!editor) return;
    const read = () => {
      const model = editor.getModel();
      if (!model) return;
      const p = editor.getPosition();
      const selections = editor.getSelections() ?? [];
      const selected = selections.reduce((n, s) => n + model.getValueLengthInRange(s), 0);
      setPos({ line: p?.lineNumber ?? 1, col: p?.column ?? 1, selected, cursors: selections.length || 1 });
      const o = model.getOptions();
      setOpts({ crlf: model.getEOL() === '\r\n', insertSpaces: o.insertSpaces, tabSize: o.tabSize });
    };
    read();
    const subs = [
      editor.onDidChangeCursorSelection(read),
      editor.onDidChangeModel(read),
      editor.onDidChangeModelOptions(read),
      editor.onDidChangeModelContent(read),
    ];
    return () => subs.forEach((s) => s.dispose());
  }, [editor]);

  const setEol = (crlf: boolean) => {
    const model = editor?.getModel();
    if (!model || !monaco) return;
    // pushEOL is an undoable edit, so the tab shows unsaved changes and Cmd/Ctrl+Z reverts it
    model.pushEOL(crlf ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
    editor?.focus();
  };

  const crlfRisk = opts.crlf && CRLF_SENSITIVE.has(language);
  const indentLabel = opts.insertSpaces ? `Spaces: ${opts.tabSize}` : `Tab size: ${opts.tabSize}`;

  return (
    <div
      className="h-6 shrink-0 flex items-stretch justify-between border-t border-border/30 bg-bg-secondary/40 select-none"
      role="status"
      aria-label="Editor status"
    >
      <div className="flex items-stretch min-w-0">
        <span className="flex items-center px-2.5 text-[11px] text-text-secondary whitespace-nowrap tabular-nums">
          Ln {pos.line}, Col {pos.col}
          {pos.selected > 0 && <span className="ml-1.5 text-text-muted">({pos.selected} selected)</span>}
          {pos.cursors > 1 && <span className="ml-1.5 text-text-muted">{pos.cursors} cursors</span>}
        </span>
        {crlfRisk && (
          <button
            type="button"
            onClick={() => setEol(false)}
            title="Windows (CRLF) line endings can break this file on a Linux server. Click to convert to LF."
            className="flex items-center gap-1 px-2 text-[11px] font-medium text-warning bg-warning/10 hover:bg-warning/20 transition-colors cursor-pointer whitespace-nowrap"
          >
            <AlertTriangle size={11} />
            CRLF can break this on Linux. Convert to LF
          </button>
        )}
      </div>

      <div className="flex items-stretch min-w-0">
        <StatusMenu label={indentLabel} title="Indentation">
          {(close) =>
            INDENT_CHOICES.map((c) => {
              const active = c.insertSpaces === opts.insertSpaces && c.tabSize === opts.tabSize;
              return (
                <button
                  key={c.label}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={itemClass}
                  onClick={() => {
                    editor?.getModel()?.updateOptions({ insertSpaces: c.insertSpaces, tabSize: c.tabSize });
                    close();
                    editor?.focus();
                  }}
                >
                  <Check size={12} className={active ? 'text-accent' : 'invisible'} />
                  {c.label}
                </button>
              );
            })
          }
        </StatusMenu>

        <StatusMenu label={opts.crlf ? 'CRLF' : 'LF'} title="Line endings">
          {(close) =>
            [
              { crlf: false, label: 'LF (Linux, macOS)' },
              { crlf: true, label: 'CRLF (Windows)' },
            ].map((e) => (
              <button
                key={e.label}
                type="button"
                role="menuitemradio"
                aria-checked={opts.crlf === e.crlf}
                className={itemClass}
                onClick={() => {
                  if (opts.crlf !== e.crlf) setEol(e.crlf);
                  close();
                }}
              >
                <Check size={12} className={opts.crlf === e.crlf ? 'text-accent' : 'invisible'} />
                {e.label}
              </button>
            ))
          }
        </StatusMenu>

        <StatusMenu label={languageLabel(language)} title="Language">
          {(close) => (
            <>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!overridden}
                className={itemClass}
                onClick={() => {
                  onLanguageChange(null);
                  close();
                }}
              >
                <Check size={12} className={!overridden ? 'text-accent' : 'invisible'} />
                Auto ({languageLabel(detectedLanguage)})
              </button>
              <div role="separator" className="h-px bg-border/40 my-1" />
              {LANGUAGE_OPTIONS.map((l) => {
                const active = overridden && l.value === language;
                return (
                  <button
                    key={l.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={itemClass}
                    onClick={() => {
                      onLanguageChange(l.value);
                      close();
                    }}
                  >
                    <Check size={12} className={active ? 'text-accent' : 'invisible'} />
                    {l.label}
                  </button>
                );
              })}
            </>
          )}
        </StatusMenu>

        <button
          type="button"
          onClick={onToggleWrap}
          aria-pressed={wordWrap}
          title={wordWrap ? 'Word wrap on' : 'Word wrap off'}
          className={`${segmentClass} ${wordWrap ? 'text-accent' : ''}`}
        >
          <WrapText size={12} />
          <span className="sr-only">Word wrap</span>
        </button>
        <button
          type="button"
          onClick={onToggleMinimap}
          aria-pressed={minimap}
          title={minimap ? 'Minimap on' : 'Minimap off'}
          className={`${segmentClass} ${minimap ? 'text-accent' : ''}`}
        >
          <MapIcon size={12} />
          <span className="sr-only">Minimap</span>
        </button>
      </div>
    </div>
  );
}
