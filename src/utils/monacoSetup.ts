import type * as Monaco from 'monaco-editor';
import { cssVar } from '../hooks/useAppTheme';

type MonacoApi = typeof Monaco;

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

/** Whole file names that decide the language on their own. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  'nginx.conf': 'nginx',
  '.bashrc': 'shell',
  '.bash_profile': 'shell',
  '.bash_aliases': 'shell',
  '.profile': 'shell',
  '.zshrc': 'shell',
  '.zprofile': 'shell',
  crontab: 'shell',
  gemfile: 'ruby',
  rakefile: 'ruby',
  vagrantfile: 'ruby',
  procfile: 'yaml',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
  '.gitconfig': 'ini',
  syslog: 'log',
  messages: 'log',
};

const BY_EXT: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json', webmanifest: 'json',
  yaml: 'yaml', yml: 'yaml',
  md: 'markdown', markdown: 'markdown', mdx: 'mdx',
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell',
  ps1: 'powershell', psm1: 'powershell', bat: 'bat', cmd: 'bat',
  py: 'python', pyw: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  php: 'php', java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', swift: 'swift', dart: 'dart',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp',
  lua: 'lua', pl: 'perl', pm: 'perl', r: 'r', ex: 'elixir', exs: 'elixir',
  html: 'html', htm: 'html', vue: 'html', css: 'css', scss: 'scss', less: 'less',
  twig: 'twig', hbs: 'handlebars', handlebars: 'handlebars', pug: 'pug',
  sql: 'sql', xml: 'xml', svg: 'xml', plist: 'xml',
  graphql: 'graphql', gql: 'graphql', proto: 'protobuf', tf: 'hcl', tfvars: 'hcl', hcl: 'hcl',
  rst: 'restructuredtext', dockerfile: 'dockerfile',
  // key = value style files: ini, toml, .env, systemd units
  ini: 'ini', cfg: 'ini', cnf: 'ini', conf: 'ini', properties: 'ini', toml: 'ini', env: 'ini',
  service: 'ini', socket: 'ini', timer: 'ini', mount: 'ini', target: 'ini', path: 'ini', slice: 'ini', automount: 'ini',
  log: 'log', nginx: 'nginx',
};

/** Pick a Monaco language for a file, using its name and folder as well as its extension. */
export function languageFromPath(path: string): string {
  if (path.startsWith('notes://')) return 'markdown';
  const full = path.replace(/\\/g, '/').toLowerCase();
  const name = full.split('/').pop() || '';

  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) return 'dockerfile';
  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) return 'ini';
  if (/\.log(\.\d+)?$/.test(name) || (full.includes('/var/log/') && !/\.(gz|xz|zst|bz2)$/.test(name))) return 'log';
  // nginx keeps its configs in /etc/nginx, often with no extension in sites-available
  const inNginxDir = full.includes('/nginx/') || full.includes('/sites-available/') || full.includes('/sites-enabled/');
  if (inNginxDir && (name.endsWith('.conf') || !name.includes('.'))) return 'nginx';

  const ext = name.includes('.') ? name.split('.').pop()! : '';
  return BY_EXT[ext] ?? 'plaintext';
}

/** Languages offered in the status bar picker. */
export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'shell', label: 'Shell' },
  { value: 'nginx', label: 'Nginx' },
  { value: 'ini', label: 'INI, .env, systemd' },
  { value: 'yaml', label: 'YAML' },
  { value: 'json', label: 'JSON' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'log', label: 'Log' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'php', label: 'PHP' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'java', label: 'Java' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'xml', label: 'XML' },
  { value: 'powershell', label: 'PowerShell' },
];

