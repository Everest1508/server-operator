import type { AppTheme } from '../types';

/** A theme a customer supplies as JSON. Colors they leave out come from the base theme. */
export interface CustomTheme {
  id: string;
  name: string;
  description: string;
  base: 'dark' | 'light';
  colors: Partial<Record<ThemeColorKey, string>>;
}

export type ThemeColorKey =
  | 'bgPrimary' | 'bgSecondary' | 'bgTertiary' | 'bgActivity' | 'border'
  | 'textPrimary' | 'textSecondary' | 'textMuted'
  | 'accent' | 'accentHover' | 'success' | 'warning' | 'error' | 'inputBg';

/** JSON key to the CSS variable it sets. */
export const THEME_COLOR_VARS: Record<ThemeColorKey, string> = {
  bgPrimary: '--color-bg-primary',
  bgSecondary: '--color-bg-secondary',
  bgTertiary: '--color-bg-tertiary',
  bgActivity: '--color-bg-activity',
  border: '--color-border',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
  accent: '--color-accent',
  accentHover: '--color-accent-hover',
  success: '--color-success',
  warning: '--color-warning',
  error: '--color-error',
  inputBg: '--color-input-bg',
};

const THEME_STORAGE_KEY = 'server-operator:theme';
const CUSTOM_THEMES_KEY = 'server-operator:custom-themes';
const CUSTOM_PREFIX = 'custom:';
const MAX_JSON_CHARS = 20000;
const MAX_CUSTOM_THEMES = 20;
const BUILT_IN: AppTheme[] = ['default', 'glassy', 'light', 'tokyo-night'];

export const THEME_TEMPLATE = `{
  "name": "My Brand",
  "description": "Dark theme with a green accent",
  "base": "dark",
  "colors": {
    "bgPrimary": "#101418",
    "bgSecondary": "#161b22",
    "bgTertiary": "#1c232c",
    "bgActivity": "#0d1117",
    "border": "#2a323d",
    "textPrimary": "#e6edf3",
    "textSecondary": "#9aa7b4",
    "textMuted": "#6b7785",
    "accent": "#2ea043",
    "accentHover": "#3fb950",
    "success": "#3fb950",
    "warning": "#d29922",
    "error": "#f85149",
    "inputBg": "#161b22"
  }
}
`;

function isValidColor(value: string): boolean {
  if (value.length > 80 || /[;{}<>\\]|url\(|expression\(|@import/i.test(value)) return false;
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') return CSS.supports('color', value);
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^)]*\)|[a-z]+)$/i.test(value.trim());
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export type ParseResult = { ok: true; theme: CustomTheme; ignored: string[] } | { ok: false; error: string };

export function parseThemeJson(text: string): ParseResult {
  if (text.length > MAX_JSON_CHARS) return { ok: false, error: 'Theme file is too large (max 20 KB).' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'Not valid JSON: ' + (e instanceof Error ? e.message : String(e)) };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Theme must be a JSON object.' };
  const obj = raw as Record<string, unknown>;

  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 40) : '';
  if (!name) return { ok: false, error: 'Theme needs a "name".' };
  const id = slugify(typeof obj.id === 'string' && obj.id ? obj.id : name);
  if (!id) return { ok: false, error: 'Theme name must contain letters or numbers.' };
  const base = obj.base === 'light' ? 'light' : obj.base === 'dark' || obj.base === undefined ? 'dark' : null;
  if (!base) return { ok: false, error: '"base" must be "dark" or "light".' };

  const colorsIn = obj.colors;
  if (!colorsIn || typeof colorsIn !== 'object' || Array.isArray(colorsIn)) {
    return { ok: false, error: 'Theme needs a "colors" object.' };
  }
  const colors: CustomTheme['colors'] = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(colorsIn as Record<string, unknown>)) {
    if (!(key in THEME_COLOR_VARS)) {
      ignored.push(`${key} (unknown color)`);
    } else if (typeof value !== 'string' || !isValidColor(value.trim())) {
      return { ok: false, error: `"${key}" is not a valid CSS color.` };
    } else {
      colors[key as ThemeColorKey] = value.trim();
    }
  }
  if (Object.keys(colors).length === 0) return { ok: false, error: 'No usable colors found in "colors".' };

  const description = typeof obj.description === 'string' ? obj.description.trim().slice(0, 120) : '';
  return { ok: true, theme: { id, name, description: description || 'Custom theme.', base, colors }, ignored };
}

