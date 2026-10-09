import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Save, RotateCcw, Download } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  CustomTheme, ThemeColorKey, THEME_COLOR_VARS, parseThemeJson, addCustomTheme, slugify, isValidColor, applyTheme,
} from '../utils/customThemes';

const GROUPS: { title: string; keys: { key: ThemeColorKey; label: string; hint: string }[] }[] = [
  {
    title: 'Backgrounds',
    keys: [
      { key: 'bgPrimary', label: 'Main background', hint: 'Editor and page area' },
      { key: 'bgSecondary', label: 'Panels', hint: 'Cards, sidebars, title bar' },
      { key: 'bgTertiary', label: 'Raised surfaces', hint: 'Hover states, tabs, buttons' },
      { key: 'bgActivity', label: 'Activity bar', hint: 'Left icon strip' },
      { key: 'inputBg', label: 'Inputs', hint: 'Text fields' },
    ],
  },
  {
    title: 'Text & borders',
    keys: [
      { key: 'textPrimary', label: 'Text', hint: 'Main text' },
      { key: 'textSecondary', label: 'Secondary text', hint: 'Descriptions' },
      { key: 'textMuted', label: 'Muted text', hint: 'Placeholders, hints' },
      { key: 'border', label: 'Borders', hint: 'Dividers and outlines' },
    ],
  },
  {
    title: 'Accent & status',
    keys: [
      { key: 'accent', label: 'Accent', hint: 'Buttons, switches, selection' },
      { key: 'accentHover', label: 'Accent hover', hint: 'Accent when hovered' },
      { key: 'success', label: 'Success', hint: 'OK / connected' },
      { key: 'warning', label: 'Warning', hint: 'Caution' },
      { key: 'error', label: 'Error', hint: 'Failures, delete' },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap((g) => g.keys.map((k) => k.key));

let ctx: CanvasRenderingContext2D | null = null;
/** Normalises any CSS color to canvas form: "#rrggbb" or "rgba(r, g, b, a)". */
function normalise(color: string): string {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return '#000000';
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  return ctx.fillStyle as string;
}
function toHex(color: string): string {
  const n = normalise(color);
  if (n.startsWith('#')) return n.slice(0, 7);
  const m = n.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}
function alphaOf(color: string): number {
  const m = normalise(color).match(/rgba\(.*,\s*([\d.]+)\)/);
  return m ? parseFloat(m[1]) : 1;
}
/** Applies a picked hex while keeping the transparency of the old value. */
function withHex(old: string, hex: string): string {
  const a = alphaOf(old);
  if (a >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function readCurrentColors(): Record<ThemeColorKey, string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<ThemeColorKey, string>;
  for (const k of ALL_KEYS) out[k] = cs.getPropertyValue(THEME_COLOR_VARS[k]).trim() || '#1e1e1e';
  return out;
}

interface Props {
  /** Theme being edited, or null to start a new one from the look currently on screen. */
  initial: CustomTheme | null;
  /** Theme choice to restore if the user cancels. */
  restoreChoice: string;
  onClose: () => void;
  onSaved: (theme: CustomTheme) => void;
}

export function ThemeEditor({ initial, restoreChoice, onClose, onSaved }: Props) {
  const startColors = useRef<Record<ThemeColorKey, string>>(
    initial ? ({ ...readCurrentColors(), ...initial.colors } as Record<ThemeColorKey, string>) : readCurrentColors(),
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [base, setBase] = useState<'dark' | 'light'>(initial?.base ?? (document.documentElement.dataset.appTheme === 'light' ? 'light' : 'dark'));
  const [colors, setColors] = useState<Record<ThemeColorKey, string>>(startColors.current);
  const [error, setError] = useState<string | null>(null);

  // Live preview: the whole app recolours as you edit.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.appTheme = base === 'light' ? 'light' : 'default';
    root.dataset.customTheme = '__editing__';
    for (const k of ALL_KEYS) {
      if (isValidColor(colors[k])) root.style.setProperty(THEME_COLOR_VARS[k], colors[k]);
    }
  }, [colors, base]);

  const close = () => {
    applyTheme(restoreChoice);
    onClose();
  };

  const draft = useMemo(
    () => ({ name: name.trim(), description: description.trim(), base, colors }),
    [name, description, base, colors],
  );

  const save = () => {
    const id = initial?.id ?? slugify(draft.name);
    const parsed = parseThemeJson(JSON.stringify({ ...draft, id }));
    if (!parsed.ok) return setError(parsed.error);
    const added = addCustomTheme(parsed.theme);
    if (!added.ok) return setError(added.error);
    onSaved(parsed.theme);
  };

  const exportJson = () => {
    const json = JSON.stringify({ name: draft.name || 'My Theme', description: draft.description, base, colors }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(draft.name) || 'serop-theme'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    createPortal(<div className="fixed top-10 right-0 bottom-0 w-[380px] max-w-full z-50 flex flex-col bg-bg-secondary border-l border-border shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div>
          <h3 className="text-sm font-bold text-text-primary">{initial ? 'Edit theme' : 'Create theme'}</h3>
          <p className="text-[11px] text-text-secondary">Changes show live across the app.</p>
        </div>
        <button onClick={close} title="Cancel" className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="space-y-2.5">
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="Theme name"
            className="w-full px-3 py-2 rounded-lg bg-bg-primary/50 border border-border/40 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <input
            value={description}
            maxLength={120}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="w-full px-3 py-2 rounded-lg bg-bg-primary/50 border border-border/40 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <div className="flex rounded-lg border border-border/40 overflow-hidden text-[11px] font-semibold">
            {(['dark', 'light'] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBase(b)}
                className={`flex-1 py-1.5 capitalize ${base === b ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
              >
                {b} base
              </button>
            ))}
          </div>
        </div>

        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-xs font-semibold text-text-secondary mb-2">{g.title}</p>
            <div className="space-y-2">
              {g.keys.map(({ key, label, hint }) => {
                const valid = isValidColor(colors[key]);
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={toHex(colors[key])}
                      onChange={(e) => setColors((c) => ({ ...c, [key]: withHex(c[key], e.target.value) }))}
                      className="w-8 h-8 rounded-lg border border-border/40 bg-transparent cursor-pointer shrink-0 p-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary leading-tight">{label}</p>
                      <p className="text-[10px] text-text-muted truncate">{hint}</p>
                    </div>
                    <input
                      value={colors[key]}
                      onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                      spellCheck={false}
                      className={`w-[120px] px-2 py-1 rounded-md bg-bg-primary/50 border text-[11px] font-mono text-text-primary focus:outline-none ${
                        valid ? 'border-border/40 focus:border-accent' : 'border-error'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border/40 space-y-2">
        {error && <p className="text-[11px] text-error">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setColors(startColors.current)}
            title="Undo all colour changes"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/40 text-[11px] font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            onClick={exportJson}
            title="Save as a .json file to share"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/40 text-[11px] font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
          >
            <Download size={12} /> Export
          </button>
          <button
            onClick={save}
            disabled={!draft.name}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-[11px] font-semibold hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={12} /> Save theme
          </button>
        </div>
      </div>
    </div>, document.body)
  );
}