export function languageLabel(id: string): string {
  return LANGUAGE_OPTIONS.find((l) => l.value === id)?.label ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Files that can break on a Linux server when saved with Windows (CRLF) line endings. */
export const CRLF_SENSITIVE = new Set(['shell', 'dockerfile', 'ini', 'nginx', 'python', 'perl', 'ruby', 'yaml']);

// ---------------------------------------------------------------------------
// Extra languages: nginx and log files
// ---------------------------------------------------------------------------

let languagesRegistered = false;

export function registerServerLanguages(monaco: MonacoApi) {
  if (languagesRegistered) return;
  languagesRegistered = true;

  monaco.languages.register({ id: 'nginx', aliases: ['Nginx', 'nginx'] });
  monaco.languages.setLanguageConfiguration('nginx', {
    comments: { lineComment: '#' },
    brackets: [['{', '}']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider('nginx', {
    blocks: ['http', 'server', 'location', 'upstream', 'events', 'stream', 'map', 'geo', 'if', 'types', 'limit_except', 'split_clients', 'mail'],
    tokenizer: {
      // a statement starts with its directive name...
      root: [
        { include: '@whitespace' },
        [/[a-zA-Z_][\w.-]*/, { cases: { '@blocks': { token: 'type', next: '@args' }, '@default': { token: 'keyword', next: '@args' } } }],
        [/[{}]/, 'delimiter.bracket'],
        [/;/, 'delimiter'],
      ],
      // ...followed by arguments until ; or {
      args: [
        { include: '@whitespace' },
        [/;/, { token: 'delimiter', next: '@pop' }],
        [/[{}]/, { token: 'delimiter.bracket', next: '@pop' }],
        [/"/, { token: 'string', next: '@dstring' }],
        [/'/, { token: 'string', next: '@sstring' }],
        [/\$\{?\w+\}?/, 'variable'],
        [/\b(on|off|default_server|ssl|http2|permanent|redirect|last|break|always)\b/, 'keyword.flow'],
        [/~\*?|\^~|=/, 'operator'],
        [/\d+(\.\d+)?[kKmMgGsShdwy]?(?=[\s;])/, 'number'],
        [/[^\s;{}"'#$]+/, ''],
      ],
      whitespace: [
        [/\s+/, ''],
        [/#.*$/, 'comment'],
      ],
      dstring: [
        [/[^\\"$]+/, 'string'],
        [/\$\{?\w+\}?/, 'variable'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string', next: '@pop' }],
      ],
      sstring: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, { token: 'string', next: '@pop' }],
      ],
    },
  } as Monaco.languages.IMonarchLanguage);

  monaco.languages.register({ id: 'log', aliases: ['Log', 'log'] });
  monaco.languages.setMonarchTokensProvider('log', {
    tokenizer: {
      root: [
        // timestamps: ISO, syslog, nginx access and error logs
        [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}([.,]\d+)?(Z|[+-]\d{2}:?\d{2})?/, 'log.date'],
        [/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/, 'log.date'],
        [/\[\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4}\]/, 'log.date'],
        [/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/, 'log.date'],
        [/\b(ERROR|ERR|FATAL|CRIT|CRITICAL|EMERG|ALERT|PANIC|SEVERE|FAILED|FAILURE|error|fatal|crit|emerg|alert|failed|Exception|Traceback)\b/, 'log.error'],
        [/\b(WARN|WARNING|warn|warning|NOTICE|notice)\b/, 'log.warn'],
        [/\b(INFO|info)\b/, 'log.info'],
        [/\b(DEBUG|TRACE|VERBOSE|debug|trace)\b/, 'log.debug'],
        [/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/, 'log.ip'],
        [/"[^"]*"/, 'log.string'],
      ],
    },
  } as Monaco.languages.IMonarchLanguage);
}

// ---------------------------------------------------------------------------
// Theme from the app's own colours
// ---------------------------------------------------------------------------

/** CSS colour (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) to #rrggbb or #rrggbbaa. */
export function toHex(color: string, fallback: string): string {
  const s = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return s;
  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return fallback;
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return '#' + hex(+m[1]) + hex(+m[2]) + hex(+m[3]) + (a < 1 ? hex(a * 255) : '');
}

const solid = (hex: string) => hex.slice(0, 7);
const alpha = (hex: string, aa: string) => solid(hex) + aa;

export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const SEROP_EDITOR_THEME = 'serop';

/**
 * (Re)define the "serop" editor theme from the current app theme's CSS variables, so built-in and custom
 * themes both reach the editor. The editor background is transparent so it sits on the app's own panel colour.
 */
export function defineSeropTheme(monaco: MonacoApi) {
  const c = (name: string, fallback: string) => toHex(cssVar(name, fallback), fallback);
  const text = c('--color-text-primary', '#cccccc');
  const secondary = c('--color-text-secondary', '#858585');
  const muted = c('--color-text-muted', '#6e7681');
  const accent = c('--color-accent', '#0078d4');
  const border = c('--color-border', '#3c3c3c');
  const success = c('--color-success', '#4ec9b0');
  const warning = c('--color-warning', '#dcdcaa');
  const error = c('--color-error', '#f14c4c');
  const light = luminance(solid(text)) < 0.5; // dark text means a light theme
  const popover = solid(c('--popover-base', light ? '#ffffff' : '#1c1d21'));
  const transparent = '#00000000';

  monaco.editor.defineTheme(SEROP_EDITOR_THEME, {
    base: light ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [
      { token: 'log.error', foreground: solid(error).slice(1), fontStyle: 'bold' },
      { token: 'log.warn', foreground: solid(warning).slice(1) },
      { token: 'log.info', foreground: solid(accent).slice(1) },
      { token: 'log.debug', foreground: solid(muted).slice(1) },
      { token: 'log.date', foreground: solid(success).slice(1) },
      { token: 'log.ip', foreground: solid(secondary).slice(1) },
      { token: 'log.string', foreground: light ? 'a31515' : 'ce9178' },
    ],
    colors: {
      'editor.background': transparent,
      'editorGutter.background': transparent,
      'minimap.background': transparent,
      'editor.foreground': solid(text),
      'editorLineNumber.foreground': solid(muted),
      'editorLineNumber.activeForeground': solid(secondary),
      'editorCursor.foreground': solid(accent),
      'editor.selectionBackground': alpha(accent, '55'),
      'editor.inactiveSelectionBackground': alpha(accent, '2e'),
      'editor.selectionHighlightBackground': alpha(accent, '22'),
      'editor.lineHighlightBackground': alpha(text, '0a'),
      'editor.lineHighlightBorder': transparent,
      'editor.findMatchBackground': alpha(warning, '55'),
      'editor.findMatchHighlightBackground': alpha(warning, '2a'),
      'editorBracketMatch.background': alpha(accent, '22'),
      'editorBracketMatch.border': alpha(accent, '99'),
      'editorIndentGuide.background1': alpha(border, '80'),
      'editorIndentGuide.activeBackground1': alpha(secondary, '99'),
      'editorWhitespace.foreground': alpha(muted, '66'),
      'editorWidget.background': popover,
      'editorWidget.border': solid(border),
      'editorSuggestWidget.background': popover,
      'editorSuggestWidget.border': solid(border),
      'editorSuggestWidget.selectedBackground': alpha(accent, '33'),
      'editorHoverWidget.background': popover,
      'editorHoverWidget.border': solid(border),
      'input.background': popover,
      'input.border': solid(border),
      focusBorder: alpha(accent, 'aa'),
      'scrollbarSlider.background': alpha(secondary, '33'),
      'scrollbarSlider.hoverBackground': alpha(secondary, '55'),
      'scrollbarSlider.activeBackground': alpha(secondary, '77'),
    },
  });
}