export function loadCustomThemes(): CustomTheme[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    // Re-validate on every load so a hand-edited storage entry cannot inject anything.
    return parsed
      .map((t) => parseThemeJson(JSON.stringify(t)))
      .flatMap((r) => (r.ok ? [r.theme] : []));
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: CustomTheme[]) {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  } catch {
    // ignore
  }
}

/** Adds or replaces (same id) a custom theme. Returns the new list, or an error. */
export function addCustomTheme(theme: CustomTheme): { ok: true; themes: CustomTheme[] } | { ok: false; error: string } {
  const existing = loadCustomThemes().filter((t) => t.id !== theme.id);
  if (existing.length >= MAX_CUSTOM_THEMES) return { ok: false, error: `You can keep up to ${MAX_CUSTOM_THEMES} custom themes.` };
  const themes = [...existing, theme];
  saveCustomThemes(themes);
  return { ok: true, themes };
}

export function removeCustomTheme(id: string): CustomTheme[] {
  const themes = loadCustomThemes().filter((t) => t.id !== id);
  saveCustomThemes(themes);
  return themes;
}

export const customChoiceId = (id: string) => CUSTOM_PREFIX + id;

/** The saved choice: a built-in theme name, or "custom:<id>". Falls back to "default". */
export function loadThemeChoice(): string {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY) || '';
    if ((BUILT_IN as string[]).includes(raw)) return raw;
    // Folder themes load after startup, so do not check the id exists here.
    if (raw.startsWith(CUSTOM_PREFIX)) return raw;
  } catch {
    // ignore
  }
  return 'default';
}

/**
 * Applies a theme to the page and saves the choice.
 * A custom theme sets data-app-theme to its base ("default" or "light"), then overrides the colors it defines.
 */
export function applyTheme(choice: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const cssVar of Object.values(THEME_COLOR_VARS)) root.style.removeProperty(cssVar);
  delete root.dataset.customTheme;

  const custom = choice.startsWith(CUSTOM_PREFIX) ? findTheme(choice) : undefined;
  if (choice.startsWith(CUSTOM_PREFIX) && !custom) {
    // Theme not found (yet). Show the default look but keep the saved choice.
    root.dataset.appTheme = 'default';
    return;
  }
  if (custom) {
    root.dataset.appTheme = custom.base === 'light' ? 'light' : 'default';
    root.dataset.customTheme = custom.id;
    for (const [key, value] of Object.entries(custom.colors)) {
      root.style.setProperty(THEME_COLOR_VARS[key as ThemeColorKey], value as string);
    }
  } else {
    root.dataset.appTheme = (BUILT_IN as string[]).includes(choice) ? choice : 'default';
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, custom ? choice : root.dataset.appTheme!);
  } catch {
    // ignore
  }
}

export type ThemeSource = 'installer' | 'admin' | 'user' | 'imported';
export type ListedTheme = CustomTheme & { source: ThemeSource };

let folderThemes: ListedTheme[] = [];
export const THEMES_CHANGED_EVENT = 'serop-themes-changed';

/** Reads theme files from the installer, admin and user folders. Later folders win on the same id. */
export async function loadFolderThemes(): Promise<{ themes: ListedTheme[]; problems: string[] }> {
  const files = (await window.serverOperator?.loadThemeFolders?.().catch(() => [])) ?? [];
  const byId = new Map<string, ListedTheme>();
  const problems: string[] = [];
  for (const f of files) {
    if (!f.text) {
      problems.push(`${f.file}: ${f.error ?? 'could not be read'}`);
      continue;
    }
    const result = parseThemeJson(f.text);
    if (!result.ok) {
      problems.push(`${f.file}: ${result.error}`);
      continue;
    }
    byId.set(result.theme.id, { ...result.theme, source: f.source });
  }
  folderThemes = [...byId.values()];
  window.dispatchEvent(new Event(THEMES_CHANGED_EVENT));
  return { themes: folderThemes, problems };
}

/** Folder themes plus themes imported through Settings. An imported theme replaces a folder theme with the same id. */
export function listAllThemes(): ListedTheme[] {
  const byId = new Map<string, ListedTheme>(folderThemes.map((t) => [t.id, t]));
  for (const t of loadCustomThemes()) byId.set(t.id, { ...t, source: 'imported' });
  return [...byId.values()];
}

function findTheme(choice: string): CustomTheme | undefined {
  return listAllThemes().find((t) => customChoiceId(t.id) === choice);
}
